# Visual Language and Tokens

## Visual direction (2026) — in-page content
Decided Oct 2026 with the product owner. It applies to **content inside the page** (cards, numbers,
charts, empty and success states). The **sidebar, top bar and section header are out of scope**: leave
the shell as it is. Rolled out first on the site Overview; other screens follow screen by screen.

The goal is a calm, mostly black/white/grey interface that feels **interactive and engaging**:
bold numbers, one purposeful accent, small geometric vectors, and quick motion that responds to the
pointer. It came from a set of finance/analytics dashboard references the owner shared (described in
words below; the images themselves are third-party and not kept in the repo).

### What the references have in common
- A soft light-grey canvas with white cards in a **bento grid** of mixed sizes (a wide chart next to
  a tall highlight card; a row of equal stat tiles; equal-height rows).
- Big, bold numbers as the hero of a card, a small muted label above, **muted decimals/currency**,
  and a small tinted **delta pill** (↗ 12% green / ↘ 8% red) beside it.
- Card headers: title (+ short muted line) left, a **round outline arrow button** top-right that
  opens the full view.
- Pill **segmented controls** (Today / Week / Month, 1D … ALL) where the chosen option is a raised
  white pill; pill dropdowns and pill buttons.
- Rounded **bar charts** where one bar is picked out in the accent and the rest stay neutral grey;
  **future/empty periods striped** (45° hatching). Smooth **line/area** charts with a soft gradient
  wash under the line and a dot on the latest point; **donuts** with the total in the centre.
  Tooltips are small **dark bubbles**.
- **One dark highlight card** (near-black, display type, a date/range chip, light pill buttons) to
  anchor the eye — a promo, the next thing to do, a summary.
- Nested grouping: a light grey group card holding white cards (fee breakdowns, settings groups), and
  receipt-style key/value lists with a divider before the total.
- Progress bars with a gradient fill and **tick marks** for the remaining capacity.
- On phones: a 2-column grid of stat tiles, each with a tiny chart, then full-width cards.

### Canvas and cards
- Data screens sit on `--canvas` (`bg-canvas`), filling the area under the section header.
- Cards: `.visual-card` / `<VisualCard>` — `--card`, radius **20px** (`rounded-(--radius-card)`),
  **no border**, soft `--card-shadow`. Nested groups: `.visual-nested` — `--card-nested`, radius 14px.
- Interactive cards lift on hover/focus (`.visual-lift`: −2px and `--card-shadow-hover`).
- Bento: 12-column grid on `lg` (8 + 4, 4 × 3, 3 × 4 …), `gap-4`/`gap-5`; cards in a row share height.
  Below `lg` cards stack full width; stat tiles stay 2-up on phones.
- Tables and dense lists keep the existing bordered treatment until their screen is redesigned.

### Colour
- Base: black / white / greys. **Klipt purple is the accent, used sparingly**: the highlighted bar
  ("now"), the active pill, the latest-point dot, focus rings, links and the one dominant form CTA.
- Buttons on data screens: **ink** (`variant="ink"`, near-black pill; white in dark mode) for the main
  action and **soft** (`variant="soft"`, white pill with shadow) for the rest, so purple stays the data
  highlight. Forms, editors and dialogs keep the purple `default` primary button.
- **Semantic tints** for meaning — soft background + strong text, each pair ≥ 4.5:1:
  success (`bg-success-soft text-success-strong`), danger (`bg-danger-soft text-danger-strong`),
  warning (`bg-warning-soft text-warning-strong`), info (`bg-info-soft text-info-strong`),
  accent (`bg-primary-soft text-primary-strong`). Always pair with an icon or words.
- **At most one dark highlight card** per screen (`--hero`, `<HeroCard>`); its chips use `--hero-chip`.
- Gradients only with a purpose: progress fills, the wash under a line. Never on surfaces or text.
- Charts: neutral marks `--chart-neutral` (de-emphasis), the accent for the one highlighted mark,
  `--hatch` stripes for future/empty, `--chart-grid` hairlines, `--tooltip` bubbles (dark in light
  mode, light in dark mode). Status marks `--chart-good` / `--chart-attention` were validated with the
  dataviz palette script (light and dark); their CVD separation is in the 6–8 band, so they always ship
  with a legend, direct values and a 3px gap.
  Neutral bars are deliberately low-contrast; every chart therefore has a visible summary (the headline
  number), a tooltip on hover/focus and an sr-only table.

