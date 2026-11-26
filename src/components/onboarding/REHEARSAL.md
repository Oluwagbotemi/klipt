# Sign-in and welcome scenes: rehearsal notes

Scenes in `scenes.tsx`, kit subset in `stage/kit/` (see its NOTICE.md).

- **Composition:** follows the owner's reference (a grey well with a few floating
  cards, one in focus, the rest faded), closest Stageshow gold `payout-flow`
  (choreography without a cursor) and `share`/`presence` for the people rows.
- **Filmed** with `.claude/skills/stageshow/scripts/film.mjs --gate` on the built
  sign-in and forgot-password pages, and the welcome scenes through `/dev/scenes`
  (building with "Online store", connect, site, team). Scenes now loop (8–14s),
  so the gate reports "inconclusive" and asks for a watch of the motion.
- **Fixed in the looping pass:** chip labels that swapped (team count, role byline,
  connect status) now stack every label in one cell (`Cycle`), so nothing vanishes or
  changes width; assembling nodes and response rows stay on a layer (`will-change`);
  the sitemap tree hangs from the head icon so its rows don't sit 12px off the title;
  the publish toast no longer runs 1px from a ghost card's edge; the team loop's empty
  handoff went from 1.1s to 0.25s.
- **Fixed earlier:** clipped crop, cursor covering a label, swapped labels that
  vanished (now a two-label crossfade), width jumps while typing (dot slots), text
  hopping on landing (`will-change`), tight name/email stacks, rows cut by the crop.
- **Left on purpose:** "uneven gutters" — the floating-card composition is the
  owner's chosen look, so the focus card doesn't bleed off an edge; and one
  "half-pixel glyph" note on the 14px tick inside the confirmed button (not reported
  in the latest run); "scale 1.05" — the scene fills the panel, which is a little
  wider than the 520px design; site scene "lopsided"/"jump" while the address types
  itself (the typing is the story); team "near-empty frames" for 250ms when the
  loop resets.
- **Not filmed:** the role scene (same editor card and crossfade as sign-in).
