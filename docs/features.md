# Features

What SpeakUp does today, from the user's side, with pointers to the code. The product scope and
the reasons behind it are in `SPEC.md` §1; how it's built is in [`architecture.md`](./architecture.md).

## In one sentence

People record themselves speaking and get feedback on pace, pauses, filler words, clarity and —
for read-aloud tasks — reading accuracy, then practice with short lessons.

## Pages

Marketing pages are served on the site host (`speakup.fibipals.com`), everything else on the app
host (`app.speakup.fibipals.com`); a page asked for on the wrong host redirects to the right one.

| Route                           | Host | Who              | What                                                                                          |
| ------------------------------- | ---- | ---------------- | --------------------------------------------------------------------------------------------- |
| `/`                             | site | everyone         | Landing: value proposition, how it works, feedback, lessons, funnel entry, "Download the app" |
| `/privacy`, `/terms`, `/refund` | site | everyone         | Legal pages (texts in `app/(marketing)`, owner facts in `lib/legal.ts`)                       |
| `/start/<step>`                 | app  | everyone         | The onboarding funnel (below), the bundled default `main`                                     |
| `/f/<slug>/<step>`              | app  | everyone         | The same funnel shell with a definition from the API (ad links; unknown slug → 404)           |
| `/sign-in`, `/sign-up`          | app  | everyone         | Clerk forms, themed like the app                                                              |
| `/pricing`                      | app  | everyone         | Free vs Pro, the Pro price localized by Paddle, upgrade button                                |
| `/install`                      | app  | everyone         | Put SpeakUp on the home screen, or "Not now, continue" (see "Installing the app" below)       |
| `/offline`                      | app  | everyone         | Shown by the service worker when a page can't load; `noindex`                                 |
| `/app`                          | app  | signed in        | Learn tab: warm-up card, LVL · streak · today, "Continue" (or speaking check), picks, courses |
| `/app/warm-up`                  | app  | signed in        | Pitch warm-up: 1 minute of box breathing, then back home; records nothing                     |
| `/app/courses/<slug>`           | app  | signed in        | One course: its lessons as a winding path                                                     |
| `/app/lessons/<slug>`           | app  | signed in        | Lesson: step-by-step (why → example → try this → exercises → done); in-app confidence lessons |
| `/app/practice`                 | app  | signed in        | Practice: one card per mode                                                                   |
| `/app/practice/<mode>`          | app  | signed in        | A mode, started at once: a random new topic, "another one", the recorder                      |
| `/app/challenges`               | app  | signed in        | 7-day story challenge, "speak like a legend", contests (coming soon)                          |
| `/app/profile`                  | app  | signed in        | Stats, goal picker, skills, score trend, recurring problems, recent recordings                |
| `/results/<attemptId>`          | app  | signed in, owner | Waits for the analysis, then the report; `?next=` adds "Continue" (next topic / lesson step)  |
| `/app/billing`                  | app  | signed in        | Plan, status, renewal date, usage today, "Manage subscription"                                |
| `/admin/funnels`                | app  | admins           | Funnel admin (below); other signed-in users see "This page is for admins"                     |
| `/admin/funnels/<slug>`         | app  | admins           | Funnel editor (below): a funnel's screens in order, with a preview                            |

## Installing the app (`/install`)

The app host is an installable web app (see [`architecture.md`](./architecture.md)). `/install`
shows `InstallCard` — the install button, the iOS Share → Add to Home Screen steps, or a fallback,
depending on the browser — and a "Not now, continue" button. Links come from `installHref(from,
next)` in `apps/web/lib/pwa/install-href.ts`:

- `from` (`landing`, `funnel`, `purchase`; anything else counts as `direct`) is sent with the
  install analytics events.
- `next` is where "Not now, continue" goes, default `/app`. Only same-site paths are accepted;
  anything else falls back to `/app`, so the link can't send people to another site.
- Opened inside the installed app, the screen skips straight to `next`.
- The landing's "Download the app" opens `/install?from=landing&next=%2Fapp`. There, signed-out
  visitors also get "New here? Take the 2-minute speaking check" → `/start`.
- The end of the funnel opens it for everyone, free or paid: the paywall's "Continue with the free
  plan" goes to `/install?from=funnel&next=%2Fapp`, and a completed upgrade there goes to
  `/install?from=purchase&next=%2Fapp`.
- Upgrading on `/pricing` or `/app/billing` shows the same `InstallCard` (placement `purchase`)
  under "You're on SpeakUp Pro" instead of leaving the page.

## The onboarding funnel (`/start`, `/f/<slug>`)

Mobile-first flow for visitors from ads. One URL per step, so back/forward and analytics work; the
state is kept in the browser so a reload resumes where the visitor left off. The funnel is data:
[`packages/shared/src/funnel-default.ts`](../packages/shared/src/funnel-default.ts) exports
`DEFAULT_FUNNEL_DEFINITION`, a JSON-safe list of steps checked by `FunnelDefinitionSchema`
(`packages/shared`) — add, remove or reorder steps there. Conditions are declarative rules and text can insert earlier answers (`{{answer:goal}}`).
`/start` always renders that bundled definition. `/f/<slug>` renders the live `Funnel` row with
that slug from the database (seeded: `main`); `/f/main` falls back to the bundled copy when the API
is unavailable. Both share the visitor's saved progress for `main`.

