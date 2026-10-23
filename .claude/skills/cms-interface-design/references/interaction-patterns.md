# Interaction Patterns and Workflow Rules

## Every async flow
Define idle, pending, success, error, and retry. Show save/publish feedback based on confirmed server result. Disable duplicate submissions while pending; preserve form input on failure.

## Content lifecycle
Draft -> In Review -> Approved (if enabled) -> Scheduled/Published -> Archived. Exact role permissions and transitions are configurable; never assume authors can publish. Preview must clearly distinguish draft from live. URL edits to published content should suggest a 301 redirect with a clear explanation.

## SEO editing
Show primary controls (SEO title, description, slug, alt text). Group canonical URL, robots directives, schema mapping under Advanced. Validate URLs and explain consequences of noindex. SEO checks are recommendations, not ranking guarantees. Schema markup needs real validation; no fabricated validation result.

## Ownership transfer — high-risk workflow
1. Owner opens Site Settings > Ownership, sees current owner and site.
2. Selects existing eligible member or invites a recipient by verified email.
3. Shows exact site, recipient, access/billing/domain/integration implications, and whether agency retains admin access.
4. Requires reauthentication or appropriate step-up verification for the current owner.
5. Creates pending invitation; recipient is notified. Current owner can cancel while pending.
6. Recipient authenticates, reviews terms, and explicitly accepts or declines.
7. Server atomically updates site owner and permissions after acceptance; log actor, recipient, site, and timestamp. Only then display completed status.
8. Handle expired invites, revoked access, duplicate requests, failed delivery, transfer rejection, and ownership/billing dependencies.
Do not transfer account ownership, claim domain registrar ownership changed, or silently move external billing credentials. Server authorization is mandatory.

## Data screens: interaction and motion
- Every chart responds: hover, tap and focus show the same dark tooltip (value first, label second);
  the chart is one tab stop and the arrow keys move between bars/points; Escape clears. Hovered marks
  change shade (darker neutral / lighter accent). Values are also in an sr-only table and a visible headline.
- Filters that scope a whole screen (period: 7D / 28D / 90D) are `PillTabs` in one row above the
  content, kept in the URL, and every card below follows them.
- Motion is feedback, not decoration: count-up on first view and on period change, bars grow,
  lines draw, deltas rise in, card borders darken on hover, arrows nudge, the pill highlight slides. ≤ 400ms, ease-out,
  off under reduced motion. One milestone celebration at most, only for something real.
- Numbers are never invented to fill a tile: no data → an illustration and the next step.

## Other safeguards
Delete site/content: explicit confirmation and consequences. Domain/robots/indexing changes: explain SEO risks. Permission changes: confirm when removing own access. Use non-blocking toasts for low-risk success, dialogs for irreversible decisions.
