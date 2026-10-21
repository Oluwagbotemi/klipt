import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

/*
 * Sending email. With RESEND_API_KEY set, messages go to Resend's HTTP API.
 * Without it, outside production (or with ALLOW_DEV_OUTBOX=1), they're written
 * to a local outbox (EMAIL_OUTBOX_DIR, default .data/emails) instead, so every
 * flow can be tried locally. Tests send nothing unless they install a
 * transport. Callers never wait on delivery: see sendInBackground().
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** What the email is about (e.g. "invitation"); used in logs and the outbox. */
  kind: string;
}

export type EmailTransport = (message: EmailMessage) => Promise<void>;

export type EmailMode = "resend" | "outbox" | "off";

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Klipt <onboarding@resend.dev>";

let customTransport: EmailTransport | null = null;

/** Replaces how email is sent (tests). Pass null to go back to the default. */
export function setEmailTransport(transport: EmailTransport | null) {
  customTransport = transport;
}

export function emailMode(): EmailMode {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.NODE_ENV === "test") return "off";
  if (process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_OUTBOX === "1") {
    return "outbox";
  }
  return "off";
}

/** Whether Klipt can send email at all (real or to the dev outbox). */
export function emailEnabled(): boolean {
  return customTransport !== null || emailMode() !== "off";
}

/** Sends one message. Throws when the provider refuses it; callers catch. */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (customTransport) {
    await customTransport(message);
    return true;
  }
  switch (emailMode()) {
    case "resend":
      await sendWithResend(message);
      return true;
    case "outbox":
      await writeToOutbox(message);
      return true;
    case "off":
      console.warn(`Email not sent (${message.kind}): email isn't set up. See docs/email.md.`);
      return false;
  }
}

/** POSTs to Resend. `fetchImpl` is replaceable for tests. */
export async function sendWithResend(message: EmailMessage, fetchImpl: typeof fetch = fetch) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY isn't set.");
  const replyTo = process.env.EMAIL_REPLY_TO;
  const response = await fetchImpl(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      tags: [{ name: "kind", value: message.kind.replace(/[^\w-]/g, "_") }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    // Resend's error body names the problem (e.g. an unverified domain), never the key.
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Resend refused the email (${response.status}): ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Dev outbox
// ---------------------------------------------------------------------------

export interface OutboxEmail extends EmailMessage {
  id: string;
  createdAt: string;
}

function outboxDir() {
  return path.resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    process.env.EMAIL_OUTBOX_DIR ?? path.join(".data", "emails"),
  );
}

async function writeToOutbox(message: EmailMessage) {
  const dir = outboxDir();
  await mkdir(dir, { recursive: true });
  const createdAt = new Date();
  const id = `${createdAt.getTime()}-${randomBytes(4).toString("hex")}`;
  const email: OutboxEmail = { id, createdAt: createdAt.toISOString(), ...message };
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify(email, null, 2));
  console.log(`Email to ${message.to} (${message.kind}) saved to the dev outbox: ${id}`);
}

/** Outbox messages, newest first. Only meaningful in outbox mode. */
export async function listOutbox(limit = 100): Promise<OutboxEmail[]> {
  let files: string[];
  try {
    files = (await readdir(outboxDir())).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  files.sort().reverse();
  const emails = await Promise.all(
    files.slice(0, limit).map(async (name) => {
      try {
        return JSON.parse(await readFile(path.join(outboxDir(), name), "utf8")) as OutboxEmail;
      } catch {
        return null;
      }
    }),
  );
  return emails.filter((email): email is OutboxEmail => email !== null);
}

export async function readOutboxEmail(id: string): Promise<OutboxEmail | null> {
  if (!/^\d+-[0-9a-f]{8}$/.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(outboxDir(), `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}
