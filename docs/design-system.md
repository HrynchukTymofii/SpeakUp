# Design system (web)

How the SpeakUp web app (`apps/web`) looks and why, and how to build new UI that matches.

One theme, **Glow**, for the whole web app: the marketing site (landing, legal pages) and the
product (funnel, sign-in, `/app`, results, pricing). A near-white page with one soft lavender
glow, white cards with a little depth, black for anything you press, headlines in Manrope, line
icons instead of emoji. Light only. See [ADR 0009](./adr/0009-marketing-site-glow-theme.md)
(site) and [ADR 0010](./adr/0010-app-glow-theme.md) (app).

Both hosts use SpeakUp's own mascot. The `(product)` layout still renders `.app-theme`, a hook
for app-only rules; it no longer changes any token.

- Glow source (outside this repo): `SpeakUp Project/mobile/designs/11-glow-final.html` and the
  landing mockup `SpeakUp Project/website/landing.html`
- Mascot reference (outside this repo): `Genesis/Funnel/index.html` (the `blob()` mascot)

---

## 1. Principles

1. **Tokens, not hex.** Every color is a CSS variable in `apps/web/app/globals.css`, exposed to
   Tailwind through `@theme`. Components write `bg-card`, `text-muted`, `border-line`, never `#141414`.
2. **Neutral canvas, few accents.** Surfaces are near-white; personality comes from one
   lavender glow, a single black card per screen and the blue mascot. The soft pastels (sage,
   rose, butter, sky) only carry meaning: good, fix, highlight, info.
3. **No emoji.** Use the line icons in `components/icons.tsx` (or an image). A test
   (`lib/no-emoji.test.ts`) fails if an emoji appears in the UI source; text symbols like ✓
   and × are fine.
4. **Pastel surfaces keep dark ink.** Text on any pastel background uses `text-on-pastel`
   (and `text-on-pastel-muted` for secondary text) — never cream text on a pastel.
5. **Big and soft.** Large Manrope headlines, pill buttons, generously rounded cards (20–28 px),
   the layered "depth" shadow.
6. **Mobile first.** Every screen is designed and checked at **375 px** wide first.
7. **Motion is optional.** All animation switches off under `prefers-reduced-motion: reduce`.

---

## 2. Color tokens

Defined in `:root` in
`apps/web/app/globals.css`; the Tailwind name is the variable name with
the `--` dropped (e.g. `--card-2` → `bg-card-2`, `text-card-2`, `border-card-2`).

| Group     | Token                              | Value                             | Use                                               |
| --------- | ---------------------------------- | --------------------------------- | ------------------------------------------------- |
| Surfaces  | `page` / `bg`                      | `#f7f7fa`                         | page background (`html`, `body`, header)          |
|           | `card` / `card-2`                  | `#ffffff` / `#f1f1f5`             | cards; chips, number badges, progress tracks      |
|           | `line` / `line-2`                  | `#e8e8ee` / `#dcdce4`             | dividers, footer border; stronger borders         |
| Text      | `ink`                              | `#0e0e12`                         | main text; also the black buttons and card        |
|           | `muted`                            | `#6b6b77`                         | secondary text (5:1 on the page)                  |
|           | `dim`                              | `#9a9aa6`                         | decorative only — fails contrast for text         |
| Accent    | `brand`                            | `#6a4df0`                         | the one lavender: links, focus, dots, small pills |
|           | `glow`                             | `#e4ddff`                         | the soft radial glow behind the hero and cards    |
|           | `peach` / `peach-2`                | `#e4ddff` / `#d6ccff`             | lavender wash surfaces (lesson art)               |
|           | `lav`                              | `#f1edff`                         | icon tiles, "Try this next" notes                 |
|           | `butter` / `sage` / `sky` / `rose` | app pastels                       | rarely used on the site                           |
| On pastel | `on-pastel` / `on-pastel-muted`    | `#0e0e12` / `#4a4a55`             | text on any pastel                                |
| Status    | `danger`                           | `#b4233f`                         | inline error text                                 |
| Charts    | `chart-good` / `-warn` / `-bad`    | `#1f8f6b` / `#d99a00` / `#e5484d` | good / so-so / bad bars; always with a legend     |
| Mascot    | `mascot-light` / `-mid` / `-deep`  | `#f4fcff` / `#aeddf7` / `#5ba6df` | mascot body gradient only                         |

Shadows: `shadow-soft` (cards: the layered "depth" shadow with a light top edge),
`shadow-soft-sm` (small cards), `shadow-peach` (accent pills), `shadow-ink` (the black card).

Also: `brand` (accent for text, links and focus rings: pastels are surfaces, too light for text),
`grid` / `dot` (graph-paper lines, path dots: transparent in Glow, so `paper` and `dots` draw
nothing) and `edge` (the ledge under raised buttons).

