# Sign-in and welcome scenes: rehearsal notes

Scenes in `scenes.tsx`, kit subset in `stage/kit/` (see its NOTICE.md).

- **Composition:** follows the owner's reference (a grey well with a few floating
  cards, one in focus, the rest faded), closest Stageshow gold `payout-flow`
  (choreography without a cursor) and `share`/`presence` for the people rows.
- **Filmed** with `.claude/skills/stageshow/scripts/film.mjs --gate` on the built
  sign-in, forgot-password and invitation pages (the welcome-step scenes need a
  session, so they were checked with Playwright stills and frames instead).
- **Fixed from the gate:** clipped crop, cursor covering a label, swapped labels that
  vanished (now a two-label crossfade), width jumps while typing (dot slots), text
  hopping on landing (`will-change`), tight name/email stacks, rows cut by the crop.
- **Left on purpose:** "uneven gutters" — the floating-card composition is the
  owner's chosen look, so the focus card doesn't bleed off an edge; and one
  "half-pixel glyph" note on the 14px tick inside the confirmed button.
- **Not checked:** the gate on the reactive welcome scenes (role, building, site), which
  have no script and only crossfade text when the person makes a choice.
