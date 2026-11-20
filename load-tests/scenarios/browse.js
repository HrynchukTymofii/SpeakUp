// Scenario A — API only (docs/load-testing.md): signed-in people moving around the app
// without recording. Measures the API + Postgres read path; the worker is idle.
//
//   k6 run -e LOAD_TEST_AUTH_SECRET=… -e PROFILE=steps -e PEAK=500 load-tests/scenarios/browse.js
//
// -e THINK=0.1 shortens every pause 10×: the same VUs then send ~10× the requests. Use it to
// find the API's request-rate limit without needing tens of thousands of VUs on one laptop.
import { sleep } from "k6";
import { api, between, tokenFor } from "../lib/client.js";
import { stages } from "../lib/profiles.js";

const THINK = Number(__ENV.THINK || 1);
const pause = (min, max) => sleep(between(min, max) * THINK);

export const options = {
  scenarios: { browse: { executor: "ramping-vus", startVUs: 0, stages: stages() } },
  thresholds: {
    // Pass/fail lines for the run (they don't stop it): under 1% errors, p95 under 500 ms.
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export default function () {
  const token = tokenFor(__VU);

  // What the app loads when someone opens it: the profile, the home page, the practice tab.
  api("GET", "/me", token);
  pause(1, 3);
  api("GET", "/courses", token);
  pause(2, 5);
  api("GET", "/exercises/practice", token);
  api("GET", "/attempts?limit=50", token, { name: "/attempts?limit=50" });
  pause(2, 5);
  api("GET", "/practice/topic/next", token, { name: "/practice/:mode/next" });
  pause(3, 8);
}
