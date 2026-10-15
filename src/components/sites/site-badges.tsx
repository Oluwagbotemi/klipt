import { ArrowRightLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type SiteSummary } from "@/lib/types";

export function SiteBadges({ site }: { site: SiteSummary }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline">{ROLE_LABELS[site.currentUserRole]}</Badge>
      {site.publishState === "live" ? (
        <Badge variant="success">
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          Live
        </Badge>
      ) : (
        <Badge variant="secondary">Not published</Badge>
      )}
      {site.pendingTransfer && (
        <Badge variant="warning">
          <ArrowRightLeft aria-hidden />
          Transfer pending
        </Badge>
      )}
    </div>
  );
}
