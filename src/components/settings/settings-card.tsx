import type { LucideIcon } from "lucide-react";
import { IconTile } from "@/components/visual/card";
import { cn } from "@/lib/utils";

/**
 * A titled card on a settings-style page (Settings, Account, model and menu editors): the
 * visual-direction card (20px, thin light border, no shadow) with an optional icon tile.
 */
export function SettingsCard({
  title,
  description,
  children,
  tone,
  icon,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  tone?: "danger";
  icon?: LucideIcon;
}) {
  const id = `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section
      aria-labelledby={id}
      className={cn("visual-card p-5 sm:p-6", tone === "danger" && "border-destructive/40")}
    >
      <div className="flex items-start gap-3">
        {icon && <IconTile icon={icon} tone={tone === "danger" ? "danger" : "accent"} />}
        <div className="min-w-0 flex-1">
          <h2
            id={id}
            className={cn("text-base font-semibold", tone === "danger" && "text-destructive")}
          >
            {title}
          </h2>
          {description && <div className="text-muted-foreground mt-1 text-sm">{description}</div>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
