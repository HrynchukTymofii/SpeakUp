# Features

What SpeakUp does today, from the user's side, with pointers to the code. The product scope and
the reasons behind it are in `SPEC.md` §1; how it's built is in [`architecture.md`](./architecture.md).

## In one sentence

People record themselves speaking and get feedback on pace, pauses, filler words, clarity and —
for read-aloud tasks — reading accuracy, then practice with short lessons.

## Pages

Marketing pages are served on the site host (`speakup.fibipals.com`), everything else on the app
host (`app.speakup.fibipals.com`); a page asked for on the wrong host redirects to the right one.

| Route                           | Host | Who              | What                                                                                               |
| ------------------------------- | ---- | ---------------- | -------------------------------------------------------------------------------------------------- |
| `/`                             | site | everyone         | Landing: value proposition, "how it works", entry to the funnel                                    |
| `/privacy`, `/terms`, `/refund` | site | everyone         | Legal pages (texts in `app/(marketing)`, owner facts in `lib/legal.ts`)                            |
| `/start/<step>`                 | app  | everyone         | The onboarding funnel (below)                                                                      |
| `/sign-in`, `/sign-up`          | app  | everyone         | Clerk forms, themed like the app                                                                   |
| `/pricing`                      | app  | everyone         | Free vs Pro, the Pro price localized by Paddle, upgrade button                                     |
| `/app`                          | app  | signed in        | Learn tab: streak / level / daily goal, "Picked for you" lessons, course chips and the lesson path |
| `/app/lessons/<slug>`           | app  | signed in        | Lesson: step-by-step (why → example → try this → exercises → done); in-app confidence lessons      |
| `/app/practice`                 | app  | signed in        | Practice feed: vertical swipe through quick drills, record inline                                  |
| `/app/challenges`               | app  | signed in        | 7-day story challenge, "speak like a legend", contests (coming soon)                               |
| `/app/profile`                  | app  | signed in        | Stats, goal picker, skills, score trend, recurring problems, recent recordings                     |
| `/results/<attemptId>`          | app  | signed in, owner | Analysis report for one recording, with links to the lessons that fix its problems                 |
| `/app/billing`                  | app  | signed in        | Plan, status, renewal date, usage today, "Manage subscription"                                     |

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

### Problem detection (lesson suggestions)

`detectProblems(metrics, feedback)` in [`packages/shared/src/problems.ts`](../packages/shared/src/problems.ts)
turns one analysis into concrete problems, each of which a lesson fixes. It is deterministic (no
LLM), so the same recording always suggests the same lessons. Thresholds live in `PROBLEM_THRESHOLDS`.

| Problem               | Detected when                                                         |
| --------------------- | --------------------------------------------------------------------- |
| `fillers`             | ≥ 2 fillers and ≥ 2 per minute                                        |
| `hesitations`         | ≥ 2 hesitation pauses per minute, or ≥ 2 pauses over 1.5 s            |
| `skipped-punctuation` | read-aloud: under 70 % of commas/full stops got an audible pause      |
| `run-on`              | over 12 s of speech without any pause                                 |
| `too-fast`            | over 175 words per minute                                             |
| `monotone`            | reliable voice analysis with flat pitch or flat loudness              |
| `flat-pace`           | reliable voice analysis with almost no change of pace between phrases |
| `trailing-off`        | ≥ 30 % of sentences fade at the end                                   |
| `hedges`              | ≥ 2 hedges ("I think", "kind of", "maybe"…)                           |
| `structure`           | the feedback flags structure as a medium or high issue                |

## The signed-in app

A bottom tab bar (`components/app-tab-bar.tsx`) switches between **Learn · Practice · Challenges ·
Profile**; every `/app` page leaves room for it. Data for all tabs comes from one hook,
`learn/use-learn-data.ts` (`GET /v1/me`, `/v1/courses`, `/v1/attempts`), so the tabs share one cache.

## Practice feed (`/app/practice`)

A vertical, snap-scrolling feed of quick drills — one screen per drill, swipe up for the next,
record inline (`app/(product)/app/practice/practice-feed.tsx`). Drill families
(`learn/practice.ts`): one-minute topic, question storm, convince me, tongue twister; filter chips
narrow the feed to one family. The order is shuffled with the date as the seed: fresh each day,
stable while scrolling.

## Challenges (`/app/challenges`)

- **7-day story challenge** (`challenge-your-story`): tell your self-written story once a day;
  seven day tiles show progress and each day's best score (`storyChallenge` in `learn/progress.ts`).
  After day 7: use it in a real conversation.
