"use client";

import {
  Box,
  Check as CheckIcon,
  Crown,
  FileText,
  Globe,
  KeyRound,
  LifeBuoy,
  Lock,
  Newspaper,
  Plug,
  ShoppingBag,
} from "lucide-react";
import { Stage, type LookTokens } from "./stage/kit/stage";
import type { Act } from "./stage/kit/act";
import { Swap } from "./stage/kit/motion/Swap";
import { BUILDINGS, ROLES, type OnboardingBuilding, type OnboardingRole } from "@/lib/onboarding";
import "./scenes.css";

/*
 * The illustrations in the sign-in and welcome cards: Klipt itself, simplified
 * (Stageshow kit, see ./stage/kit/NOTICE.md). Faux UI only: nothing here is
 * real data or a working control. Each scene plays once when it comes into
 * view and holds its payoff; under reduced motion it shows that payoff still.
 */

const W = 520;
const H = 640;

/** Klipt's tokens for the kit, so the scenes follow light and dark mode. */
const TOKENS: LookTokens = {
  "--ss-canvas": "var(--card-nested)",
  "--ss-surface": "var(--surface-card)",
  "--ss-chrome": "var(--surface-card)",
  "--ss-raised": "var(--surface-card)",
  "--ss-text": "var(--muted-foreground)",
  "--ss-text-strong": "var(--foreground)",
  "--ss-text-faint": "var(--muted-foreground)",
  "--ss-line": "var(--card-border)",
  "--ss-accent": "var(--primary)",
  "--ss-accent-soft": "var(--primary-soft)",
  "--ss-success": "var(--success)",
  "--ss-font": "var(--font-sans)",
  "--ss-mono": "var(--font-mono)",
};

const CURSOR = { style: "arrow" as const, ripple: true, idle: 2500 };

