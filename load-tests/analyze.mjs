// Turns a k6 raw CSV (`k6 run --out csv=raw.csv …`) into a per-minute table, so a step test
// shows WHEN things degraded, not just a whole-run average (docs/load-testing.md).
//
//   node load-tests/analyze.mjs raw.csv [samples.csv]
//
// Columns: users (max VUs that minute), API requests/s, API p95 (ms), polls (share of API
// requests that were "is it done yet?"), recordings finished, timeouts (no result in 60 s),
// result wait p50 / p95 (s). With a sample-local.sh CSV it adds max queue depth and Postgres
// transactions/s.
import { readFileSync } from "node:fs";

const [rawPath, samplesPath] = process.argv.slice(2);
if (!rawPath) throw new Error("usage: node load-tests/analyze.mjs raw.csv [samples.csv]");

const lines = readFileSync(rawPath, "utf8").trim().split("\n");
const header = lines[0].split(",");
const col = (name) => header.indexOf(name);
const [iMetric, iTime, iValue, iName] = ["metric_name", "timestamp", "metric_value", "name"].map(
  col,
);

const rows = lines.slice(1).map((line) => line.split(","));
const t0 = rows.reduce((min, r) => Math.min(min, Number(r[iTime])), Infinity);
const minutes = new Map();
const bucket = (t) => {
  const m = Math.floor((Number(t) - t0) / 60);
  if (!minutes.has(m)) {
    minutes.set(m, { vus: 0, reqs: 0, durations: [], polls: 0, waits: [], timeouts: 0, done: 0 });
  }
  return minutes.get(m);
};

for (const r of rows) {
  const b = bucket(r[iTime]);
  const value = Number(r[iValue]);
  switch (r[iMetric]) {
    case "vus":
      b.vus = Math.max(b.vus, value);
      break;
    case "http_req_duration":
      if (r[iName] !== "S3 upload") {
        b.reqs++;
        b.durations.push(value);
      }
      break;
    case "result_polls":
      b.polls += value;
      break;
    case "result_wait_ms":
      b.waits.push(value / 1000);
      break;
    case "result_timeouts":
      b.done++;
      if (value === 1) b.timeouts++;
      break;
  }
}

const pct = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const fmt = (v, digits = 0) => (v === null || Number.isNaN(v) ? "–" : v.toFixed(digits));

// Optional sampler CSV: time is wall-clock HH:MM:SS; align by row order to whole minutes.
let samplesByMinute = null;
if (samplesPath) {
  const s = readFileSync(samplesPath, "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => l.split(","));
  const toSec = (hms) => hms.split(":").reduce((acc, x) => acc * 60 + Number(x), 0);
  const start = toSec(s[0][0]);
  samplesByMinute = new Map();
  for (let i = 0; i < s.length; i++) {
    const m = Math.floor((toSec(s[i][0]) - start) / 60);
    const entry = samplesByMinute.get(m) ?? { queue: 0, xact: [] };
    entry.queue = Math.max(entry.queue, Number(s[i][1]) + Number(s[i][2]));
    entry.xact.push([toSec(s[i][0]), Number(s[i][5])]);
    samplesByMinute.set(m, entry);
  }
}

const head = [
  "min",
  "users",
  "API req/s",
  "API p95 ms",
  "polls %",
  "finished",
  "timeouts",
  "wait p50 s",
  "wait p95 s",
];
if (samplesByMinute) head.push("queue max", "PG tx/s");
console.log(`| ${head.join(" | ")} |`);
console.log(`|${head.map(() => "---").join("|")}|`);
for (const [m, b] of [...minutes.entries()].sort((a, b) => a[0] - b[0])) {
  const cells = [
    m + 1,
    b.vus,
    fmt(b.reqs / 60, 1),
    fmt(pct(b.durations, 95)),
    b.reqs ? fmt((100 * b.polls) / b.reqs) : "–",
    b.done,
    b.timeouts,
    fmt(pct(b.waits, 50), 1),
    fmt(pct(b.waits, 95), 1),
  ];
  if (samplesByMinute) {
    const s = samplesByMinute.get(m);
    let tx = null;
    if (s && s.xact.length > 1) {
      const [a, z] = [s.xact[0], s.xact.at(-1)];
      tx = (z[1] - a[1]) / (z[0] - a[0]);
    }
    cells.push(s ? s.queue : "–", fmt(tx));
  }
  console.log(`| ${cells.join(" | ")} |`);
}
