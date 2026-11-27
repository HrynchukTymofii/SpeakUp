# Product analytics (Amplitude)

How SpeakUp measures the landing page → funnel → paywall → app journey. Code:
[`apps/web/funnel/analytics.ts`](../apps/web/funnel/analytics.ts) (the only file that talks to
Amplitude) and [`apps/web/app/analytics-provider.tsx`](../apps/web/app/analytics-provider.tsx)
(starts it and keeps the user in step with Clerk).

## Setup

1. Create an Amplitude project (the free Starter plan is enough to start). Use **two projects**,
   `SpeakUp (prod)` and `SpeakUp (dev)`, so test clicks never land in the real numbers.
2. Copy the project's **API key** (Settings → Projects → the project → General). It is a public
   browser key, not a secret.
3. Set `NEXT_PUBLIC_AMPLITUDE_API_KEY` in Vercel (Production: the prod key; Preview: the dev key or
   empty) and redeploy. Locally it can stay empty: events are then only logged to the browser
   console (`[analytics] …`).

Empty key = Amplitude is never started and nothing leaves the browser.

## Identity: one person across landing, funnel, app and (later) mobile

| Moment                     | What Amplitude knows                                                                                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First visit (landing, `/`) | A random **device id** in a cookie on the parent domain (`.fibipals.com`), so the landing host and the app host share it. UTM parameters, referrer and ad click ids (`gclid`, `fbclid`…) are captured as attribution.                                                                                           |
| Funnel answers             | Each answer is also saved as a **user property** `funnel_<key>` (`funnel_goal`, `funnel_time`…), so any later chart can be split by goal.                                                                                                                                                                       |
| Sign-up in the funnel      | `setUserId(<Clerk user id>)`. Amplitude merges the anonymous device history into that user, so everything from the first ad click on belongs to the account.                                                                                                                                                    |
| Signed-in visits           | Same Clerk id on every page and every device where the person signs in. `plan` (`free`/`pro`) is kept as a user property.                                                                                                                                                                                       |
| Sign-out                   | `reset()`: a new anonymous device, so the next person on the same browser isn't counted as the previous account.                                                                                                                                                                                                |
| Mobile app (not built yet) | The app signs in with the same Clerk account and calls `setUserId(<Clerk user id>)` with Amplitude's React Native SDK in the **same Amplitude project**. Web funnel and app usage then show up as one user, with no extra data needed (no fingerprinting, no browser/location matching). See "Web → app" below. |

We never send emails, names, guest tokens, transcripts or recordings. The Clerk id (`user_…`) is
a pseudonymous id.

## What is captured automatically

- `[Amplitude] Page Viewed` on every page and every client-side route change, with the path only
  (no query string or hash), e.g. `/`, `/start/goal`, `/app`, `/app/practice/one-minute-topic`.
  This answers "what is the first screen, the second screen…" in Amplitude's **Journeys** chart.
- `[Amplitude] Start Session` / `End Session`, and attribution (UTM, referrer, click ids).
- Device, OS, browser and an approximate location (country, city) from the IP address.

Clicks, form fields, file downloads, network requests and web vitals are **not** autocaptured.
Autocaptured clicks and form fields could send text people type.

## Events

| Event                        | Where                                                    | Properties                                                |
| ---------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| `funnel_step_viewed`         | every funnel step                                        | `step` (id from `funnel/config.ts`), `index`              |
| `funnel_answer`              | every answered question (incl. loader)                   | `step`, `value`                                           |
| `mic_permission_result`      | `mic` step                                               | `result`: `granted` · `denied` · `unsupported`            |
| `funnel_recording_submitted` | `exercise` step                                          | `durationMs`                                              |
| `funnel_signup_completed`    | `auth` step, after the anonymous check is claimed        | `step`                                                    |
| `funnel_results_viewed`      | `results` step                                           | `score`                                                   |
| `paywall_viewed`             | `paywall` step                                           | `placement`: `funnel`                                     |
| `funnel_free_plan_chosen`    | paywall, "Continue with the free plan"                   | —                                                         |
| `checkout_started`           | any "Upgrade to Pro" button                              | `placement`: `funnel` · `pricing` · `lesson`              |
| `checkout_closed`            | Paddle overlay closed without paying                     | `placement`                                               |
| `checkout_completed`         | Paddle reports a successful payment                      | `placement`, `currency`; **revenue** = the checkout total |
| `pro_activated`              | our API reports the account as Pro                       | `placement`                                               |
| `recording_submitted`        | any recording in the app (lessons, practice, challenges) | `exercise` (slug), `exerciseType`, `durationSec`          |
| `results_viewed`             | results page, once the analysis is done                  | `status`: `completed` · `failed`, `exercise`, `score`     |
| `lesson_completed`           | the "Lesson complete!" screen                            | `lesson`, `course`                                        |

**Funnel context.** While a funnel is open, every event (the `funnel_*` events above and also
`paywall_viewed`, `checkout_*` and `pro_activated` fired from it) carries two more properties, set
once with `setEventContext()` instead of by each caller:

