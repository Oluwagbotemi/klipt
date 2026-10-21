import Link from "next/link";
import { Gauge } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/** Shown on Performance tabs until the website has sent its first measurement. */
export function NotConnected({ overviewHref }: { overviewHref: string }) {
  return (
    <EmptyState
      icon={Gauge}
      title="No measurements yet"
      description="These numbers come from real visits to your website. Connect your website in Performance › Overview to start collecting them."
      action={
        <Button asChild>
          <Link href={overviewHref}>Connect your website</Link>
        </Button>
      }
    />
  );
}
