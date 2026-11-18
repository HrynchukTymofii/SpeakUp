# 0003. The plan changes only through payment webhooks

- **Status:** Accepted (milestone M6)
- **Date:** 2026-11-18

## Context

After checkout the browser "knows" the payment succeeded, but a client-side signal can be faked or
lost (closed tab). Paddle delivers webhooks at least once, possibly duplicated, possibly out of
order. Billing rules will grow (trials, grace periods, app stores).

## Decision

- Only a **signature-verified webhook** changes a subscription. The checkout endpoint just returns
  what Paddle.js needs, including `customData.userId` to link the payment to our user.
- **Idempotency:** each event is inserted into `WebhookEvent` (unique on source + event id) in the same
  transaction as the subscription update; a duplicate fails the insert and is answered `200` with no change.
- **Ordering:** `Subscription.lastEventAt` stores the newest event applied; older events are ignored.
- **One function decides the plan:** `getEntitlements()` — routes never read subscriptions directly.
- After checkout the web app polls `GET /v1/me` (up to 60 s) until the plan is Pro.

## Consequences

- No way to get Pro without paying, and replays are harmless.
- A few seconds' delay between payment and Pro; if the webhook is late, the UI says so instead of
  pretending.
- Adding App Store / Play billing means a new `PaymentProvider` and webhook route; entitlement logic
  stays in one place.
