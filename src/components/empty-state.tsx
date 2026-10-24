import type { LucideIcon } from "lucide-react";
import { Illustration, type IllustrationScene } from "@/components/visual/illustration";
import { cn } from "@/lib/utils";

/**
 * Centered empty state with one concise message and a next step. With `scene` it shows one of
 * the geometric illustrations; otherwise the icon sits on a small geometric composition (tinted
 * disc, hatched card) in the same style. Both are decorative: the text carries the message.
 */
export function EmptyState({
  icon: Icon,
  scene,
  title,
  description,
  action,
  children,
  className,
}: {
  icon: LucideIcon;
  scene?: IllustrationScene;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center sm:py-24",
        className,
      )}
    >
      {scene ? (
        <Illustration scene={scene} className="mb-5 h-28" />
      ) : (
        <div aria-hidden data-illustration="icon" className="visual-rise relative mb-6 size-28">
          <span className="bg-primary-soft absolute inset-0 rounded-full" />
          <span className="visual-hatch absolute top-6 left-3 h-16 w-14 -rotate-12 rounded-xl" />
          <span className="border-card-border bg-surface-card absolute top-4 left-1/2 grid h-20 w-16 -translate-x-1/2 rotate-3 place-items-center rounded-2xl border">
            <span className="bg-primary-soft text-primary-strong grid size-9 place-items-center rounded-xl">
              <Icon className="size-4.5" />
            </span>
          </span>
          <span className="bg-primary absolute right-3 bottom-4 size-4 rounded-full" />
        </div>
      )}
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="text-muted-foreground mt-2 text-sm">{description}</p>}
      {children}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
