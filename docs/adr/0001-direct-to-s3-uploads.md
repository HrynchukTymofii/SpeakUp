# 0001. Upload recordings straight to S3 with pre-signed POSTs

- **Status:** Accepted (milestone M4)
- **Date:** 2026-11-18

## Context

Recordings are up to ~10 MB. Sending them through the API would tie up API tasks on slow mobile
uploads, cost NAT/egress bandwidth, and make the API's memory use depend on upload size. But the
browser must not get general write access to the bucket, and files that are uploaded but never used
must not pile up.

## Decision

- `POST /v1/attempts` returns a **pre-signed POST** that is valid for 5 minutes and locks the key,
  the content type, a size range (1 KB – 10 MB) and a tag `upload-status=pending`.
- The browser uploads directly to S3. On submit the API checks the object with a `HEAD` request
  (never trusting the client), then removes the `pending` tag.
- A bucket lifecycle rule deletes objects that still carry `pending` after one day.
- The worker downloads audio through a short-lived pre-signed GET URL.

## Consequences

- The API never handles audio bytes; it scales on request count only.
- Abandoned uploads clean themselves up without a cron job.
- The S3 bucket needs CORS for the web origins, and local development needs an S3 emulator
  (LocalStack) — part of `pnpm infra:up`.
- Two extra requests per recording (create + submit) compared to a single upload endpoint.