### Typography
- Hero/stat numbers: bold, tight tracking (`text-[2rem]`–`text-[2.5rem] font-bold tracking-tight`),
  proportional figures; a small muted label above. Decimals, currency and units are muted
  (`ValueText`, `opacity-60`). Use `tabular-nums` only for aligned columns, axes and table values.
- Display type (`font-extrabold tracking-tight`) only for the hero card title and the greeting.
- Body and labels as before (14–16px body, 12–14px secondary), never low-contrast microcopy.

### Vectors
- `.visual-hatch` (HTML) / `<HatchPattern>` (SVG): 45° stripes for future, empty or "not yet".
- `.visual-ticks`: vertical ticks for remaining capacity in progress bars.
- `<Illustration scene=…>`: small geometric SVG scenes (content, media, success, connect, activity,
  calendar) drawn with theme tokens, for empty and success states — always next to text that says the
  same thing, never instead of it.
- `<IconTile>`: rounded-square tinted icon tiles mark cards and rows.

### Motion (noticeable but quick)
- Tokens: `--duration-fast` 150ms, `--duration-base` 250ms, `--duration-slow` 400ms,
  `--motion-ease` (ease-out). Nothing runs longer than 400ms, except the one-off milestone
  celebration (600ms, plays once).
- Numbers count up (`<CountUp>`; the server renders the final value and screen readers get it),
  bars grow from the baseline (`.visual-grow-y`, small stagger), lines draw in (`.visual-draw`),
  badges and labels rise in (`.visual-rise`), cards lift on hover, the arrow button nudges, the pill
  highlight slides.
- Milestones (e.g. every live page passes the SEO checks) get a short geometric confetti burst
  (`<Celebrate>`).
- `prefers-reduced-motion: reduce` ends every animation instantly (global rule in `globals.css`);
  motion is never needed to understand anything.

## Shell references
`assets/reference-01-empty.png` … `reference-05-light-dashboard.png` remain the references for the app
shell (soft grey frame, rounded white working surface, quiet navigation) and general density. They
are directional, not layouts to copy.

## Themes
Use semantic CSS variables consumed through Tailwind tokens, not raw color literals in components.
`src/app/globals.css` is the single source of truth (`:root` light, `.dark` dark). Shell tokens:

| Token | Light | Dark |
|---|---|---|
| background (working surface) | #FFFFFF | #0D0D0D |
| shell / muted surface | #F5F4F5 | #141414 |
| canvas (data screens) | #F3F3F6 | #0F0F11 |
| card | #FFFFFF | #1A1A1A |
| card-nested | #F6F6F8 | #222226 |
| border | #E7E7EA | #303036 |
| foreground | #202024 | #F5F5F7 |
| secondary text | #626675 | #B0B0BA |
| primary | #635BFF | #8B83FF |
| hero (dark card) | #17161C | #24223A |

Dark mode is designed, not inverted: a near-black canvas with slightly lifted cards (inner top
highlight instead of a heavy shadow), tints re-stepped so their text still reads, and a light tooltip.

## Type
Preferred: Geist Sans, fallback Inter and system sans. Base body 14–16px; secondary 12–14px; labels
13–14px; page titles 24–30px; section titles 16–20px. Line-height body ~1.5; avoid low-contrast
microcopy.

## Space and shape
4px base increment; preferred spacing steps 4, 8, 12, 16, 20, 24, 32, 48. Controls 36–44px tall; touch
targets at least 24×24 CSS px, aim 44×44 on touch. Radius: controls 8–10px, pill controls and buttons
on data screens fully rounded, nested cards 14px, cards 20px, shell panels 24px.

## Hierarchy
One dominant action per view. The accent marks what matters *now*; everything else stays neutral.
Never colour every card. Empty states pair an illustration with one clear next step.
