import { DEFAULT_FUNNEL_DEFINITION, type FunnelDefinition } from "@speakup/shared";
import { describe, expect, it } from "vitest";
import { buildTestServer, FakeDb } from "../testing/fakes.js";

const ADMIN = { authorization: "Bearer valid:user_admin" };
const NOT_ADMIN = { authorization: "Bearer valid:user_someone" };
const env = { ADMIN_CLERK_USER_IDS: ["user_admin"] };

const DAY = 24 * 60 * 60 * 1000;

/** The default funnel's first three screens: a valid, shorter funnel to save as a draft. */
/** `main`'s updatedAt in setup(): what an admin who just opened the editor sends back. */
const LOADED = "2026-11-01T10:00:00.000Z";

const SHORT: FunnelDefinition = { version: 1, steps: DEFAULT_FUNNEL_DEFINITION.steps.slice(0, 3) };

function setup() {
  const db = new FakeDb();
  db.funnels.push(
    {
      id: "fn_main",
      slug: "main",
      name: "Main funnel",
      status: "live",
      version: 3,
      definition: DEFAULT_FUNNEL_DEFINITION,
      updatedAt: new Date("2026-11-01T10:00:00Z"),
    },
    {
      id: "fn_spring",
      slug: "spring-sale",
      name: "Spring sale",
      status: "draft",
      version: 1,
      definition: DEFAULT_FUNNEL_DEFINITION,
      updatedAt: new Date("2026-11-20T10:00:00Z"),
    },
  );
  return db;
}

function addSession(db: FakeDb, funnelId: string | null, ageDays: number, claimed: boolean) {
  db.funnelSessions.push({
    id: `fs_${db.funnelSessions.length}`,
    tokenHash: `t${db.funnelSessions.length}`,
    answers: {},
    currentStep: null,
    userId: null,
    ipHash: null,
    createdAt: new Date(Date.now() - ageDays * DAY),
    claimedAt: claimed ? new Date() : null,
    funnelId,
    funnelVersion: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    referrerHost: null,
  });
}

describe("admin access", () => {
  const routes = [
    { method: "GET", url: "/v1/admin/funnels" },
    { method: "PATCH", url: "/v1/admin/funnels/spring-sale/status", payload: { status: "live" } },
    {
      method: "POST",
      url: "/v1/admin/funnels/main/duplicate",
      payload: { slug: "copy", name: "Copy" },
    },
    { method: "GET", url: "/v1/admin/funnels/main" },
    {
      method: "PUT",
      url: "/v1/admin/funnels/main/draft",
      payload: { definition: SHORT, expectedUpdatedAt: LOADED },
    },
    { method: "DELETE", url: `/v1/admin/funnels/main/draft?expectedUpdatedAt=${LOADED}` },
    {
      method: "POST",
      url: "/v1/admin/funnels/main/publish",
      payload: { expectedUpdatedAt: LOADED },
    },
  ] as const;

  it("401 without a session", async () => {
    const app = await buildTestServer({ db: setup(), env });
    for (const route of routes) {
      const res = await app.inject(route);
      expect(res.statusCode).toBe(401);
    }
  });

  it("403 for a signed-in user who isn't on ADMIN_CLERK_USER_IDS, and nothing changes", async () => {
    const db = setup();
    const app = await buildTestServer({ db, env });
    for (const route of routes) {
      const res = await app.inject({ ...route, headers: NOT_ADMIN });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("FORBIDDEN");
    }
    expect(db.funnels.map((f) => [f.slug, f.status])).toEqual([
      ["main", "live"],
      ["spring-sale", "draft"],
    ]);
  });

  it("403 for everyone when no admins are configured", async () => {
    const app = await buildTestServer({ db: setup() });
    const res = await app.inject({ method: "GET", url: "/v1/admin/funnels", headers: ADMIN });
    expect(res.statusCode).toBe(403);
  });
});

describe("GET /v1/admin/funnels", () => {
  it("lists every funnel, drafts included, with 30-day session numbers", async () => {
    const db = setup();
    addSession(db, "fn_main", 1, true);
    addSession(db, "fn_main", 2, false);
    addSession(db, "fn_main", 40, true); // older than 30 days: not counted
    addSession(db, "fn_spring", 3, false);
    addSession(db, null, 1, true); // no funnel recorded
    const app = await buildTestServer({ db, env });

    const res = await app.inject({ method: "GET", url: "/v1/admin/funnels", headers: ADMIN });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.json()).toEqual({
      funnels: [
        {
          slug: "main",
          name: "Main funnel",
          status: "live",
          version: 3,
          updatedAt: "2026-11-01T10:00:00.000Z",
          hasDraft: false,
          sessions30d: { started: 2, signedUp: 1 },
        },
        {
          slug: "spring-sale",
          name: "Spring sale",
          status: "draft",
          version: 1,
          updatedAt: "2026-11-20T10:00:00.000Z",
          hasDraft: false,
          sessions30d: { started: 1, signedUp: 0 },
        },
      ],
    });
  });
});