1. **Questions:** goal, situations where speaking is hard, first language, nervous symptoms,
   self-rated confidence (1–5), time per day. Single-choice answers move on with one tap.
2. **Reflections:** two short screens that respond to earlier answers. The config names a
   personalizer (`goalReflection`, `symptomReflection`); the wording lives in `personalize.ts`.
3. **Mini-lesson:** a short video on what we measure. It starts by itself, with sound when the
   browser allows it, otherwise muted with a "Tap for sound" button. "Continue" unlocks after 10 s
   or at the end.
4. **Microphone permission:** explained first, with per-browser help when it's blocked.
5. **Speaking check:** answer a short prompt picked by the visitor's goal, without a script
   (`check-<goal>`, e.g. "tell me about yourself" for interviews; 3-2-1 countdown, timer, live
   level meter, max 45 s), play it back, re-record or submit. A bot check runs invisibly before
   submit.
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
    Both ways out — the free plan and a completed upgrade — lead to the install screen
    (`/install`, see "Installing the app" above) and from there to `/app`; the installed app skips
    that screen.

Funnel answers are copied into the account's onboarding profile when the anonymous session is
claimed after sign-up.

## Recording and feedback

- **Recorder** (`components/exercise-recorder.tsx`, `lib/use-recorder.ts`): asks for the microphone,
  records in the first format the browser supports (WebM/Opus, MP4/AAC on Safari, or Ogg/Opus), enforces the exercise's
  maximum length, plays back before submitting.
- **Upload:** straight from the browser to private storage; then the analysis starts.
- **Progress:** Uploaded → Transcribing → Analyzing. The page long-polls, so each stage and the
  result show up the moment the worker reaches them; a "check again" button appears if it takes
  longer than a minute.
- **Report** (`components/results-report.tsx`):
  - overall score 0–100 and a short summary
  - pace in words per minute on a scale, with the 130–160 target band
  - pauses: hesitations, long ones over 1.5 s and, for read-aloud, the share of commas and full
    stops that got a pause
  - energy (`components/voice-timeline.tsx`, slots in `lib/voice-chart.ts`): a verdict (monotone,
    some variety, lively) and two bar charts over time, one bar per slot (1 s, at most 40 slots).
    A bar's row is the level (high / mid / low against the speaker's own median, so a deep voice
    or a quiet microphone isn't "worse") and its colour says good or bad. Pitch is coloured by
    how much it moves (lively / some movement / flat), because a low or high voice isn't a
    problem in itself; volume by its row (stressed / steady / quiet). Each chart has a legend.
    The most monotone stretch is underlined in red and named ("Most monotone at 0:31–0:39").
    The funnel's results step shows the same card. Hidden for noisy recordings and for analyses
    saved before the timeline existed.
  - filler words (count and per minute)
  - reading accuracy for read-aloud exercises (missed, changed, extra words), or unclear words otherwise
  - a score per skill (pace, pauses, filler words, energy, content or accuracy); "Energy" is the
    `voice` skill: pitch and loudness variety, pace changes, and not fading out at sentence ends
  - what went well, up to six things to work on (each with evidence from the recording and a tip),
    and one next step
  - the transcript with filler words highlighted, long pauses marked in place and unclear words underlined
- **Fix it with a lesson** (signed-in results page): every problem found in the recording links
  to the lesson that fixes it (`lessonsFixing` in `learn/personalize.ts`).
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

A floating black tab bar (`components/app-tab-bar.tsx`, icons) switches between **Learn · Practice · Challenges ·
Profile**; every `/app` page leaves room for it. Data for all tabs comes from one hook,
`learn/use-learn-data.ts` (`GET /v1/me`, `/v1/courses`, `/v1/attempts`), so the tabs share one cache.

**Pitch warm-up.** Right under the Learn greeting, a "Pitch coming up? — Calm down in 1 minute"
card (`app/(product)/app/warm-up-card.tsx`) opens `/app/warm-up`: box breathing (4 rounds of
in-hold-out-hold, 4 s each, 64 s in all), then the mascot, "You're ready. Go get them." and
**Done** back to `/app`. **Skip** returns home at any point. It is free on every plan and records
nothing: no streak, XP, daily goal or lesson completion. The tab bar keeps Learn active there.

## Practice modes (`/app/practice`)

The Practice tab is a grid of mode cards (`app/(product)/app/practice/mode-grid.tsx`): one-minute
topic, question storm, convince me, tongue twister. Tapping a card starts the mode right away
(`/app/practice/<mode>`): the API picks a random topic the user hasn't answered yet
(`GET /v1/practice/:mode/next`), "Another one" passes on it, and the recorder sends the topic
with the attempt. Topics only come back after the whole bank is done; the counter shows how many
are done. One exercise per mode (`mode-*`); the topic banks are `MODE_TOPICS` in
`@speakup/shared` (static now; to be generated by an LLM later).

