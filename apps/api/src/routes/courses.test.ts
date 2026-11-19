import { MODE_TOPICS } from "@speakup/shared";
import { describe, expect, it } from "vitest";
import { buildTestServer, FakeDb } from "../testing/fakes.js";

const auth = { authorization: "Bearer valid:clerk_1" };

/** Builds a server; the first request provisions user_1 so tests can upgrade them. */
async function setup({ pro = false } = {}) {
  const db = new FakeDb();
  const app = await buildTestServer({ db });
  await app.inject({ method: "GET", url: "/v1/me", headers: auth });
  if (pro) db.makePro("user_1");
  return { app, db };
}

describe("GET /v1/courses", () => {
  it("free user: Lesson 1 unlocked, paid lessons locked", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/v1/courses", headers: auth });
    expect(res.statusCode).toBe(200);
    const lessons = res.json().courses[0].lessons;
    expect(lessons.map((l: { slug: string; locked: boolean }) => [l.slug, l.locked])).toEqual([
      ["find-your-pace", false],
      ["power-of-the-pause", true],
    ]);
  });

  it("pro user: everything unlocked", async () => {
    const { app } = await setup({ pro: true });
    const res = await app.inject({ method: "GET", url: "/v1/courses", headers: auth });
    expect(res.json().courses[0].lessons.every((l: { locked: boolean }) => !l.locked)).toBe(true);
  });

  it("requires auth", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/v1/courses" });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /v1/lessons/:slug", () => {
  it("free user can open the free lesson, with exercises and without internal fields", async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: "GET",
      url: "/v1/lessons/find-your-pace",
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const { lesson } = res.json();
    expect(lesson.title).toBe("Find your pace");
    expect(lesson.course).toEqual({
      slug: "speak-with-confidence",
      title: "Speak with Confidence",
    });
    expect(lesson.exercises[0]).toMatchObject({ slug: "find-your-pace-read", type: "read_aloud" });
    expect(lesson).not.toHaveProperty("isFree");
  });

  it("free user gets 403 LESSON_LOCKED for a paid lesson — and no content leaks", async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: "GET",
      url: "/v1/lessons/power-of-the-pause",
      headers: auth,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("LESSON_LOCKED");
    expect(res.body).not.toContain("## Pauses");
  });

  it("pro user can open a paid lesson", async () => {
    const { app } = await setup({ pro: true });
    const res = await app.inject({
      method: "GET",
      url: "/v1/lessons/power-of-the-pause",
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lesson.videoUrl).toBe("https://example.com/v.mp4");
  });

  it("404 for an unknown lesson", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/v1/lessons/nope", headers: auth });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("400 for a malformed slug", async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: "GET",
      url: "/v1/lessons/Bad_Slug!",
      headers: auth,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /v1/exercises/baseline", () => {
  it("returns the baseline exercise", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/v1/exercises/baseline", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().exercise).toMatchObject({ slug: "baseline", type: "read_aloud" });
  });

  it("500 with a generic message if the DB was never seeded (details only in logs)", async () => {
    const { app, db } = await setup();
    db.content.baseline = null;
    const res = await app.inject({ method: "GET", url: "/v1/exercises/baseline", headers: auth });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe("INTERNAL");
    expect(res.body).not.toContain("db:seed");
  });
});

describe("lesson summaries", () => {
  it("include the lesson's exercise slugs (for progress)", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/v1/courses", headers: auth });
    expect(res.json().courses[0].lessons[0].exerciseSlugs).toEqual(["find-your-pace-read"]);
  });
});

describe("GET /v1/exercises/practice", () => {
  it("returns the standalone practice exercises to a free user", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/v1/exercises/practice", headers: auth });
    expect(res.statusCode).toBe(200);
    const slugs = res.json().exercises.map((e: { slug: string }) => e.slug);
    expect(slugs).toEqual(["drill-topic-coffee", "legend-gettysburg"]);
  });

  it("requires auth", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/v1/exercises/practice" });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /v1/practice/:mode/next", () => {
  const next = (app: Awaited<ReturnType<typeof setup>>["app"], query = "") =>
    app.inject({ method: "GET", url: `/v1/practice/topic/next${query}`, headers: auth });

  it("returns the mode's exercise and a topic from the bank", async () => {
    const { app } = await setup();
    const res = await next(app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.exercise.slug).toBe("mode-topic");
    expect(MODE_TOPICS.topic).toContain(body.topic);
    expect(body).toMatchObject({ done: 0, total: MODE_TOPICS.topic.length });
  });

  it("doesn't repeat a topic the user already answered", async () => {
    const { app, db } = await setup();
    const answered = MODE_TOPICS.topic.slice(1);
    for (const [i, topic] of answered.entries()) {
      await db.attempt.create({
        data: {
          id: `a_${i}`,
          userId: "user_1",
          exerciseId: "ex_mode-topic",
          mimeType: "audio/webm",
          audioKey: "k",
          topic,
        },
      });
    }
    const body = (await next(app)).json();
    expect(body.topic).toBe(MODE_TOPICS.topic[0]);
    expect(body.done).toBe(answered.length);
  });

  it("skips the topic the user passed on", async () => {
    const { app } = await setup();
    const first = (await next(app)).json().topic as string;
    const other = (await next(app, `?skip=${encodeURIComponent(first)}`)).json().topic;
    expect(other).not.toBe(first);
  });

  it("rejects an unknown mode and requires auth", async () => {
    const { app } = await setup();
    const unknown = await app.inject({
      method: "GET",
      url: "/v1/practice/nope/next",
      headers: auth,
    });
    expect(unknown.statusCode).toBe(400);
    const anon = await app.inject({ method: "GET", url: "/v1/practice/topic/next" });
    expect(anon.statusCode).toBe(401);
  });
});
