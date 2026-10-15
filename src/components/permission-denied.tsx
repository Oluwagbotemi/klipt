import Link from "next/link";
import { Lock } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, type SiteRole } from "@/lib/types";

export function PermissionDenied({
  area,
  role,
  backHref,
}: {
  area: string;
  role: SiteRole;
  backHref: string;
}) {
  return (
    <EmptyState
      icon={Lock}
      title={`You don't have access to ${area}`}
      description={`Your role on this site is ${ROLE_LABELS[role]}. Ask an owner or admin if you need access.`}
      action={
        <Button variant="outline" asChild>
          <Link href={backHref}>Go to Overview</Link>
        </Button>
      }
    />
  );
}
