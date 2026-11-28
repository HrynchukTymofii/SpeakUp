import { Writable } from "node:stream";
import { DEFAULT_FUNNEL_DEFINITION } from "@speakup/shared";
import { describe, expect, it } from "vitest";
import { buildTestServer, FakeDb } from "../testing/fakes.js";

function setup(extra: FakeDb["funnels"] = []) {
  const db = new FakeDb();
  db.funnels.push(
    { slug: "main", status: "live", version: 3, definition: DEFAULT_FUNNEL_DEFINITION },
    { slug: "spring-sale", status: "draft", version: 1, definition: DEFAULT_FUNNEL_DEFINITION },
    ...extra,
  );
  return db;
}

describe("GET /v1/funnels/:slug", () => {
  it("returns a live funnel's definition with a cache header", async () => {
    const app = await buildTestServer({ db: setup() });
    const res = await app.inject({ method: "GET", url: "/v1/funnels/main" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=60, stale-while-revalidate=300");
    expect(res.json()).toEqual({
      funnel: { slug: "main", version: 3, definition: DEFAULT_FUNNEL_DEFINITION },
    });
    // Admin-only fields never reach visitors.
    expect(res.json().funnel).not.toHaveProperty("status");
  });

  it("404 for a draft or unknown slug", async () => {
    const app = await buildTestServer({ db: setup() });
    for (const slug of ["spring-sale", "nope"]) {
      const res = await app.inject({ method: "GET", url: `/v1/funnels/${slug}` });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
      // A funnel published a minute later must not stay hidden behind a cached 404.
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });

  it("400 for a non-URL-safe slug", async () => {
    const app = await buildTestServer({ db: setup() });
    const res = await app.inject({ method: "GET", url: "/v1/funnels/Bad%20Slug!" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("500 (not the raw JSON) when the stored definition is invalid", async () => {
    const lines: string[] = [];
    const logStream = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const db = setup([
      { slug: "broken", status: "live", version: 1, definition: { secret: "raw-db-json" } },
    ]);
    const app = await buildTestServer({ db, logStream });
    const res = await app.inject({ method: "GET", url: "/v1/funnels/broken" });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe("INTERNAL");
    expect(res.body).not.toContain("raw-db-json");
    expect(lines.some((line) => line.includes('"slug":"broken"'))).toBe(true);
  });

  it("needs no Authorization header", async () => {
    const app = await buildTestServer({ db: setup() });
    const res = await app.inject({
      method: "GET",
      url: "/v1/funnels/main",
      headers: { authorization: "Bearer garbage" },
    });
    // Public route: an invalid (or missing — see above) token is simply ignored.
    expect(res.statusCode).toBe(200);
  });
});
