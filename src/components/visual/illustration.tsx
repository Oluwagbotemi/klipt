import { HatchPattern } from "@/components/visual/hatch-pattern";
import { cn } from "@/lib/utils";

/*
 * Small geometric scenes for empty and success states. Drawn with theme tokens
 * (fill-*, stroke-*), so they follow light and dark mode; always decorative
 * (aria-hidden) — the text next to them carries the message.
 */

export type IllustrationScene =
  "content" | "media" | "success" | "connect" | "activity" | "calendar";

const HATCH = "klipt-illustration-hatch";

export function Illustration({
  scene,
  className,
}: {
  scene: IllustrationScene;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 160 112"
      aria-hidden
      className={cn("visual-rise h-24 w-auto shrink-0", className)}
      fill="none"
    >
      <defs>
        <HatchPattern id={HATCH} />
      </defs>
      {SCENES[scene]}
    </svg>
  );
}

const card = "fill-card stroke-border";
const line = "fill-muted";

const SCENES: Record<IllustrationScene, React.ReactNode> = {
  content: (
    <>
      <circle cx="80" cy="56" r="50" className="fill-primary-soft" />
      <rect
        x="30"
        y="28"
        width="62"
        height="74"
        rx="10"
        fill={`url(#${HATCH})`}
        transform="rotate(-8 61 65)"
      />
      <rect x="52" y="18" width="66" height="80" rx="12" className={card} strokeWidth="1.5" />
      <rect x="62" y="32" width="34" height="6" rx="3" className="fill-foreground/80" />
      <rect x="62" y="46" width="46" height="4" rx="2" className={line} />
      <rect x="62" y="56" width="40" height="4" rx="2" className={line} />
      <rect x="62" y="66" width="44" height="4" rx="2" className={line} />
      <rect x="62" y="76" width="26" height="4" rx="2" className={line} />
      <circle cx="118" cy="86" r="14" className="fill-primary" />
      <path
        d="M118 80v12M112 86h12"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="stroke-primary-foreground"
      />
    </>
  ),
  media: (
    <>
      <circle cx="80" cy="56" r="50" className="fill-primary-soft" />
      <rect x="28" y="22" width="104" height="72" rx="14" className={card} strokeWidth="1.5" />
      <rect x="36" y="30" width="88" height="56" rx="9" fill={`url(#${HATCH})`} />
      <path d="M40 82l24-28 16 18 10-10 30 20z" className="fill-foreground/80" />
      <path d="M78 82l12-12 30 12z" className="fill-primary" />
      <circle cx="108" cy="44" r="7" className="fill-primary" />
    </>
  ),
  success: (
    <>
      <circle cx="80" cy="56" r="50" className="fill-success-soft" />
      <circle cx="80" cy="56" r="34" fill={`url(#${HATCH})`} />
      <circle cx="80" cy="56" r="24" className="fill-success" />
      <path
        d="M69 56l8 8 15-16"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-card"
      />
      <rect
        x="22"
        y="22"
        width="10"
        height="10"
        rx="2"
        transform="rotate(20 27 27)"
        className="fill-primary"
      />
      <circle cx="132" cy="28" r="5" className="fill-warning" />
      <rect
        x="126"
        y="80"
        width="8"
        height="8"
        rx="2"
        transform="rotate(-15 130 84)"
        className="fill-primary/60"
      />
      <circle cx="34" cy="88" r="4" className="fill-success" />
    </>
  ),
  connect: (
    <>
      <circle cx="80" cy="56" r="50" className="fill-primary-soft" />
      <rect x="18" y="34" width="46" height="44" rx="12" className={card} strokeWidth="1.5" />
      <rect x="27" y="45" width="28" height="5" rx="2.5" className="fill-foreground/80" />
      <rect x="27" y="56" width="20" height="4" rx="2" className={line} />
      <rect x="27" y="64" width="24" height="4" rx="2" className={line} />
      <rect x="96" y="34" width="46" height="44" rx="12" className="fill-hero" />
      <circle cx="119" cy="56" r="9" className="fill-primary" />
      <path
        d="M64 56h32"
        strokeWidth="2"
        strokeDasharray="4 5"
        strokeLinecap="round"
        className="stroke-foreground/50"
      />
      <circle cx="80" cy="56" r="6" className="fill-card stroke-primary" strokeWidth="2" />
    </>
  ),
  activity: (
    <>
      <circle cx="80" cy="56" r="50" className="fill-primary-soft" />
      <path d="M48 24v66" strokeWidth="2" className="stroke-border" />
      {[30, 54, 78].map((y, i) => (
        <g key={y}>
          <circle
            cx="48"
            cy={y}
            r="6"
            className={i === 0 ? "fill-primary" : "fill-card stroke-border"}
            strokeWidth="1.5"
          />
          <rect
            x="62"
            y={y - 8}
            width={i === 0 ? 62 : 52}
            height="16"
            rx="8"
            className={i === 0 ? card : ""}
            fill={i === 0 ? undefined : `url(#${HATCH})`}
            strokeWidth="1.5"
          />
        </g>
      ))}
    </>
  ),
  calendar: (
    <>
      <circle cx="80" cy="56" r="50" className="fill-primary-soft" />
      <rect x="38" y="24" width="84" height="72" rx="14" className={card} strokeWidth="1.5" />
      <rect x="38" y="24" width="84" height="18" rx="9" className="fill-foreground/80" />
      {[0, 1, 2, 3].map((col) =>
        [0, 1].map((row) => (
          <rect
            key={`${col}-${row}`}
            x={48 + col * 17}
            y={52 + row * 18}
            width="12"
            height="12"
            rx="3"
            className={col === 2 && row === 0 ? "fill-primary" : ""}
            fill={col === 2 && row === 0 ? undefined : `url(#${HATCH})`}
          />
        )),
      )}
    </>
  ),
};

/**
 * A short burst of geometric confetti for milestone moments. Plays once; skipped
 * entirely under reduced motion (the global rule ends it instantly).
 */
export function Celebrate({ className }: { className?: string }) {
  const pieces = [
    { dx: "-46px", dy: "-38px", spin: "160deg", shape: "rounded-[2px]", tone: "bg-primary" },
    { dx: "40px", dy: "-44px", spin: "-120deg", shape: "rounded-full", tone: "bg-warning" },
    { dx: "56px", dy: "-6px", spin: "200deg", shape: "rounded-[2px]", tone: "bg-success" },
    { dx: "-58px", dy: "4px", spin: "-180deg", shape: "rounded-full", tone: "bg-primary/60" },
    { dx: "-24px", dy: "-58px", spin: "90deg", shape: "rounded-full", tone: "bg-success" },
    { dx: "18px", dy: "-62px", spin: "-90deg", shape: "rounded-[2px]", tone: "bg-primary" },
    { dx: "-40px", dy: "36px", spin: "140deg", shape: "rounded-[2px]", tone: "bg-warning" },
    { dx: "44px", dy: "34px", spin: "-150deg", shape: "rounded-full", tone: "bg-primary/60" },
  ];
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 grid place-items-center", className)}
    >
      {pieces.map((piece, i) => (
        <span
          key={i}
          className={cn("absolute size-2", piece.shape, piece.tone)}
          style={
            {
              "--dx": piece.dx,
              "--dy": piece.dy,
              "--spin": piece.spin,
              opacity: 0,
              animation: `visual-burst 600ms var(--motion-ease) ${120 + i * 25}ms both`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
