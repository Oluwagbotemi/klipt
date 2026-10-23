---
name: cms-interface-design
description: Design and implement coherent, accessible, responsive interfaces for the SEO-first multi-site CMS using Next.js, TypeScript, Tailwind CSS, and shadcn/ui. Use when creating, modifying, reviewing, or implementing CMS screens, components, workflows, and themes.
---

# CMS Interface Design — Coding Agent Skill

## Mission
Implement a production-minded CMS UI that is visually consistent with `assets/`, follows the product IA, supports light/dark themes, and makes SEO understandable to non-specialists without removing expert controls.

## Required workflow for every task
1. Read `references/product-context.md` and the relevant sections of `references/information-architecture.md`.
2. Read `references/visual-language.md`, `references/design-system.md`, and `references/layout-patterns.md`; inspect the relevant images in `assets/` if image inspection is available.
3. Check the existing repository, package versions, routes, conventions, components, and tokens before writing code. Preserve existing conventions unless they conflict with explicit requirements.
4. State the screen's primary user, main job, and the intended behavior. Distinguish requirements from assumptions; ask about blockers only. Otherwise choose a reasonable, documented default.
5. Implement reusable components, semantic markup, keyboard interactions, both themes, and responsive layouts using `references/responsive-guidelines.md` and `references/interaction-patterns.md`.
6. Implement meaningful loading, empty, error, success, permission, and confirmation states where applicable. Do not leave decorative buttons or fake actions that appear functional.
7. Validate with available lint, typecheck, tests, and build commands; report what was run, any failures, and remaining backend dependencies. Never claim tests passed without running them.

## Stack
- Next.js App Router, React, TypeScript; respect versions installed in the project.
- Tailwind CSS for styling, with CSS-variable design tokens; prefer existing theme infrastructure.
- shadcn/ui and accessible underlying primitives for controls; do not blindly overwrite customized components.
- Lucide icons; use a consistent icon size and stroke.
- Server Components by default; Client Components only for interactive UI. Keep data and permission enforcement server-side.
- Use real services when available. Otherwise use typed mock fixtures explicitly marked as mock; no fabricated live metrics, ownership changes, or published states.

## Hard rules
- Light and dark are both first-class, with light as default; no hardcoded light-only text or surfaces.
- Primary accent is purple (#635BFF light; accessible adjusted dark tokens); semantic red/amber/green indicate status, not branding.
- Prioritize clarity and task completion over visual decoration. Keep dense tables scannable and forms legible.
- In-page content follows the **Visual direction (2026)** in `references/visual-language.md`: white page, white 20px bordered cards (no shadows) in a bento grid of equal-height rows, bold numbers, purple used sparingly, semantic tints, geometric vectors, quick motion — built from `src/components/visual/`. It does not change the sidebar or top bar.
- SEO basics in primary UI; canonical, robots, and schema in advanced settings. Do not present arbitrary character limits or SEO scores as search-engine guarantees.
- Distinguish account, site, and workspace. Transfer **site ownership**, not account ownership. Never simulate a completed transfer without acceptance and authoritative server confirmation.
- No unverified performance measurements. Field CWV requires real measurement sources; lab results must be labeled lab data.
- Do not assume a page builder exists: content editing and content modeling are in scope, but rendered-site frontend architecture is a separate decision.
- Use consistent empty-state and error-state treatments; always include an actionable next step.
- Meet WCAG 2.2 AA intent: focus visibility, contrast, keyboard navigation, input labels, error messaging, reduced motion.

## Reference loading map
- Product scope, roles, phase boundaries: `references/product-context.md`
- Route hierarchy and navigation: `references/information-architecture.md`
- Design tokens, color, typography, the 2026 visual direction (cards, charts, vectors, motion): `references/visual-language.md`
- Component conventions: `references/design-system.md`
- App shell and page composition: `references/layout-patterns.md`
- Breakpoints and responsive behavior: `references/responsive-guidelines.md`
- UI states and sensitive flows: `references/interaction-patterns.md`
- Accessibility checklist: `references/accessibility.md`
- Coding patterns and handoff: `references/implementation-guidelines.md`
- Visual references: `assets/reference-01-empty.png` through `assets/reference-05-light-dashboard.png`

## Definition of done
The screen supports its key workflow; uses shared tokens/components; has functional states; works at 360px, 768px, 1024px, and 1440px without unintended overflow; works in both themes; supports keyboard use; does not expose unauthorized actions; and passes available project checks. Clearly identify any mocked or backend-dependent behavior.