describe("PATCH /v1/admin/funnels/:slug/status", () => {
  it("takes a draft live and back offline", async () => {
    const db = setup();
    const app = await buildTestServer({ db, env });
    const live = await app.inject({
      method: "PATCH",
      url: "/v1/admin/funnels/spring-sale/status",
      headers: ADMIN,
      payload: { status: "live" },
    });
    expect(live.statusCode).toBe(200);
    expect(live.json().funnel).toMatchObject({ slug: "spring-sale", status: "live", version: 1 });
    expect(db.funnels[1]?.status).toBe("live");

    const draft = await app.inject({
      method: "PATCH",
      url: "/v1/admin/funnels/spring-sale/status",
      headers: ADMIN,
      payload: { status: "draft" },
    });
    expect(draft.json().funnel.status).toBe("draft");
  });

  it("refuses to take main offline", async () => {
    const db = setup();
    const app = await buildTestServer({ db, env });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/admin/funnels/main/status",
      headers: ADMIN,
      payload: { status: "draft" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("WRONG_STATE");
    expect(db.funnels[0]?.status).toBe("live");
  });

  it("404 for an unknown slug, 400 for a bad status", async () => {
    const app = await buildTestServer({ db: setup(), env });
    const unknown = await app.inject({
      method: "PATCH",
      url: "/v1/admin/funnels/nope/status",
      headers: ADMIN,
      payload: { status: "live" },
    });
    expect(unknown.statusCode).toBe(404);
    const bad = await app.inject({
      method: "PATCH",
      url: "/v1/admin/funnels/spring-sale/status",
      headers: ADMIN,
      payload: { status: "archived" },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("refuses to take a funnel with an invalid stored definition live", async () => {
    const db = setup();
    db.funnels.push({
      id: "fn_broken",
      slug: "broken",
      name: "Broken",
      status: "draft",
      version: 1,
      definition: { nope: true },
      updatedAt: new Date(),
    });
    const app = await buildTestServer({ db, env });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/admin/funnels/broken/status",
      headers: ADMIN,
      payload: { status: "live" },
    });
    expect(res.statusCode).toBe(409);
    expect(db.funnels[2]?.status).toBe("draft");
  });
});

describe("POST /v1/admin/funnels/:slug/duplicate", () => {
  it("copies the definition into a new draft at version 1", async () => {
    const db = setup();
    const app = await buildTestServer({ db, env });
    const res = await app.inject({
      method: "POST",
      url: "/v1/admin/funnels/main/duplicate",
      headers: ADMIN,
      payload: { slug: "tiktok-nov", name: "  TikTok November  " },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().funnel).toMatchObject({
      slug: "tiktok-nov",
      name: "TikTok November",
      status: "draft",
      version: 1,
      sessions30d: { started: 0, signedUp: 0 },
    });
    const created = db.funnels.find((f) => f.slug === "tiktok-nov");
    expect(created?.definition).toEqual(DEFAULT_FUNNEL_DEFINITION);
    // A copy, not the same object: editing one later must not change the other.
    expect(created?.definition).not.toBe(db.funnels[0]?.definition);
  });

  it("409 when the new slug is taken, 404 when the source is unknown", async () => {
    const app = await buildTestServer({ db: setup(), env });
    const taken = await app.inject({
      method: "POST",
      url: "/v1/admin/funnels/main/duplicate",
      headers: ADMIN,
      payload: { slug: "spring-sale", name: "Again" },
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe("WRONG_STATE");

    const unknown = await app.inject({
      method: "POST",
      url: "/v1/admin/funnels/nope/duplicate",
      headers: ADMIN,
      payload: { slug: "new-one", name: "New" },
    });
    expect(unknown.statusCode).toBe(404);
  });

  it("400 for a slug that isn't URL-safe or an empty name", async () => {
    const app = await buildTestServer({ db: setup(), env });
    for (const payload of [
      { slug: "Bad Slug", name: "x" },
      { slug: "ok-slug", name: "   " },
    ]) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/admin/funnels/main/duplicate",
        headers: ADMIN,
        payload,
      });
      expect(res.statusCode).toBe(400);
    }
  });
});

describe("funnel editor: drafts and publishing", () => {
  type App = Awaited<ReturnType<typeof buildTestServer>>;
  const saveDraft = (app: App, definition: unknown, expectedUpdatedAt = LOADED) =>
    app.inject({
      method: "PUT",
      url: "/v1/admin/funnels/main/draft",
      headers: ADMIN,
      payload: { definition, expectedUpdatedAt },
    });
  const publish = (app: App, expectedUpdatedAt: string) =>
    app.inject({
      method: "POST",
      url: "/v1/admin/funnels/main/publish",
      headers: ADMIN,
      payload: { expectedUpdatedAt },
    });
  const discard = (app: App, expectedUpdatedAt: string) =>
    app.inject({
      method: "DELETE",
      url: `/v1/admin/funnels/main/draft?expectedUpdatedAt=${expectedUpdatedAt}`,
      headers: ADMIN,
    });

  it("GET returns what visitors see and the draft (none yet)", async () => {
    const app = await buildTestServer({ db: setup(), env });
    const res = await app.inject({ method: "GET", url: "/v1/admin/funnels/main", headers: ADMIN });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.json()).toMatchObject({
      funnel: { slug: "main", version: 3, hasDraft: false, updatedAt: LOADED },
      definition: DEFAULT_FUNNEL_DEFINITION,
      draft: null,
      draftInvalid: false,
    });
    const unknown = await app.inject({
      method: "GET",
      url: "/v1/admin/funnels/nope",
      headers: ADMIN,
    });
    expect(unknown.statusCode).toBe(404);
  });

  it("saves a draft without changing what visitors see", async () => {
    const db = setup();
    const app = await buildTestServer({ db, env });
    const res = await saveDraft(app, SHORT);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ funnel: { hasDraft: true, version: 3 }, draft: SHORT });
    expect(db.funnels[0]?.definition).toEqual(DEFAULT_FUNNEL_DEFINITION);
    expect(db.funnels[0]?.draftDefinition).toEqual(SHORT);
  });

  it("400 for a draft whose screens are in an order that breaks the funnel", async () => {
    const db = setup();
    const app = await buildTestServer({ db, env });
    const results = DEFAULT_FUNNEL_DEFINITION.steps.find((s) => s.type === "results");
    const res = await saveDraft(app, { version: 1, steps: [results, ...SHORT.steps] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("recording screen");
    expect(db.funnels[0]?.draftDefinition).toBeUndefined();
  });

  it("publishes the draft: visitors get it, the version goes up, the draft is cleared", async () => {
    const db = setup();
    const app = await buildTestServer({ db, env });
    const saved = (await saveDraft(app, SHORT)).json();
    const res = await publish(app, saved.funnel.updatedAt);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      funnel: { version: 4, hasDraft: false },
      definition: SHORT,
      draft: null,
    });
    expect(db.funnels[0]).toMatchObject({ definition: SHORT, draftDefinition: null, version: 4 });

    // Nothing left to publish.
    const again = await publish(app, res.json().funnel.updatedAt);
    expect(again.statusCode).toBe(409);
    expect(db.funnels[0]?.version).toBe(4);
  });

  it("refuses writes based on a stale view: a draft saved meanwhile is neither lost nor published unseen", async () => {
    const db = setup();
    const app = await buildTestServer({ db, env });
    // Admin A saves and keeps the editor open on that state.
    const seenByA = (await saveDraft(app, SHORT)).json().funnel.updatedAt;
    // Admin B, who loaded the same state, saves a different draft.
    const other: FunnelDefinition = { version: 1, steps: SHORT.steps.slice(0, 2) };
    expect((await saveDraft(app, other, seenByA)).statusCode).toBe(200);

    // A's publish, discard and save are all refused; B's draft stays and nothing goes live.
    for (const res of [
      await publish(app, seenByA),
      await discard(app, seenByA),
      await saveDraft(app, SHORT, seenByA),
    ]) {
      expect(res.statusCode).toBe(409);
      expect(res.json().error.message).toContain("changed somewhere else");
    }
    expect(db.funnels[0]).toMatchObject({
      version: 3,
      definition: DEFAULT_FUNNEL_DEFINITION,
      draftDefinition: other,
    });
  });

  it("discards the draft", async () => {
    const db = setup();
    const app = await buildTestServer({ db, env });
    const saved = (await saveDraft(app, SHORT)).json();
    const res = await discard(app, saved.funnel.updatedAt);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ funnel: { hasDraft: false, version: 3 }, draft: null });
    expect(db.funnels[0]?.draftDefinition).toBeNull();
  });

  it("a stored draft that no longer passes is flagged, can be discarded, and is never published", async () => {
    const db = setup();
    const main = db.funnels[0];
    if (main) main.draftDefinition = { version: 1, steps: [] };
    const app = await buildTestServer({ db, env });

    const res = await app.inject({ method: "GET", url: "/v1/admin/funnels/main", headers: ADMIN });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      funnel: { hasDraft: true },
      draft: null,
      draftInvalid: true,
    });

    expect((await publish(app, LOADED)).statusCode).toBe(409);
    expect(db.funnels[0]?.version).toBe(3);

    const discarded = await discard(app, LOADED);
    expect(discarded.statusCode).toBe(200);
    expect(discarded.json()).toMatchObject({ draftInvalid: false, funnel: { hasDraft: false } });
  });
});
