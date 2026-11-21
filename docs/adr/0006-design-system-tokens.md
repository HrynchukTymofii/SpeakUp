# 0006. One design system on true black, colors as tokens

- **Status:** Superseded in part by [0008](./0008-app-theme-sat-learner.md) (the app's colors; tokens and the mascot stay)
- **Date:** 2026-11-18

## Context

The first web UI used Tailwind's stock `slate`/`emerald` palette with polish reserved for the funnel
(`SPEC.md` §0.6 at the time). The owner wanted the whole app to share the look of their Holy Hush
app (dark, warm pastels, big rounded cards) but on a **true black** background, with a mascot, and
without any serif "Bible-style" type.

## Decision

- Colors are CSS variables in `apps/web/app/globals.css`, exposed to Tailwind through `@theme`;
  components use token classes (`bg-card`, `text-muted`…), never hex values.
- Fonts: Manrope (body) and Outfit (headings) via `next/font`.
- Reusable component classes (`btn` + variants, `card`, `pill`, `eyebrow`).
- Third-party widgets (Clerk, Paddle, Turnstile) are themed to match.
- An original mascot (inline SVG, moods) marks emotional moments: waiting, success, failure.
- Text contrast is measured (WCAG AA) and recorded in the design-system doc.

Details: [`../design-system.md`](../design-system.md).

## Consequences

- A theme change is a token change in one file.
- Clerk needs small overrides for its low-alpha borders on black (documented).
- New screens must follow the design system (`SPEC.md` §0.6 was updated accordingly).
