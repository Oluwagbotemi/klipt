import { CircleCheck, CircleX, Clock, RotateCw } from "lucide-react";
import { InfoChip } from "@/components/visual/info-chip";
import { deliveryState, type DeliveryStatus } from "@/lib/webhooks";

const STYLE = {
  delivered: { label: "Delivered", tone: "success", icon: CircleCheck },
  failed: { label: "Failed", tone: "danger", icon: CircleX },
  retrying: { label: "Retrying", tone: "warning", icon: RotateCw },
  queued: { label: "Queued", tone: "neutral", icon: Clock },
} as const;

/** Delivery result, as icon + text so it never relies on colour alone. */
export function DeliveryStatusBadge({
  delivery,
}: {
  delivery: { status: DeliveryStatus; attempts: number };
}) {
  const { label, tone, icon } = STYLE[deliveryState(delivery)];
  return (
    <InfoChip tone={tone} icon={icon} className="shrink-0">
      {label}
    </InfoChip>
  );
}