**Adding a token:** add the variable to `:root`, then map it in `@theme inline`
(`--color-<name>: var(--<name>);`). Keep values in one place — the `@theme` entry only points at the variable.

---

## 3. Typography

| Role                  | Font        | How                                                 |
| --------------------- | ----------- | --------------------------------------------------- |
| Body, UI              | **Manrope** | default (`font-sans`)                               |
| Headings, big numbers | **Manrope** | `font-display` (all `h1`–`h3` get it automatically) |

One family, loaded through `next/font/google` in `app/layout.tsx` (self-hosted at build time, no
layout shift). Outfit was dropped with Glow. **No serif fonts.**

Common sizes: page titles `text-[40px]`, funnel step titles `text-[28px]`, card titles
`text-xl`, scores `text-7xl`. Headline line-height is tight (`leading-[1.05]`–`leading-tight`).

**Big headlines** (landing, the Learn greeting): `font-light` with tight negative tracking
(`tracking-[-0.035em]`) and the key words in `<b className="font-bold">` ("Let’s **speak up.**").
Big numbers are `font-light` too. Card and step titles are `font-bold` with slight negative
tracking.

---

## 4. Component classes

Plain CSS classes in the `@layer components` block of `globals.css`. Tailwind utilities on the
same element override them (utilities come later in the cascade).

| Class           | What it is                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `btn`           | base pill button (height ≥ 52 px, extra-bold, press-scale, disabled state). Always combine with a variant: |
| `btn-primary`   | black pill with a gentle gradient — the main call to action (same look as `btn-ink`)                       |
| `btn-peach`     | the lavender (`brand`) pill — upgrade/checkout only                                                        |
| `btn-secondary` | white pill with a little depth                                                                             |
| `btn-sm`        | smaller size modifier                                                                                      |
| `card`          | rounded 28 px white card with a slight gradient and the depth shadow (no border)                           |
| `eyebrow`       | small uppercase label (`HOW IT WORKS`)                                                                     |
| `pill`          | small rounded badge; add a `bg-*` and text color                                                           |
| `link`          | muted text link that brightens on hover                                                                    |
| `paper`         | graph-paper texture; draws nothing in Glow (`--grid` is transparent)                                       |
| `dots`          | dotted canvas (behind the lesson path)                                                                     |
| `raised`        | pressable "3D" button with a solid ledge underneath (path nodes)                                           |
| `surface`       | Glow: white card with a slight top-to-bottom gradient; pair with `shadow-soft` for depth                   |
| `surface-ink`   | Glow: the one raised black card (gradient, light top edge, own shadow, white text)                         |
| `btn-ink`       | Glow: black pill with a gentle gradient and top highlight                                                  |
| `surface-glow`  | Glow: white fading into the lavender glow — the one "continue" card on a screen                            |

Landing building blocks: `app/(marketing)/landing-visuals.tsx` (the hero phone with its floating
cards, the step pictures, the lesson art, the feedback icons).

App building blocks: `Icon` (line icons, `components/icons.tsx`), `IconTile` (a lavender square
with an icon) and `PlayCircle` (the black play button in white "Continue" pills) in
`components/icon-tile.tsx`; the tab bar `components/app-tab-bar.tsx` (white, rounded top, icons
with labels, the active tab in ink with a dot); the Learn stat cards (today's goal is the black
card, then streak and level) in `app/(product)/app/learn-view.tsx`; the lesson path with its START
bubble and mascot in `app/(product)/app/course-path.tsx`.

