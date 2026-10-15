# Responsive Guidelines

## Check at these widths
360px (small mobile), 390px (mobile), 768px (tablet), 1024px (small desktop), 1440px (desktop), and wide desktop. Treat these as test widths, not mandatory custom breakpoints.

## Navigation
Desktop: persistent sidebar. Tablet: compact/collapsible sidebar where space allows. Mobile: accessible drawer/sheet opened from topbar, with site switcher and navigation. Focus must be trapped in open modal/drawer and restored on close.

## Page patterns
- Headers: wrap actions; preserve visible primary action, move secondary actions to overflow menu.
- Tables: use meaningful card/stacked-row adaptations where possible; if horizontal scroll is necessary, make it discoverable and keep important identifier/action accessible.
- Editor: single-column main editing canvas; settings in tabs or sheets, not cramped right rail.
- Charts: resize responsively; do not rely on hover-only details.
- Forms: stack columns and maintain labels/errors; buttons should be easy to tap.
- Dialogs: use mobile-friendly sheets/full-screen flows for long forms.
- Media: responsive grid; avoid tiny thumbnails and inaccessible controls.

## Quality gates
No unintended horizontal viewport scroll, clipped labels, overlapping CTAs, unusable dialogs, or inaccessible offscreen menus. Test zoom to 200%, keyboard-only operation, long strings, empty states, and both themes.
