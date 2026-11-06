import { cn, initials } from "@/lib/utils";

/**
 * A site's tile: its favicon or logo (Settings › General › Brand) when set,
 * otherwise a neutral monogram. Purple is reserved for primary actions and selection.
 * Small tiles prefer the favicon; large ones prefer the logo.
 */
export function SiteAvatar({
  name,
  logoUrl,
  faviconUrl,
  prefer = "favicon",
  className,
}: {
  name: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  prefer?: "favicon" | "logo";
  className?: string;
}) {
  const image = prefer === "logo" ? (logoUrl ?? faviconUrl) : (faviconUrl ?? logoUrl);
  return (
    <span
      aria-hidden
      data-site-avatar={image ? "image" : "initials"}
      className={cn(
        "bg-background text-foreground relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border text-xs font-semibold",
        // Logos are usually drawn for a light background, so they keep one in dark mode too.
        image && "bg-white",
        className,
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- media library file
        <img
          src={image}
          alt=""
          className="absolute inset-[12%] size-[76%] object-contain"
          loading="lazy"
        />
      ) : (
        initials(name.replace(/&/g, ""))
      )}
    </span>
  );
}