- **Speak like a legend** (`legend-*`): read a public-domain speech (Lincoln, Kennedy, Roosevelt)
  and get the usual analysis. Planned: play the original, compare side by side, share the score.
- **Contests**: placeholder ("coming soon") — weekly prompts, community votes, leaderboards.

## Lessons

Content lives in [`packages/db/src/seed-data.ts`](../packages/db/src/seed-data.ts) (`pnpm db:seed`).
Every lesson has the same shape — **Why it matters → Example → Try this** (three `##` sections of
the markdown body) — and 2–3 recorded exercises. The first lesson of each course is free.

| Course                         | Lessons                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Speaking basics (everyone)     | Warm up your voice · Find your pace · The power of the pause · Silence beats “um” · Hit the key word · Slow down, speed up · Finish strong · Say it like you mean it |
| Be interesting in conversation | Build your story · Listen, then make a bold guess · Keep the conversation going                                                                                      |
| Pitch preparation              | The problem in one sentence · The 30-second pitch · Convince me it matters                                                                                           |
| Presentation preparation       | Demand attention · One idea, three points · End with a call to action                                                                                                |
| Job interviews                 | “Tell me about yourself” · “Why should we hire you?”                                                                                                                 |
| Meetings and updates           | The 30-second update · Propose an idea                                                                                                                               |

**Lesson flow** (`app/(product)/app/lessons/[slug]/lesson-view.tsx`): one card at a time with a
progress bar — Why it matters → Example (butter card) → Try this (sage card) → each exercise
(recorder stays on the page; the analysis runs in the background) → "Lesson complete" with the
mascot. _Build your story_ adds a writing step: the user writes their own story (saved on the
device, never generated).

**Confidence before you speak** — three lessons that run fully in the app, because a microphone
can't measure them (finishing one is remembered on the device):

- _Square breathing_: 4 rounds of in-hold-out-hold, 4 s each, a dot travelling around a square.
- _The "Yes!" button_: press, say a power phrase out loud, three times.
- _Look as confident as you are_: posture, eye contact, gestures, energy dial (tips; the mobile
  app will coach these with the camera).

**Practice exercises** (standalone, every plan, `GET /v1/exercises/practice`): one-minute topics
(`drill-topic-*`), question storms (`drill-questions-*`), "convince me" (`drill-convince-*`), tongue
twisters (`drill-twister-*`), the 7-day story challenge (`challenge-your-story`) and "speak like a
legend" read-alouds of public-domain speeches (`legend-*`: Lincoln, Kennedy, Roosevelt).

Locked lessons are listed (so users see what Pro adds) but can't be opened or practiced. The
baseline "speaking check" and the practice exercises are outside the courses and open to everyone.

## Personalization and progress

All computed in the app from the attempt history (`GET /v1/attempts`) and the onboarding answers;
code in [`apps/web/learn/`](../apps/web/learn), metadata (course look, which lesson fixes which
problem) in `learn/catalog.ts`.

- **Course order:** the course for the funnel goal leads (pitching → Pitch preparation,
  conversations → Be interesting, …), then Speaking basics, then the rest.
- **Suggested lessons:** up to three. The problems found in the last 5 analyzed recordings, most
  frequent first, each mapped to the first unfinished lesson that fixes it. Before any analysis,
  the symptoms the user reported in the funnel are used instead ("I talk too fast" → Find your pace).
- **Lesson done** = every exercise of the lesson has a completed recording.
- **Streak:** consecutive local days with at least one completed recording; yesterday's streak
  stays alive until today ends. **Daily goal:** 3 recordings. **XP:** 10 per completed recording
  plus score ÷ 10; a level every 100 XP.

## Plans and limits

|                  | Free               | Pro                                                                   |
| ---------------- | ------------------ | --------------------------------------------------------------------- |
| Speaking check   | ✓                  | ✓                                                                     |
| Lessons          | 1st of each course | all                                                                   |
| Analyses per day | 3                  | 50                                                                    |
| Price            | $0                 | monthly subscription, price set in Paddle (localized, taxes included) |

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

- Contests, and comparing a "legend" recording with the original speech.
- Server-side storage for in-app lesson progress and the user's story (kept on the device today).

- A history page of past attempts (the API stores them; the dashboard doesn't list them yet).
- Product analytics: funnel events (`funnel_step_viewed`, `funnel_answer`, `paywall_viewed`,
  `checkout_started`…) are tracked through one function, `apps/web/funnel/analytics.ts`, which only
  logs to the console in development. Connecting a real analytics tool means changing that function.
- The mobile app (Expo) mentioned in `SPEC.md`.
