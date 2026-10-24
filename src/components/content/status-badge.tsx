import { Archive, CalendarClock, CircleDot, Eye, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type ContentStatus } from "@/lib/content";

const STYLE: Record<
  ContentStatus,
  { variant: "secondary" | "warning" | "outline" | "success" | "info"; icon: typeof CircleDot }
> = {
  draft: { variant: "secondary", icon: PencilLine },
  in_review: { variant: "warning", icon: Eye },
  scheduled: { variant: "info", icon: CalendarClock },
  published: { variant: "success", icon: CircleDot },
  archived: { variant: "outline", icon: Archive },
};

/** Content lifecycle status. Icon + text, so meaning never relies on colour alone. */
export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  const { variant, icon: Icon } = STYLE[status];
  return (
    <Badge
      variant={variant}
      className={status === "archived" ? "text-muted-foreground" : undefined}
    >
      <Icon aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
