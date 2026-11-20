import { describe, expect, it } from "vitest";
import { createAttemptEventHub } from "../services/attempt-events.js";
import { buildTestServer, FakeDb, FakeQueue, FakeStorage } from "../testing/fakes.js";

const auth = { authorization: "Bearer valid:clerk_1" };
const otherUser = { authorization: "Bearer valid:clerk_2" };

const FREE_EXERCISE = "ex_find-your-pace-read";
const PRO_EXERCISE = "ex_power-of-the-pause-read";
const BASELINE = "ex_baseline";

function attemptById(db: FakeDb, id: string) {
  const attempt = db.attempts.find((a) => a.id === id);
  if (!attempt) throw new Error(`attempt ${id} not in FakeDb`);
  return attempt;
}

function firstAttempt(db: FakeDb) {
  const attempt = db.attempts[0];
  if (!attempt) throw new Error("FakeDb has no attempts");
  return attempt;
}

const sampleMetrics = {
  durationSec: 30,
  totalSec: 32,
  wordCount: 71,
  wpm: 142,
  wpmTarget: { min: 130, max: 160 },
  pauses: { count: 0, longCount: 0, longestSec: 0, list: [] },
  fillers: { count: 0, perMinute: 0, list: [] },
  lowConfidenceWords: [],
  readAloud: null,
};
const sampleFeedback = {
  overallScore: 81,
  summary: "Nice and clear.",
  strengths: ["Good pace"],
  issues: [],
  nextStep: "Try a longer text.",
};

/** Builds a server; the first request provisions user_1 so tests can upgrade them. */
async function setup({ pro = false } = {}) {
  const db = new FakeDb();
  const storage = new FakeStorage();
  const queue = new FakeQueue();
  const events = createAttemptEventHub();
  const app = await buildTestServer({ db, storage, queue, events });
  await app.inject({ method: "GET", url: "/v1/me", headers: auth });
  if (pro) db.makePro("user_1");

  const create = (exerciseId: string, headers = auth, mimeType = "audio/webm;codecs=opus") =>
    app.inject({
      method: "POST",
      url: "/v1/attempts",
      headers,
      payload: { exerciseId, mimeType },
    });
  const submit = (id: string, durationMs = 30_000, headers = auth) =>
    app.inject({
      method: "POST",
      url: `/v1/attempts/${id}/submit`,
      headers,
      payload: { durationMs },
    });
  /** Creates an attempt and simulates the browser's S3 upload of `bytes` bytes. */
  const createAndUpload = async (exerciseId = FREE_EXERCISE, bytes = 50_000) => {
    const res = await create(exerciseId);
    const id: string = res.json().attempt.id;
    storage.objects.set(attemptById(db, id).audioKey, bytes);
    return id;
  };

  return { app, db, storage, queue, events, create, submit, createAndUpload };
}

