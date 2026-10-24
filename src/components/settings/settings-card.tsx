import type { LucideIcon } from "lucide-react";
import { IconTile } from "@/components/visual/card";
import { cn } from "@/lib/utils";

/**
 * A titled section on a settings-style page (Settings, Account, model and menu editors): a
 * full-width visual-direction card (20px, thin light border, no shadow).
 *
 * `layout="split"` (the default) puts the title and description on the left third and the
 * fields on the right two-thirds from `lg` up, with the fields capped at `max-w-xl` so inputs
 * never stretch across a wide screen; below `lg` it stacks. `layout="stacked"` keeps the title
 * above full-width content (lists, previews, editors). Forms put their Save row last; it is
 * pinned to the bottom of the card.
 */
export function SettingsCard({
  title,
  description,
  children,
  tone,
  icon,
  action,
  layout = "split",
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  tone?: "danger";
  icon?: LucideIcon;
  /** Shown beside the title (a status chip, a link). */
  action?: React.ReactNode;
  layout?: "split" | "stacked";
}) {
  const id = `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const split = layout === "split";
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "visual-card flex h-full min-w-0 flex-col gap-5 p-5 sm:p-6",
        split && "lg:grid lg:grid-cols-3 lg:gap-8",
        tone === "danger" && "border-destructive/40",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && <IconTile icon={icon} tone={tone === "danger" ? "danger" : "accent"} />}
        <div className="min-w-0 flex-1">
          <h2
            id={id}
            className={cn(
              "text-base leading-tight font-semibold",
              tone === "danger" && "text-danger-strong",
            )}
          >
            {title}
          </h2>
          {description && <div className="text-muted-foreground mt-1 text-sm">{description}</div>}
        </div>
        {action}
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-col", split && "lg:col-span-2")}>
        <div className={cn("flex w-full flex-1 flex-col", split && "max-w-xl")}>{children}</div>
      </div>
    </section>
  );
}
