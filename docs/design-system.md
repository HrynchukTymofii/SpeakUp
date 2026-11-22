# Design system (web)

How the SpeakUp web app (`apps/web`) looks and why, and how to build new UI that matches.

Two themes share one set of token names:

- **The app** (everything under the `(product)` layout: funnel, sign-in, `/app`, results,
  pricing) uses the **SAT Learner** design: lavender, butter and black on a light lavender page,
  graph-paper texture on pastel cards, a floating black tab bar. Light by default, dark when the
  OS asks for it. The `(product)` layout renders `.app-theme`, and `:root:has(.app-theme)`
  redefines the tokens (see "App theme" below).
- **The marketing site** (landing and legal pages) uses the **Glow** design: a near-white page
  with one soft lavender glow, white cards with a little depth, black for anything you press,
  headlines in light + bold Manrope (the `:root` values below; [ADR 0009](./adr/0009-marketing-site-glow-theme.md)).

Both use SpeakUp's own mascot.

- App theme source (outside this repo): `SAT/app/constants/palette.ts`, `SAT/redesign-previews/v3/app.html`

- Glow source (outside this repo): `SpeakUp Project/mobile/designs/11-glow-final.html` and the
  landing mockup `SpeakUp Project/website/landing.html`
- Mascot reference (outside this repo): `Genesis/Funnel/index.html` (the `blob()` mascot)

---

## 1. Principles

1. **Tokens, not hex.** Every color is a CSS variable in `apps/web/app/globals.css`, exposed to
   Tailwind through `@theme`. Components write `bg-card`, `text-muted`, `border-line`, never `#141414`.
2. **Neutral canvas, few accents.** Surfaces are neutral (light lavender or near-black in the
   app, near-white on the marketing site). The app gets its personality from the pastels
   (lavender, butter, sage, sky, rose); the site from one lavender glow, a single black card and
   the blue mascot.
3. **Pastel surfaces keep dark ink.** Text on any pastel background uses `text-on-pastel`
   (and `text-on-pastel-muted` for secondary text) — never cream text on a pastel.
4. **Big and soft.** Large Outfit headlines, pill buttons, generously rounded cards (20–28 px),
   soft large shadows.
5. **Mobile first.** Every screen is designed and checked at **375 px** wide first.
6. **Motion is optional.** All animation switches off under `prefers-reduced-motion: reduce`.

---

## 2. Color tokens

These are the marketing site's values (the app's are in the next table). Defined in `:root` in
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
| Mascot    | `mascot-light` / `-mid` / `-deep`  | `#f4fcff` / `#aeddf7` / `#5ba6df` | mascot body gradient only                         |

Shadows: `shadow-soft` (cards; on the site it is the layered "depth" shadow with a light top edge),
`shadow-soft-sm` (small cards), `shadow-peach` (accent pills), `shadow-ink` (the black card).

Also: `brand` (accent for text, links and focus rings: pastels are surfaces, too light for text),
`grid` / `dot` (graph-paper lines, path dots) and `edge` (the ledge under raised buttons).

### App theme (SAT Learner)

| Token                        | Light                             | Dark                  |
| ---------------------------- | --------------------------------- | --------------------- |
| `page` / `bg`                | `#f4f1f9`                         | `#0b0a0f`             |
| `card` / `card-2`            | `#ffffff` / `#efeaf7`             | `#17151c` / `#221f29` |
| `line` / `line-2`            | `#e5dfee` / `#d8d0e6`             | `#2b2733` / `#3a3544` |
| `ink` / `muted`              | `#0b0a0f` / `#6b6577`             | `#f4f1f8` / `#9c95a8` |
| `brand`                      | `#7a4bdb`                         | `#c9aafb`             |
| `peach` (the accent surface) | `#c9aafb` (lavender)              | same                  |
| `butter` / `sage` / `lav`    | `#fee7a6` / `#cdefd9` / `#e4cdff` | same                  |
| `sky` / `rose`               | `#cfe3f7` / `#ffd6de`             | same                  |
| `on-pastel` / `-muted`       | `#0b0a0f` / `#4a4553`             | same                  |

