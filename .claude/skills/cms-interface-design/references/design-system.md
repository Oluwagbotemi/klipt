# Design System and Components

## Shared primitives
Use shadcn/ui where appropriate: Button, Input, Textarea, Select, Checkbox, Switch, RadioGroup, Tabs, Dialog, AlertDialog, Sheet, DropdownMenu, Tooltip, Popover, Card, Badge, Table, Skeleton, Toast/Sonner, Separator, Breadcrumb, Avatar. Customize via semantic tokens and variants, not page-specific duplication.

## Components to standardize
- AppShell, SiteSwitcher, SidebarNav, Topbar, PageHeader, Breadcrumbs.
- DataTable with sorting, filtering, pagination, row actions, selection, empty/loading/error states.
- ContentStatusBadge (Draft, In Review, Scheduled, Published, Archived).
- ContentCard, ContentListRow, EmptyState, ConfirmationDialog, InlineAlert.
- Modals: glass frame (4px, white 10%, blur) around a soft panel; header with an icon tile, title and description; a white body card; equal-width footer buttons (cancel left, primary right). Sizes sm 400 / md 560 / lg 720px; confirmations and success states are small, forms are 720px.
- FormField with label, help text, required indicator, validation, and accessible error.
- SEOFieldGroup, SearchResultPreview, SocialPreview, SEOChecklist.
- MediaPicker, MediaDetails, AltTextField, UploadDropzone.
- MetricsCard, MetricTrend, ChartPanel, DateRangeControl.
- PermissionGate for display convenience (not authorization).
- OwnershipTransferDialog and TransferStatusPanel.

## Visual components (in-page content, 2026 direction)
`src/components/visual/` — use these on data screens instead of one-off markup:
- `VisualCard` (bordered, no shadow, `h-full` flex column), `CardHeader` (title, description,
  `IconTile`, round `ArrowButton`) at the top, `CardContent` (grows; `center` for empty states),
  `CardFooter` (pinned to the bottom) with `FooterLink`, `VisualNested`, `IconTile`.
- `StatCard` (fixed rhythm: label row, `CountUp` value, caption line with an optional `DeltaBadge`,
  chart slot; the whole card is a link whose border darkens on hover), `CountUp` / `ValueText`
  (muted decimals and units).
- `DeltaBadge` (↗/↘ tinted pill; `goodWhen` decides green vs red; sr-only sentence),
  `InfoChip` (icon + text pill, tones neutral/accent/success/warning/danger/info/hero),
  `KeyValueList` (receipt-style with an optional total).
- `PillTabs` (URL-driven segmented control, radiogroup, sliding white highlight).
- `ProgressBar` (gradient fill, ticks for the remainder, optional equal `steps`).
- Charts: `BarChart` (rounded columns, one accent bar, hatched future, tooltip, keyboard, sr-only
  table), `AreaChart` (smooth line, gradient wash, end dot, crosshair tooltip; `variant="sparkline"`
  for decorative mini trends), `Donut` (share of a whole, total in the centre, legend with counts and
  percentages), `ChartTooltip`, `HatchPattern`.
- `HeroCard` + `heroActionClass()` (the one dark highlight card per screen),
  `Illustration` (geometric empty/success scenes), `Celebrate` (milestone confetti).
- Buttons on data screens: `variant="ink"` (main) and `variant="soft"` (secondary), both pills.

Charts take precomputed strings (`valueText`) rather than formatter functions, so Server Components
can render them.

## Component rules
- Use icon + text for ambiguous actions; icon-only buttons require accessible labels and tooltips.
- Destructive actions use a destructive style and explicit confirmation.
- Every input has a visible label; placeholder is never the only label.
- Prefer compact tables for management and cards for visually browsed assets. Mobile data tables may become stacked rows, but preserve access to all actions.
- Search previews are approximations, not guaranteed Google snippets.
- Badges communicate meaningful status, not decorative categories.
- Chart color must not be the only encoding; include accessible summaries/labels.
- A card opens its full view either with the round arrow top-right or with a `FooterLink` at the
  bottom ("View all", "Open assignments"), not both.
- Cards in a grid row are always the same height: header top, content `flex-1`, footer bottom
  (see "Equal-height rows" in `visual-language.md`). Never position card parts with JS measuring.
- Empty states on data screens: `Illustration` + one sentence + one action. Success states may add
  `Celebrate` for real milestones only.

## Token ownership
Define a single source of truth for theme tokens (e.g., `app/globals.css`) and map them into Tailwind. Avoid raw hex values scattered across JSX. Prefer existing shadcn conventions and existing project setup.
