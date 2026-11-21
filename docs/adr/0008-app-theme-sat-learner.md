# 0008. The app gets its own light theme; the marketing site stays dark

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

[0006](./0006-design-system-tokens.md) put the whole web app on one dark theme on true black. In
use, the owner found the app too colorful and wordy, and wanted it to look like their newer SAT
Learner design (lavender, butter and black, graph-paper cards, a floating tab bar) with a
game-like lesson path. The marketing site's dark look was still wanted.

## Decision

- Keep **one set of token names** and give the app different values: the `(product)` layout
  renders `.app-theme`, and `:root:has(.app-theme)` redefines the tokens (light by default, dark
  when the OS asks for it). The marketing site keeps the `:root` values.
- Add a `brand` token for accent text, links and focus rings, because pastels are surfaces and too
  light for text on a light page.
- Tokens keep their old names (`peach` is lavender in the app), so components didn't change.

## Consequences

- One component library serves two looks; a component never knows which theme it is in.
- Token names no longer describe their color in the app (`peach`), which surprises new readers;
  [`design-system.md`](../design-system.md) lists both value sets.
- Every screen has to be checked in both the light and the dark app theme.
