# 0009. The marketing site moves to a light "Glow" theme

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

[0008](./0008-app-theme-sat-learner.md) kept the marketing site on the dark, warm theme on true
black. While designing the mobile app, the owner chose a cleaner direction ("Glow", mobile design
11): a near-white page with one soft lavender glow, white cards with a little depth, black for
anything you press, and headlines that mix light and bold type. They asked for the website to
look the same, starting with the landing page, after reviewing a static mockup of it.

## Decision

- Replace the `:root` token values (the marketing site's theme) with the Glow values: light
  surfaces, near-black ink, one lavender `brand`, and a layered "depth" shadow in `--shadow`.
  Token names stay, so the legal pages and the shared header follow without edits.
- Add three classes for the look: `surface` (white card with a slight gradient), `surface-ink`
  (the one raised black card) and `btn-ink` (black pill with a top highlight).
- Marketing headings use Manrope with `font-light` + `<b>` for the key words; Outfit stays for
  the app and the logo.
- The app (`.app-theme`) is unchanged for now; moving the funnel and app to Glow is a separate
  task.

## Consequences

- The two hosts now differ in look until the app moves too: Glow on the site, SAT Learner in the
  funnel and app. The mascot and the black buttons tie them together.
- The marketing site is light only (no dark variant), which keeps one set of values to check.
- `--shadow` on the site includes inset highlights; components that set a border and
  `shadow-soft` still look right, but a new dark surface on the site should use `surface-ink`
  rather than `shadow-soft`.
