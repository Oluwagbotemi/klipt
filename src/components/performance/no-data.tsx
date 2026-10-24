import Link from "next/link";
import { EmptyCard } from "@/components/insights/parts";
import { Button } from "@/components/ui/button";

/** Shown on Performance tabs until the website has sent its first measurement. */
export function NotConnected({ overviewHref }: { overviewHref: string }) {
  return (
    <div className="w-full px-4 py-6 sm:px-8">
      <EmptyCard
        scene="connect"
        title="No measurements yet"
        description="These numbers come from real visits to your website. Connect your website in Performance › Overview to start collecting them."
        action={
          <Button variant="ink" asChild>
            <Link href={overviewHref}>Connect your website</Link>
          </Button>
        }
      />
    </div>
  );
}
