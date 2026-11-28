import { DEFAULT_FUNNEL_DEFINITION } from "@speakup/shared";
import { describe, expect, it } from "vitest";
import { buildTestServer, FakeDb } from "../testing/fakes.js";

const ADMIN = { authorization: "Bearer valid:user_admin" };
const NOT_ADMIN = { authorization: "Bearer valid:user_someone" };
const env = { ADMIN_CLERK_USER_IDS: ["user_admin"] };

const DAY = 24 * 60 * 60 * 1000;

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
          sessions30d: { started: 2, signedUp: 1 },
        },
        {
          slug: "spring-sale",
          name: "Spring sale",
          status: "draft",
          version: 1,
          updatedAt: "2026-11-20T10:00:00.000Z",
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
