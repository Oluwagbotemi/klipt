"use client";

import Link from "next/link";
import { FileText, Image as ImageIcon, Loader2, Newspaper, Plug } from "lucide-react";
import { useCreateEntry } from "@/components/content/new-entry-button";
import { Button } from "@/components/ui/button";
import { siteHref } from "@/lib/navigation";
import { quickActionOrder, type OnboardingRole } from "@/lib/onboarding";

/**
 * Shortcuts for the most common jobs as pills, limited to what the member can
 * do. `order` is the member's welcome-flow role (developers see Connect first).
 */
export function QuickActions({
  siteId,
  canCreate,
  canUpload,
  canIntegrate,
  order = null,
}: {
  siteId: string;
  canCreate: boolean;
  canUpload: boolean;
  canIntegrate: boolean;
  order?: OnboardingRole | null;
}) {
  const { create, pending } = useCreateEntry(siteId);
  const icon = (Icon: typeof FileText) =>
    pending ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />;

  const visible = quickActionOrder(order).filter((action) =>
    action === "media" ? canUpload : action === "connect" ? canIntegrate : canCreate,
  );
  if (visible.length === 0) return null;
  // The first action is the dark "ink" pill; the rest are soft.
  const variant = (action: string) => (action === visible[0] ? "ink" : "soft");
  return (
    <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
      {visible.map((action) => {
        if (action === "post" || action === "page") {
          return (
            <Button
              key={action}
              variant={variant(action)}
              onClick={() => create(action)}
              disabled={pending}
            >
              {icon(action === "post" ? Newspaper : FileText)}
              {action === "post" ? "New post" : "New page"}
            </Button>
          );
        }
        return (
          <Button key={action} variant={variant(action)} asChild>
            <Link
              href={
                action === "media"
                  ? siteHref(siteId, "media")
                  : siteHref(siteId, "settings", "integrations")
              }
            >
              {action === "media" ? <ImageIcon aria-hidden /> : <Plug aria-hidden />}
              {action === "media" ? "Upload media" : "Connect website"}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

/** "Write a post" on the dark highlight card. */
export function HeroCreateButton({ siteId, className }: { siteId: string; className: string }) {
  const { create, pending } = useCreateEntry(siteId);
  return (
    <button type="button" className={className} onClick={() => create("post")} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Newspaper aria-hidden />}
      Write a post
    </button>
  );
}
