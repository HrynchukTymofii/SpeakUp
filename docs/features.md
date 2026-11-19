# Features

What SpeakUp does today, from the user's side, with pointers to the code. The product scope and
the reasons behind it are in `SPEC.md` §1; how it's built is in [`architecture.md`](./architecture.md).

## In one sentence

People record themselves speaking and get feedback on pace, pauses, filler words, clarity and —
for read-aloud tasks — reading accuracy, then practice with short lessons.

## Pages

Marketing pages are served on the site host (`speakup.fibipals.com`), everything else on the app
host (`app.speakup.fibipals.com`); a page asked for on the wrong host redirects to the right one.

| Route                           | Host | Who              | What                                                                    |
| ------------------------------- | ---- | ---------------- | ----------------------------------------------------------------------- |
| `/`                             | site | everyone         | Landing: value proposition, "how it works", entry to the funnel         |
| `/privacy`, `/terms`, `/refund` | site | everyone         | Legal pages (texts in `app/(marketing)`, owner facts in `lib/legal.ts`) |
| `/start/<step>`                 | app  | everyone         | The onboarding funnel (below)                                           |
| `/sign-in`, `/sign-up`          | app  | everyone         | Clerk forms, themed like the app                                        |
| `/pricing`                      | app  | everyone         | Free vs Pro, the Pro price localized by Paddle, upgrade button          |
| `/app`                          | app  | signed in        | Dashboard: speaking check, course and lessons, profile and usage        |
| `/app/lessons/<slug>`           | app  | signed in        | Lesson: video, text, practice exercises with the recorder               |
| `/results/<attemptId>`          | app  | signed in, owner | Analysis report for one recording                                       |
| `/app/billing`                  | app  | signed in        | Plan, status, renewal date, usage today, "Manage subscription"          |

## The onboarding funnel (`/start`)

Mobile-first flow for visitors from ads. One URL per step, so back/forward and analytics work; the
state is kept in the browser so a reload resumes where the visitor left off. Steps are configured in
[`apps/web/funnel/config.ts`](../apps/web/funnel/config.ts) — add, remove or reorder them there.

1. **Questions:** goal, situations where speaking is hard, first language, nervous symptoms,
   self-rated confidence (1–5), time per day. Single-choice answers move on with one tap.
2. **Reflections:** two short screens that respond to earlier answers (`personalize.ts`).
3. **Mini-lesson:** a short video on what we measure; "Continue" unlocks after 10 s or at the end.
4. **Microphone permission:** explained first, with per-browser help when it's blocked.
5. **Speaking check:** read a paragraph aloud (3-2-1 countdown, timer, live level meter, max 45 s),
   play it back, re-record or submit. A bot check runs invisibly before submit.
6. **Sign-up gate:** "your analysis is being prepared" with live progress while the visitor creates
   an account. Signing in to an existing account works too.
7. **Results (short version):** animated score, pace / filler words / long pauses, one strength and
   the top two things to work on.
8. **Personalization:** upcoming speaking moment, what to work on first (options come from the
   analysis' top issues).
9. **Plan loader:** ~12 s "building your plan" with two yes/no questions in a bottom sheet (practice
   out loud now? daily reminders?). The answers are saved; the loader itself is pacing.
10. **Your 4-week plan:** built from goal, focus and time per day; shows the starting score.
11. **Paywall:** what Pro includes, the localized monthly price, one upgrade button, "cancel anytime",
    a visible "continue with the free plan", and two FAQs. No countdowns or fake discounts.
    Someone who already has Pro sees "You're already on SpeakUp Pro" and a dashboard button
    instead of the upgrade button and the free-plan link (the same applies on `/pricing`).

Funnel answers are copied into the account's onboarding profile when the anonymous session is
claimed after sign-up.

## Recording and feedback

- **Recorder** (`components/exercise-recorder.tsx`, `lib/use-recorder.ts`): asks for the microphone,
  records in the first format the browser supports (WebM/Opus, MP4/AAC on Safari, or Ogg/Opus), enforces the exercise's
  maximum length, plays back before submitting.
- **Upload:** straight from the browser to private storage; then the analysis starts.
- **Progress:** Uploaded → Transcribing → Analyzing, refreshed every 1.5 s, with a "check again"
  button if it takes longer than a minute.
- **Report** (`components/results-report.tsx`):
  - overall score 0–100 and a short summary
  - pace in words per minute on a scale, with the 130–160 target band
  - pauses (count, long ones over 1.5 s, the longest)
  - filler words (count and per minute)
  - reading accuracy for read-aloud exercises (missed, changed, extra words), or unclear words otherwise
  - what went well, up to four things to work on (each with evidence from the recording and a tip),
    and one next step
  - the transcript with filler words highlighted, long pauses marked in place and unclear words underlined
- **Failures** get a plain-language message, e.g. "we couldn't hear enough speech" (`NO_SPEECH`).

## Lessons

One course, **Speak with Confidence** (seeded from [`packages/db/src/seed-data.ts`](../packages/db/src/seed-data.ts)):

| #   | Lesson                 | Plan | Exercises               |
| --- | ---------------------- | ---- | ----------------------- |
| 1   | Find your pace         | Free | read aloud, free speech |
| 2   | The power of the pause | Pro  | read aloud              |
| 3   | Cut the filler words   | Pro  | two free-speech prompts |

Locked lessons are listed (so users see what Pro adds) but can't be opened or practiced. The
baseline "speaking check" is outside the course and open to everyone.

## Plans and limits

|                  | Free     | Pro                                                                   |
| ---------------- | -------- | --------------------------------------------------------------------- |
| Speaking check   | ✓        | ✓                                                                     |
| Lessons          | Lesson 1 | all                                                                   |
| Analyses per day | 3        | 50                                                                    |
| Price            | $0       | monthly subscription, price set in Paddle (localized, taxes included) |

- Quotas reset at **00:00 UTC**. Recordings that fail on our side don't count; `NO_SPEECH` does (so
  silent recordings can't burn speech-to-text budget).
- Upgrading: Paddle's overlay checkout. The account becomes Pro when Paddle confirms the payment
  (usually within seconds; the button shows "Activating…" meanwhile).
- Managing: change card, see invoices or cancel in Paddle's customer portal (Billing → Manage
  subscription). After cancelling, Pro stays until the end of the paid period.

## Privacy

- Recordings are private and used only for the analysis.
- Funnel recordings from visitors who never create an account are deleted after 7 days.
- Uploads that were never submitted are deleted after a day.
- IP addresses are stored only as salted hashes (for abuse limits).

## Not built yet

- A history page of past attempts (the API stores them; the dashboard doesn't list them yet).
- Product analytics: funnel events (`funnel_step_viewed`, `funnel_answer`, `paywall_viewed`,
  `checkout_started`…) are tracked through one function, `apps/web/funnel/analytics.ts`, which only
  logs to the console in development. Connecting a real analytics tool means changing that function.
- The mobile app (Expo) mentioned in `SPEC.md`.
