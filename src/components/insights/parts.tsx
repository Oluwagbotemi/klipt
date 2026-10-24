import { CardContent, VisualCard } from "@/components/visual/card";
import { Illustration, type IllustrationScene } from "@/components/visual/illustration";

/*
 * Small pieces shared by the SEO, Performance, Team and Settings screens, built
 * from components/visual. Candidates for components/visual once they settle.
 */

/** A full-width card with an illustration, a message and one next step. */
export function EmptyCard({
  scene,
  title,
  description,
  action,
  className,
}: {
  scene: IllustrationScene;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <VisualCard className={className}>
      <CardContent center className="px-5 py-12 sm:px-6">
        <Illustration scene={scene} />
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="text-muted-foreground max-w-md text-sm text-balance">{description}</p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </CardContent>
    </VisualCard>
  );
}

/** A small muted note under a card ("Checked the 500 most recent pages."). */
export function CardNote({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground px-1 text-xs">{children}</p>;
}

/** A striped bar for a stat tile with nothing to measure yet ("not yet", never zero data drawn as a bar). */
export function NothingYetBar({ label }: { label: string }) {
  return (
    <span role="img" aria-label={label} className="visual-hatch block h-3 w-full rounded-full" />
  );
}

/** Up to five initials in overlapping circles, for a stat tile about people. */
export function AvatarStack({ names }: { names: string[] }) {
  const shown = names.slice(0, 5);
  return (
    <span className="flex items-center" aria-hidden>
      {shown.map((name, i) => (
        <span
          key={`${name}-${i}`}
          className="bg-primary-soft text-primary-strong ring-surface-card -ml-1.5 grid size-8 place-items-center rounded-full text-[0.65rem] font-semibold ring-2 first:ml-0"
        >
          {initialsOf(name)}
        </span>
      ))}
      {names.length > shown.length && (
        <span className="text-muted-foreground ml-2 text-xs">+{names.length - shown.length}</span>
      )}
    </span>
  );
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
