import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A change between periods as a tinted pill: ↗ green when the change is good,
 * ↘ red when it's bad. The arrow and the sr-only sentence carry the meaning, so
 * colour is never the only signal.
 */
export function DeltaBadge({
  value,
  unit = "",
  goodWhen = "up",
  comparedTo,
  className,
}: {
  /** Signed change, e.g. 3 or -12. */
  value: number;
  /** Shown after the number, e.g. "%". */
  unit?: string;
  goodWhen?: "up" | "down";
  /** e.g. "previous 7 days", for screen readers and the title. */
  comparedTo: string;
  className?: string;
}) {
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const tone =
    direction === "flat" ? "neutral" : direction === goodWhen ? "good" : ("bad" as const);
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const amount = `${Math.abs(value)}${unit}`;
  const sentence =
    direction === "flat"
      ? `No change from the ${comparedTo}`
      : `${direction === "up" ? "Up" : "Down"} ${amount} from the ${comparedTo}`;
  return (
    <span
      title={sentence}
      className={cn(
        "visual-rise inline-flex h-6 items-center gap-0.5 rounded-full px-2 text-xs font-semibold tabular-nums",
        tone === "good" && "bg-success-soft text-success-strong",
        tone === "bad" && "bg-danger-soft text-danger-strong",
        tone === "neutral" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden strokeWidth={2.5} />
      <span aria-hidden>{direction === "flat" ? "0" : amount}</span>
      <span className="sr-only">{sentence}</span>
    </span>
  );
}
