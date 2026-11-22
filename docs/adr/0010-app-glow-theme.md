# 0010. The app joins the Glow theme, light only, no emoji

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

[0009](./0009-marketing-site-glow-theme.md) moved the marketing site to the light "Glow" look,
while the funnel and app kept the SAT Learner theme from
[0008](./0008-app-theme-sat-learner.md) (graph paper, six pastels, a floating black tab bar, a
dark variant). The owner asked for the funnel and the web app to match the site, and separately
asked for no emoji anywhere ("find icons; I'll replace them with images later").

## Decision

- The app uses the same `:root` tokens as the site. The `:root:has(.app-theme)` overrides and
  the dark variant are removed; the whole web app is light only.
- Pastels are softer and carry meaning only (sage good, rose fix, butter highlight, sky info);
  course and mode tiles all share the lavender wash. The graph-paper and dotted-path textures
  are switched off through their tokens.
- Manrope is the only font; Outfit is no longer loaded.
- The tab bar becomes a white bar with rounded top corners and labelled icons.
- Emoji are replaced by line icons (`components/icons.tsx`); `lib/no-emoji.test.ts` keeps them
  out of the UI source.
- Third-party widgets (Clerk, Paddle, Turnstile) use their light themes.

## Consequences

- One look across both hosts and the mobile app design, and one set of token values to check.
- Users who prefer dark mode get a light app. A dark Glow variant can come back later as its
  own set of `:root` overrides.
- The `.app-theme` class and the `paper` / `dots` classes stay as no-op hooks; removing them is
  a follow-up cleanup if nothing needs them.
