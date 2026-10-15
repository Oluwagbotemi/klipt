# Implementation and Delivery Guidelines

## Repository first
Inspect `package.json`, Next.js version, Tailwind version, shadcn configuration, theme provider, routes, components, and tests. Use compatible patterns; do not install a new library when the repository already has an equivalent.

## Architecture
- TypeScript interfaces/types for content, site, membership, SEO metadata, and transfer states.
- Keep presentation components separate from data access and mutations.
- Next.js App Router conventions: Server Components for read-only views, client boundaries for interactive controls; server-side authorization for mutations and protected data.
- Use existing API conventions. Validate user input at trusted boundaries; escape/sanitize rich text and URLs; protect media uploads.
- Build theme support with CSS variables, a `.dark` selector or existing provider, and avoid hydration mismatch.
- Use native Next.js image optimization where appropriate; avoid shipping unnecessarily large images or heavy client bundles.
- For pages published by CMS, rendering/output architecture is a separate decision from the admin interface. Do not assert CWV guarantees.

## Fixtures and copy
Mock data must be realistic but explicitly mock. Use neutral site and content names, not real user names from visual references. Never invent verified SEO scores, live page performance, or completed transfers.

## Verification
Run available formatting/lint/typecheck/test/build scripts, then inspect responsive layouts in both themes where browser tooling exists. If unavailable, report manual verification steps and untested areas. Include changed files and known limitations in handoff.

## Example screen request contract
Input: `Build Content > All Content`.
Output: page layout, content list with search/status filters, sorting, create action, pagination, empty/loading/error states, mobile adaptation, theme support, semantic accessible controls, and mock-data disclosure if no backend.
