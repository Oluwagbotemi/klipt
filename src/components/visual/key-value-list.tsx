import { cn } from "@/lib/utils";

/**
 * Muted labels on the left, values on the right. An optional total sits under a
 * divider, like a receipt.
 */
export function KeyValueList({
  items,
  total,
  className,
}: {
  items: { key: string; label: React.ReactNode; value: React.ReactNode }[];
  total?: { label: React.ReactNode; value: React.ReactNode };
  className?: string;
}) {
  return (
    <dl className={cn("flex flex-col gap-2.5 text-sm", className)}>
      {items.map((item) => (
        <div key={item.key} className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground min-w-0">{item.label}</dt>
          <dd className="font-medium tabular-nums">{item.value}</dd>
        </div>
      ))}
      {total && (
        // Pinned to the bottom when the list fills a taller card.
        <div className="border-card-border mt-auto flex items-center justify-between gap-4 border-t pt-3">
          <dt className="text-muted-foreground">{total.label}</dt>
          <dd className="font-semibold tabular-nums">{total.value}</dd>
        </div>
      )}
    </dl>
  );
}
