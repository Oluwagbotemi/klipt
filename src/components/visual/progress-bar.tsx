import { cn } from "@/lib/utils";

/**
 * Progress with a gradient fill; the remaining part is drawn as thin ticks
 * (capacity still to go). With `steps`, the bar is split into that many equal
 * segments, each filled or not.
 */
export function ProgressBar({
  value,
  max,
  label,
  steps,
  tone = "accent",
  className,
}: {
  value: number;
  max: number;
  /** Accessible name, e.g. "Setup progress". */
  label: string;
  steps?: number;
  tone?: "accent" | "success" | "warning" | "danger";
  className?: string;
}) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const fill = {
    accent: "from-primary/60 to-primary",
    success: "from-success/60 to-success",
    warning: "from-warning/60 to-warning",
    danger: "from-destructive/60 to-destructive",
  }[tone];

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("flex h-3 w-full gap-1", className)}
    >
      {steps ? (
        Array.from({ length: steps }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-full flex-1 rounded-full",
              i < value ? cn("visual-grow-x bg-linear-to-r", fill) : "visual-ticks",
            )}
            style={i < value ? { animationDelay: `${i * 60}ms` } : undefined}
          />
        ))
      ) : (
        <>
          {share > 0 && (
            <span
              className={cn("visual-grow-x h-full rounded-full bg-linear-to-r", fill)}
              style={{ width: `${share * 100}%` }}
            />
          )}
          {share < 1 && <span className="visual-ticks h-full flex-1 rounded-full" />}
        </>
      )}
    </div>
  );
}
