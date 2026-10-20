import { cn } from "@/lib/utils";

/** A titled card on a Settings page. */
export function SettingsCard({
  title,
  description,
  children,
  tone,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  tone?: "danger";
}) {
  const id = `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "bg-card rounded-2xl border p-5 sm:p-6",
        tone === "danger" && "border-destructive/40",
      )}
    >
      <h2
        id={id}
        className={cn("text-base font-semibold", tone === "danger" && "text-destructive")}
      >
        {title}
      </h2>
      {description && <div className="text-muted-foreground mt-1 text-sm">{description}</div>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
