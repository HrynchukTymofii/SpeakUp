// Scenario B — the full recording flow (docs/load-testing.md), exactly like the browser:
// get a topic → create the attempt → upload the audio straight to S3 → submit → wait for the
// result (long-polling, up to 60 s) → read the feedback → next recording.
// Exercises API + S3 + Redis queue + worker + Postgres. Run the worker with
// ANALYSIS_PROVIDERS=fake: no Deepgram / Anthropic calls, no provider cost.
//
//   k6 run -e LOAD_TEST_AUTH_SECRET=… -e PROFILE=steps -e PEAK=100 load-tests/scenarios/practice.js
//   (-e POLL=backoff: the client before long-polling; -e POLL=fixed: the one before that,
//   polling every 1.5 s)
import { sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { api, between, tokenFor, uploadToS3 } from "../lib/client.js";
import { stages } from "../lib/profiles.js";

// A 15 s synthetic recording (WebM/Opus, ~70 KB — what Chrome's MediaRecorder sends).
const AUDIO = open("../fixtures/speech-15s.webm", "b");
const AUDIO_MS = 15_000;

// Same as the results page (apps/web/lib/poll.ts): the API holds each request up to 20 s and
// answers when the worker announces a change. POLL=backoff asks every 1.5 s → 3 s → 5 s
// instead, POLL=fixed every 1.5 s (the clients before long-polling).
const MAX_POLL_MS = 60_000;
const FIXED_POLL = __ENV.POLL === "fixed";
const LONG_POLL = !__ENV.POLL;
const RESULT_WAIT_S = 20;
function nextPollDelay(elapsedMs) {
  if (FIXED_POLL || elapsedMs < 10_000) return 1_500;
  return elapsedMs < 30_000 ? 3_000 : 5_000;
}

/** Submit → result visible to the user. The number a user actually feels. */
const resultWait = new Trend("result_wait_ms", true);
/** Share of recordings whose result didn't arrive within 60 s (the UI shows "taking longer"). */
const resultTimeouts = new Rate("result_timeouts");
/** Share of recordings that ended as `failed`. */
const resultFailed = new Rate("result_failed");
/** "Is it done yet?" requests: load that exists only because the client polls. */
const polls = new Counter("result_polls");

export const options = {
  scenarios: {
    practice: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: stages(),
      // When load ramps down, let a user who already submitted wait for their result.
      gracefulRampDown: "90s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:POST /attempts}": ["p(95)<500"],
    result_wait_ms: ["p(95)<20000"], // SPEC: feedback in 5–20 s
    result_timeouts: ["rate<0.01"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export default function () {
  const token = tokenFor(__VU);

  const next = api("GET", "/practice/topic/next", token, { name: "/practice/:mode/next" });
  if (next.status !== 200) return sleep(5);
  const { exercise, topic } = next.json();
  sleep(between(5, 10)); // reads the topic, thinks

  // Recording takes as long as the audio. Holding the VU here keeps the request rate honest.
  sleep(AUDIO_MS / 1000);

  const created = api("POST", "/attempts", token, {
    name: "POST /attempts",
    body: { exerciseId: exercise.id, mimeType: "audio/webm;codecs=opus", topic },
    expected: [201],
  });
  if (created.status !== 201) return sleep(5);
  const { attempt, upload } = created.json();

  if (uploadToS3(upload, AUDIO, "audio/webm").status >= 300) return sleep(5);

  const submitted = api("POST", `/attempts/${attempt.id}/submit`, token, {
    name: "POST /attempts/:id/submit",
    body: { durationMs: AUDIO_MS },
    expected: [202],
  });
  if (submitted.status !== 202) return sleep(5);

  // Wait for the result like the results page does.
  const start = Date.now();
  let status = "queued";
  let lastMs = 0;
  while (Date.now() - start < MAX_POLL_MS) {
    // Long-polling: ask again at once after a held request; back off if the API answered fast.
    if (!LONG_POLL || lastMs < 1_000) sleep(nextPollDelay(Date.now() - start) / 1000);
    polls.add(1);
    const query = LONG_POLL ? `?wait=${RESULT_WAIT_S}` : "";
    const res = api("GET", `/attempts/${attempt.id}${query}`, token, { name: "GET /attempts/:id" });
    lastMs = res.timings.duration;
    if (res.status !== 200) continue;
    status = res.json("attempt.status");
    if (status === "completed" || status === "failed") break;
  }

  const done = status === "completed" || status === "failed";
  resultTimeouts.add(!done);
  resultFailed.add(status === "failed");
  if (done) resultWait.add(Date.now() - start);

  sleep(between(15, 30)); // reads the feedback before the next try
}
