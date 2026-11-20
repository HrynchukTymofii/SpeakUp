// Scenario C — the daily quota under concurrency (docs/load-testing.md, bottleneck #4).
// Each fresh user fires BURST "create recording" requests at the same moment. The quota is
// checked by counting today's attempts and THEN inserting, so parallel requests can all see
// "under the limit". Every request over the limit is a paid analysis we didn't sell.
//
// Run against an API started with the normal free quota (FREE_DAILY_ANALYSES=3):
//   k6 run -e LOAD_TEST_AUTH_SECRET=… -e QUOTA=3 load-tests/scenarios/quota-race.js
import http from "k6/http";
import { Counter } from "k6/metrics";
import { BASE_URL, tokenFor } from "../lib/client.js";

const QUOTA = Number(__ENV.QUOTA || 3);
const BURST = Number(__ENV.BURST || 10);
const USERS = Number(__ENV.USERS || 20);

/** Recordings created beyond the daily quota (should be 0). */
const overQuota = new Counter("quota_overrun");
const accepted = new Counter("quota_accepted");

export const options = {
  scenarios: {
    race: { executor: "per-vu-iterations", vus: USERS, iterations: 1, maxDuration: "2m" },
  },
  thresholds: { quota_overrun: ["count==0"] },
};

export default function () {
  const token = tokenFor(`quota_${__VU}`);
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  // Create the user first, so the burst races only on the quota (not on user creation).
  const next = http.get(`${BASE_URL}/v1/practice/topic/next`, { headers });
  const { exercise, topic } = next.json();

  const body = JSON.stringify({ exerciseId: exercise.id, mimeType: "audio/webm", topic });
  const responses = http.batch(
    Array.from({ length: BURST }, () => ({
      method: "POST",
      url: `${BASE_URL}/v1/attempts`,
      body,
      params: { headers, tags: { name: "POST /attempts (burst)" } },
    })),
  );
  const ok = responses.filter((r) => r.status === 201).length;
  accepted.add(ok);
  overQuota.add(Math.max(0, ok - QUOTA));
}
