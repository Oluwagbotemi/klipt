import { CircleCheck, CircleX, Clock, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { deliveryState, type DeliveryStatus } from "@/lib/webhooks";

const STYLE = {
  delivered: { label: "Delivered", variant: "success", icon: CircleCheck },
  failed: { label: "Failed", variant: "destructive", icon: CircleX },
  retrying: { label: "Retrying", variant: "warning", icon: RotateCw },
  queued: { label: "Queued", variant: "outline", icon: Clock },
} as const;

/** Delivery result, as icon + text so it never relies on colour alone. */
export function DeliveryStatusBadge({
  delivery,
}: {
  delivery: { status: DeliveryStatus; attempts: number };
}) {
  const { label, variant, icon: Icon } = STYLE[deliveryState(delivery)];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