| Property         | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `funnel_id`      | the funnel's slug, e.g. `main`                                                             |
| `funnel_version` | the funnel's content revision the visitor saw (`Funnel.version`), so edits can be compared |

The context is cleared when the funnel closes; a property passed to `track()` wins over it.

To add an event: add its name to `AnalyticsEvent` in `funnel/analytics.ts`, call `track()` and
add a row here.

## The funnel today, step by step

Build this as one **Funnel Analysis** chart in Amplitude (conversion within 1 day, "any order" off).
Steps marked _optional_ are skipped by some visitors; leave them out of the chart or use a
separate one.

| #   | Screen (path)                          | Event to use in the chart                       |
| --- | -------------------------------------- | ----------------------------------------------- |
| 1   | Landing `/` (site host)                | `[Amplitude] Page Viewed` where page path = `/` |
| 2   | Goal `/start/goal`                     | `funnel_step_viewed` where step = `goal`        |
| 3   | Hard situations `/start/situations`    | `funnel_step_viewed` step = `situations`        |
| 4   | Reflection `/start/reflection-1`       | `funnel_step_viewed` step = `reflection-1`      |
| 5   | First language `/start/language`       | `funnel_step_viewed` step = `language`          |
| 6   | Nervous symptoms `/start/symptoms`     | `funnel_step_viewed` step = `symptoms`          |
| 7   | Reflection `/start/reflection-2`       | `funnel_step_viewed` step = `reflection-2`      |
| 8   | Self-rating `/start/self-rating`       | `funnel_step_viewed` step = `self-rating`       |
| 9   | Time per day `/start/time`             | `funnel_step_viewed` step = `time`              |
| 10  | Mini-lesson video `/start/mini-lesson` | `funnel_step_viewed` step = `mini-lesson`       |
| 11  | Microphone `/start/mic`                | `mic_permission_result` result = `granted`      |
| 12  | Speaking check `/start/exercise`       | `funnel_recording_submitted`                    |
| 13  | Sign-up `/start/auth`                  | `funnel_signup_completed`                       |
| 14  | Results `/start/results`               | `funnel_results_viewed`                         |
| 15  | Upcoming moment `/start/deadline`      | `funnel_step_viewed` step = `deadline`          |
| 16  | Focus `/start/focus`                   | `funnel_step_viewed` step = `focus`             |
| 17  | Plan loader `/start/plan-loader`       | `funnel_step_viewed` step = `plan-loader`       |
| 18  | Your plan `/start/plan`                | `funnel_step_viewed` step = `plan`              |
| 19  | Paywall `/start/paywall`               | `paywall_viewed` placement = `funnel`           |
| 20  | Checkout opened                        | `checkout_started` placement = `funnel`         |
| 21  | Paid                                   | `checkout_completed` placement = `funnel`       |
| 22  | First screen in the app `/app`         | `[Amplitude] Page Viewed` page path = `/app`    |
| 23  | First recording in the app             | `recording_submitted`                           |

Visitors who are already signed in pass step 13 without a form (their check is claimed at once,
which still fires `funnel_signup_completed`). People who choose the free plan leave at step 19 with
`funnel_free_plan_chosen` and continue at step 22.

Useful extra charts:

- **Journeys** starting at `/app`: what people open first, second, third in the app.
- **Retention**: start event `funnel_signup_completed`, return event `recording_submitted`,
  split by the user property `funnel_goal` or `plan`.
- **Revenue LTV** from `checkout_completed` (revenue), split by first-touch UTM campaign.

## Web → app (mobile) handoff

The funnel always creates an account before the paywall, so the account is the link between web
and app:

1. The visitor pays on the web. Paddle's webhook makes the account Pro in our database (`/v1/me`
   then reports `plan: pro`).
2. The mobile app signs in with the same Clerk account (same email, same sign-in method). It reads
   the plan from `/v1/me`, so Pro is already unlocked. There is no separate in-app purchase for
   web buyers.
3. Amplitude sees the same `user_id` (the Clerk id) on both platforms, so "paid on the web →
   first lesson in the app" is one funnel in the same project.

Location, browser and other device details are not needed to match people. They are only for
segmenting charts.

## Limits and caveats

- **Ad blockers** block Amplitude for some visitors, so counts are a lower bound. We don't proxy
  it through our domain: the proxy's IP would replace the visitor's, and locations would be wrong.
- **Revenue** is what the browser saw at checkout (taxes included). The source of truth for
  billing is Paddle; a server-side event from the Paddle webhook would also catch renewals and
  refunds (not built, see `SPEC.md` §12).
- **Development** runs React in strict mode, which mounts effects twice, so a dev build with a key
  sends some events twice. Use the dev project.
- **Consent:** analytics starts without a cookie banner. For EU/UK visitors a consent banner may be
  required before Amplitude is started. Not built yet (see `SPEC.md` §12).