function Bars({ widths, tone = "soft" }: { widths: number[]; tone?: "soft" | "strong" }) {
  return (
    <div className="kl-bars">
      {widths.map((w, i) => (
        <span key={i} className="kl-bar" data-tone={tone} style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function Avatar({ initials, tone = 0 }: { initials: string; tone?: number }) {
  return (
    <span className="kl-avatar" data-tone={tone}>
      {initials}
    </span>
  );
}

/** A faded card behind the one in focus: context, no words. */
function Ghost({ className, rows = 3 }: { className: string; rows?: number }) {
  return (
    <div className={`kl-card kl-ghost ${className}`}>
      <span className="kl-bar kl-bar--title" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="kl-ghost-row">
          <span className="kl-dot" />
          <span className="kl-bar" style={{ width: `${70 - i * 12}%` }} />
        </div>
      ))}
    </div>
  );
}

/**
 * Two labels in one grid cell, crossfading: both stay mounted, so the box keeps
 * the wider one's size and nothing pops in or out.
 */
function Crossfade({ on, from, to }: { on: boolean; from: React.ReactNode; to: React.ReactNode }) {
  return (
    <span className="kl-xfade">
      <span data-show={!on || undefined}>{from}</span>
      <span data-show={on || undefined}>{to}</span>
    </span>
  );
}

/* ---------- Publish: sign-in, sign-up, email confirmed ---------- */

type PublishState = { step: number; published: boolean };
const publishScript = async (a: Act<PublishState>) => {
  await a.wait(300);
  a.put({ step: 1 });
  await a.wait(900);
  await a.move({ at: "publish", x: 0.82, y: 0.78 }, { duration: 900 });
  await a.wait(150);
  await a.click();
  a.put({ published: true });
  await a.wait(700);
  a.put({ step: 2 });
};

export function PublishScene() {
  return (
    <Stage<PublishState>
      width={W}
      height={H}
      tokens={TOKENS}
      initial={{ step: 0, published: false }}
      poster={{ step: 2, published: true }}
      script={publishScript}
      play="once"
      cursor={{ at: { x: 470, y: 600 }, ...CURSOR }}
      fill
      className="kl-scene"
    >
      {(s) => (
        <>
          <Ghost className="kl-pos-tr" rows={4} />
          <Ghost className="kl-pos-bl" rows={2} />
          <div className="kl-card kl-focus kl-editor" data-in={s.step >= 1 || undefined}>
            <div className="kl-row kl-between">
              <span className="kl-muted">/posts/coastal-walks</span>
              <span className="kl-chip" data-tone={s.published ? "success" : "neutral"}>
                <Crossfade on={s.published} from="Draft" to="Published" />
              </span>
            </div>
            <p className="kl-title">Ten coastal walks worth the drive</p>
            <Bars widths={[96, 88, 92, 60]} />
            <div className="kl-row kl-between kl-foot">
              <span className="kl-row">
                <Avatar initials="SR" />
                <span className="kl-strong">Sam Rivera</span>
              </span>
              <span
                className="kl-btn"
                data-target="publish"
                data-cursor="pointer"
                data-done={s.published || undefined}
              >
                <Crossfade
                  on={s.published}
                  from="Publish"
                  to={
                    <>
                      <CheckIcon size={14} strokeWidth={3} />
                      Published
                    </>
                  }
                />
              </span>
            </div>
          </div>
          <div className="kl-toast" data-in={s.step >= 2 || undefined}>
            <Globe size={16} />
            <span>Live on northwind.example</span>
          </div>
        </>
      )}
    </Stage>
  );
}

/* ---------- Key: forgot and reset password ---------- */

type KeyState = { dots: number; saved: boolean };
const keyScript = async (a: Act<KeyState>) => {
  await a.wait(500);
  for (let i = 1; i <= 12; i++) {
    a.put({ dots: i });
    await a.wait(90);
  }
  await a.wait(300);
  await a.move({ at: "save", x: 0.82, y: 0.78 }, { duration: 800 });
  await a.click();
  a.put({ saved: true });
};

export function KeyScene() {
  return (
    <Stage<KeyState>
      width={W}
      height={H}
      tokens={TOKENS}
      initial={{ dots: 0, saved: false }}
      poster={{ dots: 12, saved: true }}
      script={keyScript}
      play="once"
      cursor={{ at: { x: 470, y: 600 }, ...CURSOR }}
      fill
      className="kl-scene"
    >
      {(s) => (
        <>
          <Ghost className="kl-pos-tr" rows={3} />
          <div className="kl-card kl-ghost kl-pos-bl kl-sessions">
            <span className="kl-bar kl-bar--title" />
            {[0, 1].map((i) => (
              <div key={i} className="kl-ghost-row">
                <span className="kl-dot" />
                <span className="kl-bar" style={{ width: `${60 - i * 15}%` }} />
              </div>
            ))}
          </div>
          <div className="kl-card kl-focus kl-key" data-in>
            <div className="kl-row">
              <span className="kl-tile">
                <KeyRound size={16} />
              </span>
              <span className="kl-strong">New password</span>
            </div>
            <div className="kl-field">
              <span className="kl-dots" aria-hidden>
                {Array.from({ length: 12 }, (_, i) => (
                  <span key={i} data-on={i < s.dots || undefined} />
                ))}
              </span>
            </div>
            <div className="kl-meter">
              <span style={{ width: `${Math.min(100, s.dots * 9)}%` }} />
            </div>
            <div className="kl-row kl-between kl-foot">
              <span className="kl-muted">
                <Lock size={14} className="kl-inline-icon" /> Other devices signed out
              </span>
              <span
                className="kl-btn"
                data-target="save"
                data-cursor="pointer"
                data-done={s.saved || undefined}
              >
                <Crossfade
                  on={s.saved}
                  from="Save"
                  to={
                    <>
                      <CheckIcon size={14} strokeWidth={3} />
                      Saved
                    </>
                  }
                />
              </span>
            </div>
          </div>
        </>
      )}
    </Stage>
  );
}

/* ---------- People: invitations, transfers, the team step ---------- */

const PEOPLE = [
  { initials: "BC", name: "Bessie Cooper", role: "Viewer" },
  { initials: "RC", name: "Riley Chen", role: "Editor" },
  { initials: "EH", name: "Esther Howard", role: "Author" },
];

type PeopleState = { step: number };
const peopleScript = async (a: Act<PeopleState>) => {
  await a.wait(400);
  a.put({ step: 1 });
  await a.wait(1400);
  a.put({ step: 2 });
};

/** `transfer` makes the focused person the new owner; `invite` has them join. */
export function PeopleScene({ variant = "invite" }: { variant?: "invite" | "transfer" }) {
  const focus = variant === "transfer" ? { ...PEOPLE[1], role: "Owner" } : PEOPLE[1];
  return (
    <Stage<PeopleState>
      width={W}
      height={H}
      tokens={TOKENS}
      initial={{ step: 0 }}
      poster={{ step: 2 }}
      script={peopleScript}
      play="once"
      fill
      className="kl-scene"
    >
      {(s) => (
        <div className="kl-people">
          {[PEOPLE[0], focus, PEOPLE[2]].map((person, i) => {
            const isFocus = i === 1;
            return (
              <div
                key={person.initials}
                className={`kl-card kl-person ${isFocus ? "kl-focus" : "kl-ghost"}`}
                data-row={i}
                data-in={!isFocus || s.step >= 1 || undefined}
              >
                <Avatar initials={person.initials} tone={i} />
                <span className="kl-person-name">
                  <span className="kl-strong">{person.name}</span>
                  <span className="kl-muted">
                    {person.initials.toLowerCase()}@northwind.example
                  </span>
                </span>
                {isFocus ? (
                  <span className="kl-chip" data-tone={s.step >= 2 ? "success" : "accent"}>
                    <Crossfade
                      on={s.step >= 2}
                      from={variant === "transfer" ? "Transfer sent" : "Invited"}
                      to={
                        <>
                          {variant === "transfer" && <Crown size={12} />}
                          {person.role}
                        </>
                      }
                    />
                  </span>
                ) : (
                  <span className="kl-chip" data-tone="neutral">
                    {person.role}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Stage>
  );
}

/* ---------- Welcome · role: the byline follows the choice ---------- */

export function RoleScene({ role }: { role: OnboardingRole | null }) {
  const label = role ? ROLES[role].label : "Your role";
  return (
    <Stage width={W} height={H} tokens={TOKENS} fill className="kl-scene">
      {() => (
        <>
          <Ghost className="kl-pos-tr" rows={3} />
          <div className="kl-card kl-focus kl-editor kl-settle" data-in>
            <p className="kl-title">Welcome to Klipt</p>
            <Bars widths={[94, 86, 70]} />
            <div className="kl-row kl-between kl-foot">
              <span className="kl-row">
                <Avatar initials="You" />
                <span className="kl-strong">You</span>
              </span>
              <span className="kl-chip" data-tone={role ? "accent" : "neutral"}>
                <Swap id={label}>{label}</Swap>
              </span>
            </div>
          </div>
          <Ghost className="kl-pos-bl" rows={2} />
        </>
      )}
    </Stage>
  );
}

/* ---------- Welcome · building: the site's content types follow the choice ---------- */

const BUILDING_NODES: Record<
  OnboardingBuilding,
  { icon: typeof FileText; label: string; path: string }
> = {
  blog: { icon: Newspaper, label: "Posts", path: "/posts/…" },
  company: { icon: FileText, label: "Pages", path: "/about, /contact…" },
  docs: { icon: LifeBuoy, label: "Docs", path: "/docs/…" },
  store: { icon: ShoppingBag, label: "Products", path: "/products/…" },
  other: { icon: Box, label: "Pages and posts", path: "/…" },
};

export function BuildingScene({ building }: { building: OnboardingBuilding | null }) {
  const node = building ? BUILDING_NODES[building] : null;
  const Icon = node?.icon ?? Box;
  return (
    <Stage width={W} height={H} tokens={TOKENS} fill className="kl-scene">
      {() => (
        <>
          <Ghost className="kl-pos-tr" rows={2} />
          <div className="kl-card kl-focus kl-sitemap kl-settle">
            <div className="kl-row">
              <span className="kl-tile">
                <Globe size={16} />
              </span>
              <span className="kl-strong">Your site</span>
            </div>
            <div className="kl-tree">
              <div className="kl-node">
                <FileText size={16} />
                <span>Pages</span>
                <span className="kl-muted">/…</span>
              </div>
              <div className="kl-node">
                <Newspaper size={16} />
                <span>Posts</span>
                <span className="kl-muted">/posts/…</span>
              </div>
              <div className="kl-node kl-node--new" data-on={node || undefined}>
                <Icon size={16} />
                <Swap id={building ?? "none"}>
                  <span className="kl-strong">{node ? node.label : "Choose one"}</span>
                </Swap>
                <span className="kl-muted">
                  <Swap id={`${building}-path`}>{node ? node.path : ""}</Swap>
                </span>
              </div>
            </div>
            <p className="kl-muted kl-note">
              <Swap id={`${building}-note`}>
                {building ? BUILDINGS[building].setsUp[0] : "Pick what you're building"}
              </Swap>
            </p>
          </div>
          <Ghost className="kl-pos-bl" rows={2} />
        </>
      )}
    </Stage>
  );
}

/* ---------- Welcome · site: the tab mirrors what's typed ---------- */

export function SiteScene({ name, domain }: { name: string; domain: string }) {
  const shown = name.trim() || "Your site";
  const initials =
    shown
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "K";
  return (
    <Stage width={W} height={H} tokens={TOKENS} fill className="kl-scene">
      {() => (
        <div className="kl-browser kl-settle">
          <div className="kl-tabs">
            <span className="kl-tab">
              <span className="kl-tab-mark">{initials}</span>
              <span className="kl-strong kl-ellipsis">{shown}</span>
            </span>
            <span className="kl-tab kl-tab--ghost">
              <span className="kl-bar" style={{ width: 60 }} />
            </span>
          </div>
          <div className="kl-url">
            <Lock size={14} />
            <span className="kl-ellipsis">{domain.trim() || "yoursite.com"}</span>
          </div>
          <div className="kl-page">
            <p className="kl-title kl-ellipsis">{shown}</p>
            <Bars widths={[80, 64]} />
            <div className="kl-tiles">
              {[0, 1, 2].map((i) => (
                <div key={i} className="kl-mini">
                  <span className="kl-bar kl-bar--title" />
                  <span className="kl-num">{[16, 3, 2][i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Stage>
  );
}

/* ---------- Welcome · connect: a request with the key succeeds ---------- */

type ConnectState = { step: number };
const connectScript = async (a: Act<ConnectState>) => {
  await a.wait(500);
  a.put({ step: 1 });
  await a.wait(1100);
  a.put({ step: 2 });
};

export function ConnectScene() {
  return (
    <Stage<ConnectState>
      width={W}
      height={H}
      tokens={TOKENS}
      initial={{ step: 0 }}
      poster={{ step: 2 }}
      script={connectScript}
      play="once"
      fill
      className="kl-scene"
    >
      {(s) => (
        <>
          <div className="kl-card kl-focus kl-code">
            <div className="kl-row kl-between">
              <span className="kl-row">
                <span className="kl-tile">
                  <Plug size={16} />
                </span>
                <span className="kl-strong">Your website</span>
              </span>
              <span className="kl-chip" data-tone={s.step >= 2 ? "success" : "neutral"}>
                <Crossfade on={s.step >= 2} from="Fetching" to="200 OK" />
              </span>
            </div>
            <pre>
              <span className="kl-c">{"// app/page.tsx"}</span>
              {"\nconst res = await fetch(\n  "}
              <span className="kl-s">{'"/api/v1/entries"'}</span>
              {",\n  { headers: {\n    Authorization: "}
              <span className="kl-s">{'"Bearer klipt_••••"'}</span>
              {"\n  } }\n);"}
            </pre>
          </div>
          <div className="kl-card kl-focus kl-response" data-in={s.step >= 1 || undefined}>
            {["Ten coastal walks", "Winter reading list", "About us"].map((title, i) => (
              <div key={title} className="kl-entry" style={{ transitionDelay: `${i * 120}ms` }}>
                <CheckIcon size={14} />
                <span className="kl-strong">{title}</span>
                <span className="kl-muted">published</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Stage>
  );
}
