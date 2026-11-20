// Shared helpers for the k6 scenarios (docs/load-testing.md).
// k6 runs this JavaScript in its own runtime (not Node): only k6/* modules are available.
import crypto from "k6/crypto";
import http from "k6/http";
import { check } from "k6";

export const BASE_URL = __ENV.BASE_URL || "http://localhost:4100";
const SECRET = __ENV.LOAD_TEST_AUTH_SECRET;
if (!SECRET) throw new Error("Set LOAD_TEST_AUTH_SECRET (the same value the API runs with)");

// Each run gets fresh users, so a run never starts with another run's history.
export const RUN_ID = __ENV.RUN_ID || `${Date.now().toString(36)}`;

/**
 * A signed load-test token: `lt.<userId>.<hex hmac>` — the same format the API checks in
 * apps/api/src/services/load-test-auth.ts. The API creates the user on its first request,
 * exactly like a real first sign-in.
 */
export function tokenFor(vu) {
  const userId = `loadtest_${RUN_ID}_${vu}`;
  return `lt.${userId}.${crypto.hmac("sha256", SECRET, userId, "hex")}`;
}

/**
 * A GET/POST to our API, tagged with a stable `name` so k6 groups `/attempts/abc` and
 * `/attempts/def` into one row in the results.
 */
export function api(method, path, token, { body, name, expected = [200] } = {}) {
  const res = http.request(method, `${BASE_URL}/v1${path}`, body ? JSON.stringify(body) : null, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    tags: { name: name || path },
    responseCallback: http.expectedStatuses(...expected),
  });
  check(res, { [`${name || path} ok`]: (r) => expected.includes(r.status) });
  return res;
}

const encoder = (s) => {
  // Form fields are ASCII (S3 policy fields): one byte per character.
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

/**
 * Uploads to S3 with the pre-signed POST the API returned — the same request the browser
 * makes. The multipart body is built by hand because S3 ignores every field after `file`,
 * and k6's automatic multipart doesn't guarantee field order.
 */
export function uploadToS3(upload, audio, mimeType) {
  const boundary = `----speakup${Math.random().toString(16).slice(2)}`;
  const parts = [];
  for (const [key, value] of Object.entries(upload.fields)) {
    parts.push(
      encoder(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`),
    );
  }
  parts.push(
    encoder(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recording"\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`,
    ),
  );
  parts.push(new Uint8Array(audio));
  parts.push(encoder(`\r\n--${boundary}--\r\n`));

  const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    body.set(p, offset);
    offset += p.length;
  }

  const res = http.post(upload.url, body.buffer, {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    tags: { name: "S3 upload" },
    responseCallback: http.expectedStatuses(200, 201, 204),
  });
  check(res, { "S3 upload ok": (r) => r.status >= 200 && r.status < 300 });
  return res;
}

/** Random think time between min and max seconds (people don't click instantly). */
export function between(min, max) {
  return min + Math.random() * (max - min);
}
