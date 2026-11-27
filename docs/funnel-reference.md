# Funnel reference: how the Holy Hush web funnel works

Notes from reading the reference project (`Desktop\FPG\website`, read-only) before building the
SpeakUp funnel (SPEC §15). We reuse the **mechanics and feel**, not its content or branding.

Files studied: `funnels/types.ts`, `funnels/struggle.ts` (the config), `funnels/answers.ts`,
`app/(site)/f/[slug]/funnel.tsx` (engine + all step views), `funnel-loader.tsx`, `paywall-flow.tsx`,
`_components/paywall.tsx`, `_components/flow.css`, `lib/analytics/client.ts`.

## Step engine

- **A funnel is data.** `FunnelConfig = { slug, steps: Step[], plans }`. `Step` is a discriminated
  union on `type` (`landing`, `single`, `multi`, `scale`, `text`, `fact`, `insight`,
  `obstacle-insight`, `loading`, `email`, `paywall`, …). One `StepView` component `switch`es on
  `type`. New funnel = new config file, no new components.
- **Conditional steps:** each step may have `skip(answers) => boolean`; navigation passes over
  skipped steps in both directions.
- **Answer-dependent wording:** `follows: { answerKey, variants: { [answerValue]: { title, body… } } }`
  re-words a question or insight based on an earlier answer (e.g. a reflection that depends on how
  heavy something feels).
- **Navigation:** `go(+1 | -1, patch)` merges the answer patch into state and moves the index,
  skipping steps that don't apply and **never walking back into the loader**. Back is disabled on
  the paywall and after sign-up (the quiz is "saved" at that point).
- **Answer validation on the server:** a Zod schema built from the same option lists
  (`oneOf(options)`), so only values the funnel offers are accepted.

## State: stored and restored

- One object per funnel `{ index, answers, startedAt, signedUp, email, theme }` saved to
  **sessionStorage** on every change; restored on load, so a refresh resumes on the same step.
- The whole funnel renders **client-only** (`next/dynamic` with `ssr: false`) because it lives on
  browser storage.
- A single URL (`/f/[slug]`) with the step as an index; `?step=paywall` jumps only for someone who
  already got that far (a simple guard).
- First-touch UTM parameters are saved once; an ad "theme" (`?utm_content=b8`) can re-word the
  landing and **prefill** answers the ad already implies.

## Feel: layout and transitions

- Mobile-first single column: back button + thin rounded **progress bar** on top, one question per
  screen, a **sticky full-width Continue button** at the bottom.
- Progress = position among the "question" steps (landing and paywall excluded, skipped steps not
  counted); the bar animates its width (`transition: width .4s`).
- **Step transition:** the step container is re-mounted (`key={index}`) with a CSS animation —
  slide in 24 px from the right going forward, from the left going back, fade, 0.32 s.
  Option buttons fade up with a 40 ms stagger.
- `prefers-reduced-motion: reduce` turns all of these animations off.
- **Single choice auto-advances** on tap (tiny haptic `navigator.vibrate(8)`); multi choice has
  checkboxes, an optional max, "exclusive" options (e.g. "None") and a Continue button.
- **Reflection ("insight") screens** between questions: illustration, one short title, one or two
  sentences that react to an earlier answer, Continue.

## Loader with questions

- ~6.5 s single sweep driven by `requestAnimationFrame` with an eased "breathing" curve
  (slow–fast–slow) so it feels like work, a percentage, and a checklist whose items tick as the
  percentage passes them.
- An optional **micro-question** pauses the progress at 45 % and opens a bottom sheet; the answer is
  saved and progress resumes from where it stopped (elapsed time is kept in a ref).
- Reduced motion: starts at 60 % instead of animating from 0.

## Auth and paywall position

- Order: questions → reflections → loader → **email/sign-up** → personalised result (their sample
  prayer) → plan/path summary → **paywall**. Value is shown _after_ sign-up and _before_ the paywall.
- Paywall: plan recap headline personalised from answers, a short list of what's included, plan
  radio cards (one marked "best value"), **one** primary CTA, "renews automatically, cancel
  anytime", and a visible "continue with the free plan" link. Explicitly: no countdowns, no fake
  discounts.

## Analytics

- `track(event, props)` wrapper over the vendor (PostHog), typed event names.
- Events: `funnel_viewed`, `quiz_started`, `quiz_step_completed` (with `step_id` and the answer —
  **sensitive answers are sent as `"hidden"`**), `quiz_completed` (with duration), `paywall_viewed`,
  `plan_selected`, checkout clicks.
- `identify(userId)` after sign-up ties the anonymous journey to the account.

## What SpeakUp does differently (SPEC §15 wins)

- **One URL per step** (`/start/[step]`) instead of an index, so back/forward and analytics work.
- **Zustand store persisted to localStorage** (SPEC) instead of hand-written sessionStorage helpers.
- **Anonymous recording before sign-up** with a guest token (only its hash on the server), a
  Turnstile bot check, a per-IP daily limit, and a **claim** call after sign-up that moves the
  attempt to the new account. Results are shown only after the claim.
- Guards are per step ("can't open results without a claimed attempt"), not just for `?step=`.
- **Conditions and wording are declarative data, not functions:** `showIf` is a rule object,
  text is a template (`{{answer:key|fallback}}`), and dynamic copy or options are named
  personalizers / option providers. So the whole definition is JSON, checked by
  `FunnelDefinitionSchema`, and could be stored and edited without a deploy.
- Analytics go to Amplitude instead of PostHog; events and the funnel chart are in
  [`analytics.md`](./analytics.md).
- All copy is about speaking; social-proof numbers are `TODO(founder)` placeholders.