`InstallCard` (`components/pwa/install-card.tsx`) is the "Get SpeakUp on your home screen" card:
the happy mascot, then what this browser can do: one `btn btn-primary` "Install the app" (Chrome,
Edge: the browser's own dialog), numbered Share → Add to Home Screen steps with the `share` and
`plusSquare` icons (iPhone, iPad), "open in Safari or Chrome" (Instagram, Facebook, TikTok
webviews) or a pointer to the browser menu. It renders nothing inside the installed app. The
`download` icon marks "Download the app" links.

> Tailwind v4 cannot `@apply` a custom class, so variants are composed in markup
> (`className="btn btn-primary"`), not inside CSS.

### Funnel building blocks — `apps/web/funnel/ui.tsx`

- `StepHeading` — title + optional subtitle for a step.
- `OptionButton` — big tappable answer; peach when selected; `multi` adds a checkbox.
- `ContinueButton` — full-width primary button, sticky to the bottom on phones.
- `Card` — rounded card. Passing your own `bg-*` class (e.g. `bg-butter`) **replaces** the default
  surface and border, because two `bg-*` utilities on one element fight over CSS order.
- `Tick` — round check-mark bullet for feature lists.

---

## 5. The mascot — `apps/web/components/mascot.tsx`

An original character: a soft, sky-blue **blob** that slowly morphs, with a glow, blushing cheeks
and an expressive face. The body and colors follow the Genesis funnel mascot.

```tsx
<Mascot mood="listening" size={72} />
<Mascot mood="happy" size={96} label="SpeakUp mascot" /> {/* label → announced to screen readers */}
```

| Mood        | Face                             | Extra       | Used for                               |
| ----------- | -------------------------------- | ----------- | -------------------------------------- |
| `idle`      | arch eyes (blink), small smile   | —           | default, header logo, ready-to-record  |
| `listening` | round eyes, "o" mouth that talks | sound waves | recording, mic permission              |
| `happy`     | closed ^ ^ eyes, open grin       | sparkles    | done/success, reflections, scores ≥ 55 |
| `thinking`  | eyes glancing up, raised brow    | "…" bubble  | analyzing, loaders, failures           |

Where it appears: header logo, landing, funnel (reflection, mic, recording, auth, results,
plan loader), the recorder, results page, dashboard, lesson, pricing.

Implementation notes:

- Pure inline SVG, no images, except the app icons (home screen, install dialog), which are PNGs
  generated from it by `pnpm --filter @speakup/web icons`. Colors come from tokens (`--mascot-*`,
  `--rose`, `--on-pastel`), so it re-themes with `globals.css`.
- Gradient ids are made unique with `useId()`, so many mascots can share a page.
- Decorative by default (`aria-hidden`); pass `label` when it carries meaning.
- Animations are the `.mascot*` rules in `globals.css`. The body morph animates the SVG path via
  CSS `d: path(...)` (Chrome, Edge, Firefox); browsers without it show a still blob.
- Don't put the mascot on a `sky` background — it disappears. Peach, butter, sage, lav work.

---

## 6. Third-party UI

| Widget                        | How it's themed                                                     | Where                           |
| ----------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| Clerk (sign-in/up, user menu) | `appearance` prop on `<ClerkProvider>` using the same CSS variables | `app/layout.tsx`                |
| Paddle checkout               | `settings.theme: "light"`                                           | `components/upgrade-button.tsx` |
| Cloudflare Turnstile          | `theme: "light"` (only visible when Cloudflare is unsure)           | `funnel/turnstile.tsx`          |

Clerk gotchas (Clerk 7):

- The text color variable is **`colorForeground`** (older docs say `colorText`).
- Clerk draws input/button borders as ~7 %-alpha box-shadows, invisible on black. We override
  them with `!important` **only in the unfocused state**, so Clerk's focus ring still shows.

---

## 7. Accessibility checklist

- Text contrast (WCAG AA, 4.5:1 for normal text), measured:
  `ink` ≥ 14.8:1 and `muted` ≥ 6.2:1 on `page`/`card`/`card-2`; `on-pastel` ≥ 8.6:1 and
  `on-pastel-muted` ≥ 4.8:1 on every pastel. `dim` is 3.0–3.7:1, so it is not used for text.
  Re-check the ratios when changing a token.
- Focus: global `:focus-visible` outline in `peach-2`; never remove outlines without a replacement.
- Motion: every animation (funnel slides, mascot, pulses) stops under reduced motion.
- Touch targets: buttons and options are ≥ 44 px tall.
- Icons/mascot are `aria-hidden` unless they carry information.

---

## 8. Building a new screen

1. Start at 375 px. One column, `px-4`, content max width `max-w-md` (funnel) or `max-w-2xl` (app).
2. Use tokens and the component classes above; no raw hex, no `slate-*`/`emerald-*` palettes.
3. Page title in `font-display`; group content in `card`s; one `btn-primary` per screen.
4. Add the mascot where the screen has an emotional beat (waiting, success, failure) — not everywhere.
5. Respect the safe areas. Product pages set `viewport-fit=cover`, so the installed app draws under
   the notch, status bar and home indicator. Fixed or sticky UI pads itself with
   `env(safe-area-inset-*)`: bottom bars and sheets `pb-[max(<usual>,env(safe-area-inset-bottom))]`
   (`ContinueButton`, the tab bar, the loader question sheet), the header
   `pt-[env(safe-area-inset-top)]` plus left/right insets on its row (landscape notch), and the
   `/app` page padding grows by the bottom inset to clear the tab bar. On the marketing host (no
   `viewport-fit=cover`) and in a normal browser tab the insets are 0, so this costs nothing there.
6. Check at 375 px for horizontal overflow, then at desktop width.
7. Run `pnpm --filter @speakup/web typecheck`, `lint`, `test`, and the build.