The token keeps its old name (`peach`) so every component follows without edits; in the app it
is lavender.

**Adding a token:** add the variable to `:root`, then map it in `@theme inline`
(`--color-<name>: var(--<name>);`). Keep values in one place — the `@theme` entry only points at the variable.

---

## 3. Typography

| Role                  | Font        | How                                                 |
| --------------------- | ----------- | --------------------------------------------------- |
| Body, UI              | **Manrope** | default (`font-sans`)                               |
| Headings, big numbers | **Outfit**  | `font-display` (all `h1`–`h3` get it automatically) |

Both load through `next/font/google` in `app/layout.tsx` (self-hosted at build time, no layout
shift). **No serif fonts** — the kit's Literata is deliberately not used.

Common sizes: page titles `text-[40px]`, funnel step titles `text-[28px]`, card titles
`text-xl`, scores `text-7xl`. Headline line-height is tight (`leading-[1.05]`–`leading-tight`).

**Marketing site (Glow):** headings use Manrope, not Outfit: `font-sans font-light` with a
tight negative tracking (`tracking-[-0.035em]`) and the key words in `<b className="font-bold">`
("Speak with **confidence**"). Big numbers are `font-light` too.

---

## 4. Component classes

Plain CSS classes in the `@layer components` block of `globals.css`. Tailwind utilities on the
same element override them (utilities come later in the cascade).

| Class           | What it is                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `btn`           | base pill button (height ≥ 52 px, extra-bold, press-scale, disabled state). Always combine with a variant: |
| `btn-primary`   | cream pill on black — the main call to action                                                              |
| `btn-peach`     | peach pill with peach glow (upgrade/checkout)                                                              |
| `btn-secondary` | dark pill with a border                                                                                    |
| `btn-sm`        | smaller size modifier                                                                                      |
| `card`          | rounded 28 px card on `card` with border + soft shadow                                                     |
| `eyebrow`       | small uppercase label (`HOW IT WORKS`)                                                                     |
| `pill`          | small rounded badge; add a `bg-*` and text color                                                           |
| `link`          | muted text link that brightens on hover                                                                    |
| `paper`         | graph-paper texture (SAT Learner); put it on pastel cards and icon tiles                                   |
| `dots`          | dotted canvas (behind the lesson path)                                                                     |
| `raised`        | pressable "3D" button with a solid ledge underneath (path nodes)                                           |
| `surface`       | Glow (site): white card with a slight top-to-bottom gradient; pair with `shadow-soft` for depth            |
| `surface-ink`   | Glow (site): the one raised black card (gradient, light top edge, own shadow, white text)                  |
| `btn-ink`       | Glow (site): black pill with a gentle gradient and top highlight — the site's main call to action          |

Landing building blocks: `app/(marketing)/landing-visuals.tsx` (the hero phone with its floating
cards, the step pictures, the lesson art, the feedback icons).

App building blocks: `IconTile` (pastel square on graph paper with an emoji) and `PlayCircle`
(the black play button in white "Continue" pills) in `components/icon-tile.tsx`; the floating
black tab bar `components/app-tab-bar.tsx`; the Learn status row (LVL · 🔥 streak · ⚡ today) in
`app/(product)/app/learn-view.tsx`; the lesson path with its START bubble and mascot in
`app/(product)/app/course-path.tsx`.

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

- Pure inline SVG, no images. Colors come from tokens (`--mascot-*`, `--rose`, `--on-pastel`),
  so it re-themes with `globals.css`.
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
| Paddle checkout               | `settings.theme: "dark"`                                            | `components/upgrade-button.tsx` |
| Cloudflare Turnstile          | `theme: "dark"` (only visible when Cloudflare is unsure)            | `funnel/turnstile.tsx`          |

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
5. Check at 375 px for horizontal overflow, then at desktop width.
6. Run `pnpm --filter @speakup/web typecheck`, `lint`, `test`, and the build.