describe("POST /v1/attempts", () => {
  it("creates an awaiting_upload attempt and returns a pre-signed upload", async () => {
    const { create, db, storage } = await setup();
    const res = await create(FREE_EXERCISE);

    expect(res.statusCode).toBe(201);
    const { attempt, upload } = res.json();
    expect(attempt).toMatchObject({ exerciseId: FREE_EXERCISE, status: "awaiting_upload" });
    expect(upload.fields.key).toBe(`recordings/user_1/${attempt.id}.webm`);
    // Codec parameters are stripped: S3 stores the base type.
    expect(storage.uploads).toEqual([
      { key: `recordings/user_1/${attempt.id}.webm`, contentType: "audio/webm" },
    ]);
    expect(db.attempts[0]).toMatchObject({ userId: "user_1", mimeType: "audio/webm" });
    // The storage layout is internal.
    expect(attempt).not.toHaveProperty("audioKey");
  });

  it("uses the .m4a extension for Safari's audio/mp4", async () => {
    const { create } = await setup();
    const res = await create(FREE_EXERCISE, auth, "audio/mp4");
    expect(res.json().upload.fields.key).toMatch(/\.m4a$/);
  });

  it("baseline exercise (no lesson) is open to free users", async () => {
    const { create } = await setup();
    expect((await create(BASELINE)).statusCode).toBe(201);
  });

  it("402 PAYWALL for a Pro exercise on the free plan", async () => {
    const { create, db } = await setup();
    const res = await create(PRO_EXERCISE);
    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe("PAYWALL");
    expect(db.attempts).toHaveLength(0);
  });

  it("Pro user can record a Pro exercise", async () => {
    const { create } = await setup({ pro: true });
    expect((await create(PRO_EXERCISE)).statusCode).toBe(201);
  });

  it("429 QUOTA_EXCEEDED once the daily limit is used", async () => {
    const { create, db } = await setup();
    db.attemptsToday = 3; // free limit in testEnv
    const res = await create(FREE_EXERCISE);
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("QUOTA_EXCEEDED");
  });

  it("holds the daily quota when requests arrive at the same moment", async () => {
    // Load test (docs/load-testing.md, run 4): 10 parallel creates against a quota of 3 let
    // 6 through, because each request counted before any of them inserted.
    const { create, db } = await setup();
    db.queryDelayMs = 5; // like a real DB round trip, so the requests overlap
    const results = await Promise.all(Array.from({ length: 10 }, () => create(FREE_EXERCISE)));
    const statuses = results.map((r) => r.statusCode);
    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 429)).toHaveLength(7);
    expect(db.attempts).toHaveLength(3);
  });

  it("attempts that failed on our side don't use up the quota; NO_SPEECH does", async () => {
    const { create, db } = await setup();
    for (let i = 0; i < 3; i++) await create(FREE_EXERCISE);
    expect((await create(FREE_EXERCISE)).statusCode).toBe(429);

    const [first, second] = db.attempts;
    if (!first || !second) throw new Error("expected attempts");
    Object.assign(first, { status: "failed", errorCode: "STT_FAILED" });
    expect((await create(FREE_EXERCISE)).statusCode).toBe(201); // refunded

    Object.assign(second, { status: "failed", errorCode: "NO_SPEECH" });
    expect((await create(FREE_EXERCISE)).statusCode).toBe(429); // still counts
  });

  it("stores the practice-mode topic and returns it", async () => {
    const { app, db } = await setup();
    const res = await app.inject({
      method: "POST",
      url: "/v1/attempts",
      headers: auth,
      payload: { exerciseId: "ex_mode-topic", mimeType: "audio/webm", topic: "  Your first job " },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().attempt.topic).toBe("Your first job");
    expect(attemptById(db, res.json().attempt.id).topic).toBe("Your first job");
  });

  it("400 for a topic that is too long", async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: "POST",
      url: "/v1/attempts",
      headers: auth,
      payload: { exerciseId: "ex_mode-topic", mimeType: "audio/webm", topic: "x".repeat(301) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("404 for an unknown exercise", async () => {
    const { create } = await setup();
    expect((await create("ex_nope")).statusCode).toBe(404);
  });

  it("400 for an unsupported audio type", async () => {
    const { create } = await setup();
    const res = await create(FREE_EXERCISE, auth, "video/mp4");
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("400 when the body tries to set the owner", async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: "POST",
      url: "/v1/attempts",
      headers: auth,
      payload: { exerciseId: FREE_EXERCISE, mimeType: "audio/webm", userId: "user_2" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("requires auth", async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: "POST",
      url: "/v1/attempts",
      payload: { exerciseId: FREE_EXERCISE, mimeType: "audio/webm" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /v1/attempts/:id/submit", () => {
  it("verifies the upload, marks the attempt queued and enqueues one job", async () => {
    const { submit, createAndUpload, queue, db, storage } = await setup();
    const id = await createAndUpload();

    const res = await submit(id, 31_500);
    expect(res.statusCode).toBe(202);
    expect(res.json().attempt).toMatchObject({ id, status: "queued", durationMs: 31_500 });
    expect(queue.enqueued).toEqual([id]);
    expect(firstAttempt(db).status).toBe("queued");
    // The "pending" tag is removed, so the lifecycle rule won't delete the recording.
    expect(storage.submitted).toEqual([firstAttempt(db).audioKey]);
  });

  it("is idempotent: a second submit returns 202 and doesn't enqueue again", async () => {
    const { submit, createAndUpload, queue } = await setup();
    const id = await createAndUpload();
    await submit(id);
    const res = await submit(id);
    expect(res.statusCode).toBe(202);
    expect(res.json().attempt.status).toBe("queued");
    expect(queue.enqueued).toEqual([id]);
  });

  it("409 UPLOAD_MISSING when nothing was uploaded", async () => {
    const { create, submit, queue, storage } = await setup();
    const id = (await create(FREE_EXERCISE)).json().attempt.id;
    const res = await submit(id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("UPLOAD_MISSING");
    expect(queue.enqueued).toEqual([]);
    expect(storage.submitted).toEqual([]);
  });

  it("409 UPLOAD_MISSING when the stored file is too small to be speech", async () => {
    const { submit, createAndUpload } = await setup();
    const id = await createAndUpload(FREE_EXERCISE, 100);
    expect((await submit(id)).json().error.code).toBe("UPLOAD_MISSING");
  });

  it("accepts a duration slightly over the limit (recorder stop latency)", async () => {
    const { submit, createAndUpload } = await setup();
    const id = await createAndUpload(); // fixture maxDurationSec = 60
    expect((await submit(id, 61_000)).statusCode).toBe(202);
  });

  it("400 when the duration is clearly over the exercise limit", async () => {
    const { submit, createAndUpload } = await setup();
    const id = await createAndUpload();
    expect((await submit(id, 90_000)).statusCode).toBe(400);
  });

  it("404 for another user's attempt (no existence leak)", async () => {
    const { app, submit, createAndUpload, queue } = await setup();
    const id = await createAndUpload();
    await app.inject({ method: "GET", url: "/v1/me", headers: otherUser });
    const res = await submit(id, 30_000, otherUser);
    expect(res.statusCode).toBe(404);
    expect(queue.enqueued).toEqual([]);
  });

  it("409 WRONG_STATE for a failed attempt", async () => {
    const { submit, createAndUpload, db } = await setup();
    const id = await createAndUpload();
    firstAttempt(db).status = "failed";
    const res = await submit(id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("WRONG_STATE");
  });

  it("if enqueueing fails, the attempt goes back to awaiting_upload so a retry works", async () => {
    const { submit, createAndUpload, queue, db } = await setup();
    const id = await createAndUpload();
    queue.failNext = true;

    expect((await submit(id)).statusCode).toBe(500);
    expect(firstAttempt(db).status).toBe("awaiting_upload");

    expect((await submit(id)).statusCode).toBe(202);
    expect(queue.enqueued).toEqual([id]);
  });
});

describe("GET /v1/attempts/:id", () => {
  it("returns the owner's attempt with its exercise, and no result before completion", async () => {
    const { app, create } = await setup();
    const id = (await create(FREE_EXERCISE)).json().attempt.id;
    const res = await app.inject({ method: "GET", url: `/v1/attempts/${id}`, headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.attempt).toMatchObject({ id, status: "awaiting_upload" });
    expect(body.exercise).toMatchObject({ id: FREE_EXERCISE, type: "read_aloud" });
    expect(body.result).toBeNull();
    expect(body.stage).toBe("awaiting_upload");
    expect(res.body).not.toContain("recordings/"); // the S3 key stays internal
  });

  it("returns transcript, metrics and feedback once completed", async () => {
    const { app, db, createAndUpload } = await setup();
    const id = await createAndUpload();
    attemptById(db, id).status = "completed";
    db.transcripts.set(id, { text: "Hello there", words: [] });
    db.analyses.set(id, { overallScore: 81, metrics: sampleMetrics, feedback: sampleFeedback });

    const res = await app.inject({ method: "GET", url: `/v1/attempts/${id}`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().stage).toBe("completed");
    expect(res.json().result).toMatchObject({
      overallScore: 81,
      transcript: { text: "Hello there" },
      metrics: { wpm: 142 },
      feedback: { summary: "Nice and clear." },
    });
  });

  it("doesn't load the transcript or analysis while the result is pending (polls stay cheap)", async () => {
    // Load test: 83% of API requests were these polls. Words + feedback JSON are only needed once.
    const { app, db, createAndUpload } = await setup();
    const id = await createAndUpload();
    attemptById(db, id).status = "processing";
    db.attemptQueries = [];

    await app.inject({ method: "GET", url: `/v1/attempts/${id}`, headers: auth });

    expect(db.attemptQueries).toHaveLength(1);
    const select = db.attemptQueries[0]?.select ?? {};
    expect(select).not.toHaveProperty("analysis");
    expect(JSON.stringify(select.transcript ?? {})).not.toContain("words");
  });

  it("reports transcribing vs analyzing while processing", async () => {
    const { app, db, createAndUpload } = await setup();
    const id = await createAndUpload();
    attemptById(db, id).status = "processing";
    const get = () => app.inject({ method: "GET", url: `/v1/attempts/${id}`, headers: auth });
    expect((await get()).json().stage).toBe("transcribing");
    db.transcripts.set(id, { text: "x", words: [] });
    expect((await get()).json().stage).toBe("analyzing");
  });

  it("500 (not a broken page) if a stored result doesn't match the schema", async () => {
    const { app, db, createAndUpload } = await setup();
    const id = await createAndUpload();
    attemptById(db, id).status = "completed";
    db.transcripts.set(id, { text: "x", words: [] });
    db.analyses.set(id, { overallScore: 81, metrics: { wpm: "fast" }, feedback: sampleFeedback });
    const res = await app.inject({ method: "GET", url: `/v1/attempts/${id}`, headers: auth });
    expect(res.statusCode).toBe(500);
  });

  it("404 for another user", async () => {
    const { app, create } = await setup();
    const id = (await create(FREE_EXERCISE)).json().attempt.id;
    await app.inject({ method: "GET", url: "/v1/me", headers: otherUser });
    const res = await app.inject({ method: "GET", url: `/v1/attempts/${id}`, headers: otherUser });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /v1/attempts/:id?wait= (long-polling)", () => {
  const tick = () => new Promise((r) => setTimeout(r, 20));
  const get = (
    app: Awaited<ReturnType<typeof setup>>["app"],
    id: string,
    wait: number,
    headers = auth,
  ) => app.inject({ method: "GET", url: `/v1/attempts/${id}?wait=${wait}`, headers });

  it("holds a pending attempt until the worker announces a change, then returns the new state", async () => {
    const { app, db, events, createAndUpload } = await setup();
    const id = await createAndUpload();
    attemptById(db, id).status = "queued";

    let answered = false;
    const pending = get(app, id, 5).then((res) => {
      answered = true;
      return res;
    });
    await tick();
    expect(answered).toBe(false); // the server is holding the request
    expect(events.waitingCount()).toBe(1);

    attemptById(db, id).status = "completed";
    db.transcripts.set(id, { text: "Hello there", words: [] });
    db.analyses.set(id, { overallScore: 81, metrics: sampleMetrics, feedback: sampleFeedback });
    events.notify(id);

    const res = await pending;
    expect(res.statusCode).toBe(200);
    expect(res.json().stage).toBe("completed");
    expect(res.json().result).toMatchObject({ overallScore: 81 });
    expect(events.waitingCount()).toBe(0);
  });

  it("answers at once when there is nothing to wait for", async () => {
    const { app, db, events, createAndUpload } = await setup();
    const id = await createAndUpload();
    attemptById(db, id).status = "completed";
    db.transcripts.set(id, { text: "x", words: [] });
    db.analyses.set(id, { overallScore: 81, metrics: sampleMetrics, feedback: sampleFeedback });

    const res = await get(app, id, 20);
    expect(res.json().stage).toBe("completed");
    expect(events.waitingCount()).toBe(0);
  });

  it("returns the unchanged state when the wait runs out", async () => {
    const { app, db, events, createAndUpload } = await setup();
    const id = await createAndUpload();
    attemptById(db, id).status = "processing";
    const res = await get(app, id, 1);
    expect(res.statusCode).toBe(200);
    expect(res.json().stage).toBe("transcribing");
    expect(events.waitingCount()).toBe(0);
  });

  it("rejects waits longer than 25 s (the load balancer drops idle requests at 60 s)", async () => {
    const { app, createAndUpload } = await setup();
    const id = await createAndUpload();
    expect((await get(app, id, 61)).statusCode).toBe(400);
  });

  it("never waits on another user's attempt", async () => {
    const { app, db, events, createAndUpload } = await setup();
    const id = await createAndUpload();
    attemptById(db, id).status = "queued";
    await app.inject({ method: "GET", url: "/v1/me", headers: otherUser });
    expect((await get(app, id, 5, otherUser)).statusCode).toBe(404);
    expect(events.waitingCount()).toBe(0);
  });
});

describe("GET /v1/attempts", () => {
  it("lists only the caller's attempts, newest first, with score and problems", async () => {
    const { app, db, create, createAndUpload } = await setup();
    const older = await createAndUpload();
    attemptById(db, older).status = "completed";
    attemptById(db, older).createdAt = new Date("2026-11-01T10:00:00Z");
    db.analyses.set(older, {
      overallScore: 64,
      metrics: { ...sampleMetrics, fillers: { count: 6, perMinute: 12, list: [] } },
      feedback: { ...sampleFeedback, subscores: [{ skill: "fillers", score: 40 }] },
    });
    const newer = (await create(BASELINE)).json().attempt.id;
    attemptById(db, newer).createdAt = new Date("2026-11-02T10:00:00Z");

    await app.inject({ method: "GET", url: "/v1/me", headers: otherUser });
    await create(FREE_EXERCISE, otherUser);

    const res = await app.inject({ method: "GET", url: "/v1/attempts", headers: auth });
    expect(res.statusCode).toBe(200);
    const { attempts } = res.json();
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      id: newer,
      exerciseSlug: "baseline",
      overallScore: null,
      subscores: null,
      problems: [],
    });
    expect(attempts[1]).toMatchObject({
      id: older,
      exerciseSlug: "find-your-pace-read",
      status: "completed",
      overallScore: 64,
      subscores: [{ skill: "fillers", score: 40 }],
      problems: ["fillers"],
    });
    expect(res.body).not.toContain("recordings/");
  });

  it("skips the analysis of a row whose stored result is invalid instead of failing", async () => {
    const { app, db, createAndUpload } = await setup();
    const id = await createAndUpload();
    attemptById(db, id).status = "completed";
    db.analyses.set(id, { overallScore: 70, metrics: { wpm: "fast" }, feedback: sampleFeedback });
    const res = await app.inject({ method: "GET", url: "/v1/attempts", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().attempts[0]).toMatchObject({ overallScore: 70, problems: [] });
  });

  it("honours ?limit and rejects out-of-range values", async () => {
    const { app, create } = await setup();
    await create(FREE_EXERCISE);
    await create(FREE_EXERCISE);
    const one = await app.inject({ method: "GET", url: "/v1/attempts?limit=1", headers: auth });
    expect(one.json().attempts).toHaveLength(1);
    const bad = await app.inject({ method: "GET", url: "/v1/attempts?limit=500", headers: auth });
    expect(bad.statusCode).toBe(400);
  });

  it("requires auth", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/v1/attempts" });
    expect(res.statusCode).toBe(401);
  });
});
