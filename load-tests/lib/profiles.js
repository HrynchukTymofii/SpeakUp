// Load shapes, picked with `-e PROFILE=<name>` (docs/load-testing.md). `-e PEAK=<vus>` scales
// them. Each VU (virtual user) behaves like one person using the app.
const PEAK = Number(__ENV.PEAK || 50);

export const PROFILES = {
  // 1 user for ~2 min (two recordings): does the script work at all? Run before anything bigger.
  smoke: [
    { duration: "1s", target: 1 },
    { duration: "2m", target: 1 },
  ],

  // Step up and hold each level, so every level gets its own steady-state numbers.
  // The level where errors or latency jump is the capacity limit.
  steps: [
    { duration: "30s", target: Math.round(PEAK * 0.1) },
    { duration: "1m", target: Math.round(PEAK * 0.1) },
    { duration: "30s", target: Math.round(PEAK * 0.25) },
    { duration: "1m", target: Math.round(PEAK * 0.25) },
    { duration: "30s", target: Math.round(PEAK * 0.5) },
    { duration: "1m", target: Math.round(PEAK * 0.5) },
    { duration: "30s", target: PEAK },
    { duration: "1m", target: PEAK },
    { duration: "30s", target: 0 },
  ],

  // Everyone arrives at once (a class starts, a post goes viral). Tests queueing + autoscaling.
  spike: [
    { duration: "10s", target: PEAK },
    { duration: "2m", target: PEAK },
    { duration: "20s", target: 0 },
  ],

  // Moderate load held for a while: finds leaks, slow drift, connection exhaustion.
  soak: [
    { duration: "1m", target: PEAK },
    { duration: "15m", target: PEAK },
    { duration: "30s", target: 0 },
  ],
};

export function stages() {
  const name = __ENV.PROFILE || "smoke";
  const profile = PROFILES[name];
  if (!profile) throw new Error(`Unknown PROFILE "${name}": ${Object.keys(PROFILES).join(", ")}`);
  return profile;
}
