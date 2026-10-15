# Visual Language and Tokens

## Inspiration synthesis
- `reference-01-empty.png`, `reference-02-content.png`: soft gray app shell, rounded white working surface, spacious empty states, subdued selected nav, clean content cards.
- `reference-03-insights.png`, `reference-04-analytics.png`: dark-mode data density, bold hierarchy, compact charts, subdued borders, restrained color.
- `reference-05-light-dashboard.png`: light, simple navigation, generous whitespace, focused primary content.
These are directional references, not instructions to reproduce unrelated product branding or layouts verbatim.

## Themes
Use semantic CSS variables consumed through Tailwind tokens, not raw color literals in components. Suggested starting palette (tune after checking actual contrast):

| Token | Light | Dark |
|---|---|---|
| background | #FFFFFF | #0D0D0D |
| sidebar / muted surface | #F5F4F5 | #141414 |
| card / panel | #FFFFFF | #1A1A1A |
| border | #E7E7EA | #303036 |
| foreground | #202024 | #F5F5F7 |
| secondary text | #626675 | #B0B0BA |
| primary | #635BFF | #8B83FF |
| primary foreground | #FFFFFF | #111018 |
| focus ring | #635BFF | #A8A2FF |

Ensure primary-on-background and foreground-on-primary contrast meet AA; adjust tokens when necessary. Use status-specific semantic colors for success, warning, and destructive actions.

## Type
Preferred: Geist Sans, fallback Inter and system sans. Base body 14–16px; secondary 12–14px; labels 13–14px; page titles 24–30px; section titles 16–20px. Line-height body ~1.5; avoid low-contrast microcopy. Use tabular numerals for analytics.

## Space and shape
4px base increment; preferred spacing steps 4, 8, 12, 16, 24, 32, 48. Controls 36–44px tall depending on density; touch targets at least 24x24 CSS px with adequate spacing, aim 44x44 on touch. Radius: controls 8–10px, cards 12–16px, large shell panels 20–24px. Avoid oversized pill treatment everywhere. Borders are more common than heavy shadows.

## Hierarchy
One dominant action per view. Use restrained purple for primary CTAs, selected/focus states, and limited highlights. Never color every card. Use neutral empty states and generous whitespace; prioritize meaningful content.

## Motion
Transitions ~120–200ms for subtle UI feedback, not content-obscuring animation. Respect `prefers-reduced-motion` and avoid motion required for comprehension.
