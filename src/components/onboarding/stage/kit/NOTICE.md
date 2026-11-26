# Stageshow kit (subset)

These files are copied from the Stageshow skill's `kit/`
(https://github.com/benjitaylor/skills, commit 299140f), MIT licensed;
see `LICENSE` in this folder. Copyright (c) 2026 Benji Taylor.

Only the parts the sign-in and welcome scenes use are here: the stage and its
script runtime (`stage`, `act`, `cursor`, `cursors`, `keys`, `looks`,
`measure`, `clock`, `ease`, `reduced-motion`, `util`) and `motion/Swap`. Changes from upstream: formatted with Klipt's Prettier config.
ESLint's React Compiler rules are relaxed for this folder in
`eslint.config.mjs`. Update by copying the same files again from
`.claude/skills/stageshow/kit/`.
