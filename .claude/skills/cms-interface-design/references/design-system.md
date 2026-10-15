# Design System and Components

## Shared primitives
Use shadcn/ui where appropriate: Button, Input, Textarea, Select, Checkbox, Switch, RadioGroup, Tabs, Dialog, AlertDialog, Sheet, DropdownMenu, Tooltip, Popover, Card, Badge, Table, Skeleton, Toast/Sonner, Separator, Breadcrumb, Avatar. Customize via semantic tokens and variants, not page-specific duplication.

## Components to standardize
- AppShell, SiteSwitcher, SidebarNav, Topbar, PageHeader, Breadcrumbs.
- DataTable with sorting, filtering, pagination, row actions, selection, empty/loading/error states.
- ContentStatusBadge (Draft, In Review, Scheduled, Published, Archived).
- ContentCard, ContentListRow, EmptyState, ConfirmationDialog, InlineAlert.
- FormField with label, help text, required indicator, validation, and accessible error.
- SEOFieldGroup, SearchResultPreview, SocialPreview, SEOChecklist.
- MediaPicker, MediaDetails, AltTextField, UploadDropzone.
- MetricsCard, MetricTrend, ChartPanel, DateRangeControl.
- PermissionGate for display convenience (not authorization).
- OwnershipTransferDialog and TransferStatusPanel.

## Component rules
- Use icon + text for ambiguous actions; icon-only buttons require accessible labels and tooltips.
- Destructive actions use a destructive style and explicit confirmation.
- Every input has a visible label; placeholder is never the only label.
- Prefer compact tables for management and cards for visually browsed assets. Mobile data tables may become stacked rows, but preserve access to all actions.
- Search previews are approximations, not guaranteed Google snippets.
- Badges communicate meaningful status, not decorative categories.
- Chart color must not be the only encoding; include accessible summaries/labels.

## Token ownership
Define a single source of truth for theme tokens (e.g., `app/globals.css`) and map them into Tailwind. Avoid raw hex values scattered across JSX. Prefer existing shadcn conventions and existing project setup.
