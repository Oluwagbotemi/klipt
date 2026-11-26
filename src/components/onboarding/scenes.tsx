"use client";

import { useMemo } from "react";
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
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { Stage, type LookTokens } from "./stage/kit/stage";
import type { Act } from "./stage/kit/act";
import {
  BUILDINGS,
  ROLES,
  ROLE_KEYS,
  type OnboardingBuilding,
  type OnboardingRole,
} from "@/lib/onboarding";
import "./scenes.css";

/*
 * The illustrations in the sign-in and welcome cards: Klipt itself, simplified
 * (Stageshow kit, see ./stage/kit/NOTICE.md). Faux UI only: nothing here is
 * real data or a working control.
 *
 * Each scene loops calmly (8–14s): one story told by the card in focus, which
 * ends where it began (or leaves and comes back, a visible reset), while the
 * faded cards behind it drift and shimmer. The stage pauses offscreen and in
 * hidden tabs; under reduced motion it shows the poster still and the CSS
 * drift is off.
 */

const W = 520;
const H = 760;

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

function Bars({ widths, shown }: { widths: number[]; shown?: number }) {
  return (
    <div className="kl-bars">
      {widths.map((w, i) => (
        <span
          key={i}
          className="kl-bar kl-grow"
          data-on={shown === undefined || i < shown || undefined}
          style={{ width: `${w}%` }}
        />
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

/** A faded card behind the one in focus: context, no words. It drifts and shimmers. */
function Ghost({ className, rows = 3 }: { className: string; rows?: number }) {
  return (
    <div className={`kl-card kl-ghost ${className}`}>
      <span className="kl-bar kl-bar--title kl-shimmer" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="kl-ghost-row">
          <span className="kl-dot" />
          <span className="kl-bar kl-shimmer" style={{ width: `${70 - i * 12}%` }} />
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
  return <Cycle index={on ? 1 : 0} items={[from, to]} />;
}

/** Any number of labels in one cell; the one at `index` shows. */
function Cycle({ index, items }: { index: number; items: React.ReactNode[] }) {
  return (
    <span className="kl-xfade">
      {items.map((item, i) => (
        <span key={i} data-show={i === index || undefined} aria-hidden={i !== index || undefined}>
          {item}
        </span>
      ))}
    </span>
  );
}

/* ---------- Publish: sign-in, sign-up, email confirmed ---------- */

const POSTS = [
  { title: "Ten coastal walks worth the drive", path: "/posts/coastal-walks" },
  { title: "A winter reading list", path: "/posts/winter-reading" },
];

type PublishState = { post: number; in: boolean; published: boolean; toast: boolean };
const PUBLISH_START: PublishState = { post: 0, in: false, published: false, toast: false };

// Two drafts per loop: each arrives, is published, is announced, then moves on
// for the next. The loop ends with the stage empty, as it began.
const publishScript = async (a: Act<PublishState>) => {
  for (const post of [0, 1]) {
    a.put({ post, in: true, published: false, toast: false });
    await a.wait(1300);
    await a.move({ at: "publish", x: 0.82, y: 0.78 }, { duration: 900 });
    await a.wait(150);
    await a.click();
    a.put({ published: true });
    await a.wait(600);
    a.put({ toast: true });
    await a.wait(2200);
    a.put({ toast: false, in: false });
    await a.wait(800);
  }
  a.put({ post: 0, published: false });
};

export function PublishScene() {
  return (
    <Stage<PublishState>
      width={W}
      height={H}
      tokens={TOKENS}
      initial={PUBLISH_START}
      poster={{ post: 0, in: true, published: true, toast: true }}
      script={publishScript}
      play="loop"
      cursor={{ at: { x: 470, y: 700 }, ...CURSOR }}
      fill
      className="kl-scene"
    >
      {(s) => {
        const post = POSTS[s.post];
        return (
          <>
            <Ghost className="kl-pos-tr kl-drift-a" rows={4} />
            <Ghost className="kl-pos-bl kl-drift-b" rows={2} />
            <div className="kl-float kl-editor-slot">
              <div className="kl-card kl-focus kl-editor" data-in={s.in || undefined}>
                <div className="kl-row kl-between">
                  <span className="kl-muted">{post.path}</span>
                  <span className="kl-chip" data-tone={s.published ? "success" : "neutral"}>
                    <Crossfade on={s.published} from="Draft" to="Published" />
                  </span>
                </div>
                <p className="kl-title">
                  {post.title}
                  <span className="kl-caret" data-on={!s.published || undefined} />
                </p>
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
            </div>
            <div className="kl-toast" data-in={s.toast || undefined}>
              <Globe size={16} />
              <span>Live on northwind.example</span>
            </div>
          </>
        );
      }}
    </Stage>
  );
}

/* ---------- Key: forgot and reset password ---------- */

type KeyState = { dots: number; saved: boolean };
const keyScript = async (a: Act<KeyState>) => {
  await a.wait(700);
  for (let i = 1; i <= 12; i++) {
    a.put({ dots: i });
    await a.wait(110);
  }
  await a.wait(400);
  await a.move({ at: "save", x: 0.82, y: 0.78 }, { duration: 900 });
  await a.click();
  a.put({ saved: true });
  await a.wait(3200);
  // The field clears for the next change: the meter and dots fade back
  a.put({ dots: 0, saved: false });
  await a.wait(1200);
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
      play="loop"
      cursor={{ at: { x: 470, y: 700 }, ...CURSOR }}
      fill
      className="kl-scene"
    >
      {(s) => (
        <>
          <Ghost className="kl-pos-tr kl-drift-a" rows={3} />
          <Ghost className="kl-pos-bl kl-drift-b" rows={2} />
          <div className="kl-float kl-key-slot">
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
  { initials: "JW", name: "Jamal Wright", role: "Editor" },
];

type PeopleState = { shown: number; joined: number };
// People join one by one: a row arrives as "Invited", then turns into their
// role. After a pause the list clears and the next round starts.
const peopleScript = async (a: Act<PeopleState>) => {
  await a.wait(400);
  for (let i = 1; i <= PEOPLE.length; i++) {
    a.put({ shown: i });
    await a.wait(1000);
    a.put({ joined: i });
    await a.wait(700);
  }
  await a.wait(2600);
  a.put({ shown: 0, joined: 0 });
};

/** `transfer` makes the last person the new owner; `invite` has everyone join. */
export function PeopleScene({ variant = "invite" }: { variant?: "invite" | "transfer" }) {
  return (
    <Stage<PeopleState>
      width={W}
      height={H}
      tokens={TOKENS}
      initial={{ shown: 0, joined: 0 }}
      poster={{ shown: PEOPLE.length, joined: PEOPLE.length }}
      script={peopleScript}
      play="loop"
      fill
      className="kl-scene"
    >
      {(s) => (
        <div className="kl-people">
          <div className="kl-people-head kl-drift-b">
            <span className="kl-strong">Team</span>
            <span className="kl-chip" data-tone="neutral">
              <Cycle
                index={s.joined}
                items={PEOPLE.map((_, n) => `${n} of ${PEOPLE.length} joined`).concat(
                  `${PEOPLE.length} of ${PEOPLE.length} joined`,
                )}
              />
            </span>
          </div>
          {PEOPLE.map((person, i) => {
            const owner = variant === "transfer" && i === PEOPLE.length - 1;
            const joined = i < s.joined;
            return (
              <div
                key={person.initials}
                className="kl-card kl-focus kl-person"
                data-row={i}
                data-in={i < s.shown || undefined}
              >
                <Avatar initials={person.initials} tone={i % 3} />
                <span className="kl-person-name">
                  <span className="kl-strong">{person.name}</span>
                  <span className="kl-muted">
                    {person.initials.toLowerCase()}@northwind.example
                  </span>
                </span>
                <span className="kl-chip" data-tone={joined ? "success" : "accent"}>
                  <Crossfade
                    on={joined}
                    from={owner ? "Transfer sent" : "Invited"}
                    to={
                      <>
                        {owner && <Crown size={12} />}
                        {owner ? "Owner" : person.role}
                      </>
                    }
                  />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Stage>
  );
}

/* ---------- Welcome · role: the byline follows the choice ---------- */

type RoleState = { i: number; lines: number };
const ROLE_CYCLE = ROLE_KEYS.filter((key) => key !== "other");

export function RoleScene({ role }: { role: OnboardingRole | null }) {
  // Until a role is chosen the byline cycles through them; once chosen it
  // holds it while the post writes itself.
  const script = useMemo(
    () => async (a: Act<RoleState>) => {
      for (let i = 0; i < 4; i++) {
        if (!role) a.put({ i: i % ROLE_CYCLE.length });
        for (let line = 1; line <= 3; line++) {
          a.put({ lines: line });
          await a.wait(700);
        }
        await a.wait(900);
        a.put({ lines: 0 });
        await a.wait(500);
      }
      a.put({ i: 0, lines: 0 });
    },
    [role],
  );
  return (
    <Stage<RoleState>
      width={W}
      height={H}
      tokens={TOKENS}
      initial={{ i: 0, lines: 0 }}
      poster={{ i: 0, lines: 3 }}
      script={script}
      play="loop"
      fill
      className="kl-scene"
    >
      {(s) => {
        const label = role ? ROLES[role].label : ROLES[ROLE_CYCLE[s.i]].label;
        return (
          <>
            <Ghost className="kl-pos-tr kl-drift-a" rows={3} />
            <Ghost className="kl-pos-bl kl-drift-b" rows={2} />
            <div className="kl-float kl-editor-slot">
              <div className="kl-card kl-focus kl-editor" data-in>
                <p className="kl-title">Welcome to Klipt</p>
                <Bars widths={[94, 86, 70]} shown={s.lines} />
                <div className="kl-row kl-between kl-foot">
                  <span className="kl-row">
                    <Avatar initials="You" />
                    <span className="kl-strong">You</span>
                  </span>
                  <span className="kl-chip" data-tone={role ? "accent" : "neutral"}>
                    {role ? (
                      label
                    ) : (
                      <Cycle index={s.i} items={ROLE_CYCLE.map((key) => ROLES[key].label)} />
                    )}
                  </span>
                </div>
              </div>
            </div>
          </>
        );
      }}
    </Stage>
  );
}

/* ---------- Welcome · building: the chosen preset's types assemble ---------- */

const BUILDING_NODES: Record<
  OnboardingBuilding,
  { icon: typeof FileText; label: string; path: string; fields: string[] }
> = {
  blog: { icon: Newspaper, label: "Posts", path: "/posts/…", fields: ["Body", "Tags"] },
  company: { icon: FileText, label: "Pages", path: "/about…", fields: ["Title", "Body"] },
  docs: { icon: LifeBuoy, label: "Docs", path: "/docs/…", fields: ["Summary", "Body"] },
  store: { icon: ShoppingBag, label: "Products", path: "/products/…", fields: ["Price", "Image"] },
  other: { icon: Box, label: "Pages and posts", path: "/…", fields: ["Body"] },
};

type BuildState = { n: number };

export function BuildingScene({ building }: { building: OnboardingBuilding | null }) {
  const node = building ? BUILDING_NODES[building] : null;
  const Icon = node?.icon ?? Box;
  // The site's types assemble one by one: Pages, Posts, then the chosen type and
  // its fields. It holds, clears and assembles again.
  const script = useMemo(
    () => async (a: Act<BuildState>) => {
      await a.wait(400);
      for (let n = 1; n <= 4; n++) {
        a.put({ n });
        await a.wait(900);
      }
      await a.wait(3400);
      a.put({ n: 0 });
      await a.wait(900);
    },
    [],
  );
  return (
    <Stage<BuildState>
      key={building ?? "none"}
      width={W}
      height={H}
      tokens={TOKENS}
      initial={{ n: 0 }}
      poster={{ n: 4 }}
      script={script}
      play="loop"
      fill
      className="kl-scene"
    >
      {(s) => (
        <>
          <Ghost className="kl-pos-tr kl-drift-a" rows={2} />
          <Ghost className="kl-pos-bl kl-drift-b" rows={2} />
          <div className="kl-float kl-sitemap-slot">
            <div className="kl-card kl-focus kl-sitemap" data-in>
              <div className="kl-row">
                <span className="kl-tile">
                  <Globe size={16} />
                </span>
                <span className="kl-strong">Your site</span>
              </div>
              <div className="kl-tree">
                <div className="kl-node kl-rise" data-on={s.n >= 1 || undefined}>
                  <FileText size={16} />
                  <span>Pages</span>
                  <span className="kl-muted">/…</span>
                </div>
                <div className="kl-node kl-rise" data-on={s.n >= 2 || undefined}>
                  <Newspaper size={16} />
                  <span>Posts</span>
                  <span className="kl-muted">/posts/…</span>
                </div>
                <div
                  className="kl-node kl-node--new kl-rise"
                  data-on={s.n >= 3 || undefined}
                  data-chosen={node ? true : undefined}
                >
                  <Icon size={16} />
                  <span className="kl-strong">{node ? node.label : "Choose one"}</span>
                  <span className="kl-muted">{node ? node.path : ""}</span>
                </div>
                <div className="kl-fields">
                  {(node?.fields ?? ["…"]).map((field, i) => (
                    <span
                      key={field}
                      className="kl-chip kl-rise"
                      data-tone="accent"
                      data-on={s.n >= 4 || undefined}
                      style={{ transitionDelay: `${i * 140}ms` }}
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </div>
              <p className="kl-muted kl-note">
                {building ? BUILDINGS[building].setsUp[0] : "Pick what you're building"}
              </p>
            </div>
          </div>
        </>
      )}
    </Stage>
  );
}

/* ---------- Welcome · site: the tab and address follow what's typed ---------- */

type SiteState = { chars: number; secure: boolean; count: number };

export function SiteScene({ name, domain }: { name: string; domain: string }) {
  const shown = name.trim() || "Your site";
  const address = domain.trim() || "yoursite.com";
  const initials =
    shown
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "K";
  // The address types itself in, turns secure, then the site's numbers tick up.
  const script = useMemo(
    () => async (a: Act<SiteState>) => {
      await a.wait(500);
      for (let c = 1; c <= address.length; c++) {
        a.put({ chars: c });
        await a.wait(Math.max(40, Math.round(1600 / address.length)));
      }
      await a.wait(300);
      a.put({ secure: true });
      for (let c = 1; c <= 8; c++) {
        a.put({ count: c });
        await a.wait(220);
      }
      await a.wait(3000);
      a.put({ chars: 0, secure: false, count: 0 });
      await a.wait(900);
    },
    [address],
  );
  return (
    <Stage<SiteState>
      width={W}
      height={H}
      tokens={TOKENS}
      initial={{ chars: 0, secure: false, count: 0 }}
      poster={{ chars: address.length, secure: true, count: 8 }}
      script={script}
      play="loop"
      fill
      className="kl-scene"
    >
      {(s) => (
        <div className="kl-float kl-browser-slot">
          <div className="kl-browser">
            <div className="kl-tabs">
              <span className="kl-tab">
                <span className="kl-tab-mark">{initials}</span>
                <span className="kl-strong kl-ellipsis">{shown}</span>
              </span>
              <span className="kl-tab kl-tab--ghost">
                <span className="kl-bar kl-shimmer" style={{ width: 60 }} />
              </span>
            </div>
            <div className="kl-url">
              <span className="kl-url-lock" data-on={s.secure || undefined}>
                <Crossfade on={s.secure} from={<Lock size={14} />} to={<ShieldCheck size={14} />} />
              </span>
              <span className="kl-ellipsis">{address.slice(0, s.chars)}</span>
              <span className="kl-caret" data-on={!s.secure || undefined} />
            </div>
            <div className="kl-page">
              <p className="kl-title kl-ellipsis">{shown}</p>
              <Bars widths={[80, 64]} />
              <div className="kl-tiles">
                {[16, 3, 2].map((total, i) => (
                  <div key={i} className="kl-mini">
                    <span className="kl-bar kl-bar--title" />
                    <span className="kl-num">{Math.round((total * s.count) / 8)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Stage>
  );
}

/* ---------- Welcome · connect: a snippet types, then the request succeeds ---------- */

const CODE_LINES: { text: string; kind?: "c" | "s" }[][] = [
  [{ text: "// app/page.tsx", kind: "c" }],
  [{ text: "const res = await fetch(" }],
  [{ text: "  " }, { text: '"/api/v1/entries"', kind: "s" }, { text: "," }],
  [{ text: "  { headers: { Authorization: " }],
  [{ text: "    " }, { text: '"Bearer klipt_••••"', kind: "s" }, { text: " } }" }],
  [{ text: ");" }],
];

type ConnectState = { lines: number; fetching: boolean; ok: boolean };
const connectScript = async (a: Act<ConnectState>) => {
  await a.wait(400);
  for (let line = 1; line <= CODE_LINES.length; line++) {
    a.put({ lines: line });
    await a.wait(420);
  }
  await a.wait(400);
  a.put({ fetching: true });
  await a.wait(1100);
  a.put({ ok: true });
  await a.wait(3600);
  a.put({ lines: 0, fetching: false, ok: false });
  await a.wait(900);
};

export function ConnectScene() {
  return (
    <Stage<ConnectState>
      width={W}
      height={H}
      tokens={TOKENS}
      initial={{ lines: 0, fetching: false, ok: false }}
      poster={{ lines: CODE_LINES.length, fetching: true, ok: true }}
      script={connectScript}
      play="loop"
      fill
      className="kl-scene"
    >
      {(s) => (
        <>
          <div className="kl-float kl-code-slot">
            <div className="kl-card kl-focus kl-code" data-in>
              <div className="kl-row kl-between">
                <span className="kl-row">
                  <span className="kl-tile">
                    <Plug size={16} />
                  </span>
                  <span className="kl-strong">Your website</span>
                </span>
                <span className="kl-chip" data-tone={s.ok ? "success" : "neutral"}>
                  <Cycle
                    index={s.ok ? 2 : s.fetching ? 1 : 0}
                    items={["Ready", "Fetching…", "200 OK"]}
                  />
                </span>
              </div>
              <pre>
                {CODE_LINES.map((line, i) => (
                  <span key={i} className="kl-line" data-on={i < s.lines || undefined}>
                    {line.map((part, j) => (
                      <span key={j} className={part.kind ? `kl-${part.kind}` : undefined}>
                        {part.text}
                      </span>
                    ))}
                  </span>
                ))}
              </pre>
            </div>
          </div>
          <div className="kl-card kl-focus kl-response" data-in={s.ok || undefined}>
            {["Ten coastal walks", "A winter reading list", "About us"].map((title, i) => (
              <div key={title} className="kl-entry" style={{ transitionDelay: `${i * 160}ms` }}>
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