## After a recording

Every recorder goes straight to `/results/<id>` (the analysis progress, then the report). Where
the user came from rides along as `?next=` (in-app paths only, checked by `safeNextPath`), so the
results page offers **Next topic** (practice), **Continue lesson** (back to the following lesson
step via `?step=`) or **Continue** (challenges).

## Challenges (`/app/challenges`)

- **7-day story challenge** (`challenge-your-story`): tell your self-written story once a day;
  seven day tiles show progress and each day's best score (`storyChallenge` in `learn/progress.ts`).
  After day 7: use it in a real conversation.
- **Speak like a legend** (`legend-*`, catalog `LEGENDS` in `learn/practice.ts`): watch the opening
  of a famous talk (Steve Jobs at Stanford, Simon Sinek, Kevin Hale of Y Combinator, Brené Brown),
  embedded from the official upload (`youtube-nocookie.com`), then repeat it in their style. We host
  no copies or transcripts (copyright). Planned: compare side by side, share the score.
- **Contests**: placeholder ("coming soon").

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
(the recording opens its results; "Continue lesson" comes back to the next step) → "Lesson
complete" with the mascot. _Build your story_ adds a writing step: the user writes their own story (saved on the
device, never generated).

**Confidence before you speak** — three lessons that run fully in the app, because a microphone
can't measure them (finishing one is remembered on the device):

- _Square breathing_: 4 rounds of in-hold-out-hold, 4 s each, a dot travelling around a square.
  The same component (`components/box-breathing.tsx`) runs the pitch warm-up at `/app/warm-up`.
- _The "Yes!" button_: press, say a power phrase out loud, three times.
- _Look as confident as you are_: posture, eye contact, gestures, energy dial (tips; the mobile
  app will coach these with the camera).

**Practice exercises** (standalone, every plan): the four mode exercises (`mode-*`, see Practice
modes), the 7-day story challenge (`challenge-your-story`) and the legends (`legend-*`). Older
`drill-*` exercises and public-domain legends stay in existing databases (attempts reference them)
but are no longer shown.

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
- Usage analytics (Amplitude): pages opened, funnel answers and key actions, tied to a random device
  id and, after sign-up, the account id. Never emails, recordings or transcripts
  ([`analytics.md`](./analytics.md)).

## Funnel admin (`/admin/funnels`)

For the owner, not users: there's no link to it in the app. Admins are the Clerk user ids in the
API's `ADMIN_CLERK_USER_IDS`; signed-out visitors go to sign-in first, and other signed-in users
get "This page is for admins". Each funnel is a card with its name, Live/Draft, version, last
change, its `/f/<slug>` link (live funnels only: drafts 404 for visitors) and, for the last 30
days, sessions started and how many signed up.

- **Take live / Take offline** switches the status. `main` is always live (it's the default funnel).
  A funnel whose stored definition is invalid can't go live.
- **Duplicate** copies a funnel into a new draft at version 1, under a new link and name: how a
  funnel for a new ad starts.
- **Edit screens** opens the editor. Cards say "Has unpublished changes" when a draft is saved.

### Funnel editor (`/admin/funnels/<slug>`)

A funnel is a list of screens. The screens themselves are code (questions, reflections, the
mini-lesson, the recording, sign-up, results, the plan loader, plan, paywall); the editor only
chooses which of them a funnel shows and in what order. The library of screens is the default
funnel's (`FUNNEL_SCREEN_LIBRARY` in `packages/shared/src/funnel-screens.ts`): a developer adds a
new screen there.

- **Move up / Move down / Remove** on each screen; **Add a screen** picks one from the library
  that the funnel doesn't show yet (added before a closing paywall).
- **Problems** are marked on the screen they concern, in plain words, and Save stays off until
  they're fixed: the paywall must be last and come after sign-up; sign-up and results need the
  recording before them.
- **Save changes** stores a draft. Visitors keep seeing the published version until **Publish to
  visitors**, which bumps the version. **Discard changes** (asks first) drops the draft; **Undo
  unsaved changes** resets what isn't saved yet. Leaving with unsaved changes (closing the tab, or "All funnels") asks first. If another
  admin saved meanwhile, Save, Publish and Discard are refused with "changed somewhere else";
  reload to see their version. A saved draft that no longer passes newer checks is flagged and
  can be discarded or replaced.
- **Preview** shows the selected screen in a phone-size frame. Questions, the slider, reflections,
  the mini-lesson, the microphone screen and the plan are the real components, not clickable, with
  personalized wording at its no-answers fallback; the lesson video doesn't autoplay there.
  Screens that act as soon as they open (recording, sign-up, results, plan loader, paywall) are
  described instead, so a preview never records, signs up, opens checkout or sends analytics.

## Not built yet

The list of what isn't built yet (contests, AI-generated topics, a full history page, the
mobile app…) is kept in one place: `SPEC.md` §12.
