/*
 * Email templates. One shared layout: the Klipt wordmark, a heading, a few
 * short paragraphs, one button, the link written out in full, and a footer
 * saying why the person got it. HTML is table-based with inline styles so it
 * renders in email clients; every message also has a plain-text part. All
 * text passed in is escaped here, so callers pass plain strings.
 *
 * Colors are written out (email clients don't support CSS variables); they
 * match the app's light theme.
 */

import type { EmailMessage } from "@/server/email/transport";

export type Template = Omit<EmailMessage, "to">;

const COLORS = {
  page: "#f5f5f7",
  card: "#ffffff",
  border: "#e5e5ea",
  text: "#1c1c1e",
  muted: "#6b6b76",
  accent: "#635bff",
  onAccent: "#ffffff",
  quote: "#f3f2ff",
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Keeps names and titles to one tidy line in subjects. */
function oneLine(value: string, max = 80) {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

interface LayoutInput {
  kind: string;
  subject: string;
  /** Hidden preview line shown by inbox lists. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** Optional quoted text, e.g. a reviewer's note. */
  quote?: { label: string; text: string };
  button: { label: string; url: string };
  /** Why they got this email, and what to do if it wasn't expected. */
  footer: string[];
}

function layout(input: LayoutInput): Template {
  const p = (text: string) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${COLORS.text};">${escapeHtml(text)}</p>`;
  const quote = input.quote
    ? `<p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${COLORS.muted};">${escapeHtml(input.quote.label)}</p>
<div style="margin:0 0 20px;padding:12px 16px;border-left:3px solid ${COLORS.accent};background:${COLORS.quote};border-radius:6px;font-size:15px;line-height:24px;color:${COLORS.text};white-space:pre-wrap;">${escapeHtml(input.quote.text)}</div>`
    : "";
  const url = escapeHtml(input.button.url);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${COLORS.text};">Klipt</td></tr>
<tr><td style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:16px;padding:32px 28px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:${COLORS.text};">${escapeHtml(input.heading)}</h1>
${input.paragraphs.map(p).join("\n")}
${quote}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
<tr><td style="border-radius:10px;background:${COLORS.accent};">
<a href="${url}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:${COLORS.onAccent};text-decoration:none;border-radius:10px;">${escapeHtml(input.button.label)}</a>
</td></tr>
</table>
<p style="margin:0 0 4px;font-size:13px;line-height:20px;color:${COLORS.muted};">Or copy this link into your browser:</p>
<p style="margin:0;font-size:13px;line-height:20px;word-break:break-all;"><a href="${url}" style="color:${COLORS.accent};">${url}</a></p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:18px;color:${COLORS.muted};">
${input.footer.map((line) => `<p style="margin:0 0 8px;">${escapeHtml(line)}</p>`).join("\n")}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    input.heading,
    "",
    ...input.paragraphs.flatMap((line) => [line, ""]),
    ...(input.quote ? [`${input.quote.label}`, input.quote.text, ""] : []),
    `${input.button.label}: ${input.button.url}`,
    "",
    "—",
    ...input.footer,
    "",
    "Klipt",
  ].join("\n");

  return { kind: input.kind, subject: input.subject, html, text };
}

const NOT_EXPECTED = "If you weren't expecting this, you can ignore it.";

function notificationFooter(accountUrl: string) {
  return [
    "You're getting this because of your work on a Klipt site.",
    `To stop emails about assignments and reviews, turn them off on your account page: ${accountUrl}`,
  ];
}

// ---------------------------------------------------------------------------
// Team and ownership
// ---------------------------------------------------------------------------

export function invitationEmail(input: {
  inviterName: string | null;
  siteName: string;
  roleLabel: string;
  url: string;
  days: number;
}): Template {
  const inviter = input.inviterName ? oneLine(input.inviterName) : "Someone";
  const site = oneLine(input.siteName);
  return layout({
    kind: "invitation",
    subject: `${inviter} invited you to ${site} on Klipt`,
    preheader: `Join ${site} as ${input.roleLabel}.`,
    heading: `Join ${site} on Klipt`,
    paragraphs: [
      `${inviter} invited you to work on ${site} as ${input.roleLabel}.`,
      `Sign in, or create a Klipt account, with this email address to accept. The link works once and expires in ${input.days} days.`,
    ],
    button: { label: "Accept invitation", url: input.url },
    footer: [
      `You're getting this because someone invited this address to a Klipt site.`,
      NOT_EXPECTED,
    ],
  });
}

export function transferRequestEmail(input: {
  ownerName: string;
  siteName: string;
  url: string;
  days: number;
}): Template {
  const owner = oneLine(input.ownerName);
  const site = oneLine(input.siteName);
  return layout({
    kind: "transfer_request",
    subject: `${owner} wants to make you the owner of ${site}`,
    preheader: `Review and accept or decline the ownership of ${site}.`,
    heading: `Become the owner of ${site}?`,
    paragraphs: [
      `${owner} started transferring the ownership of ${site} on Klipt to you.`,
      `Nothing changes until you accept. Sign in with this email address to review the details, then accept or decline. The link expires in ${input.days} days.`,
    ],
    button: { label: "Review the transfer", url: input.url },
    footer: [
      `You're getting this because a site owner named this address as the new owner.`,
      NOT_EXPECTED,
    ],
  });
}

export function transferAnsweredEmail(input: {
  accepted: boolean;
  recipient: string;
  siteName: string;
  retainedAdmin: boolean;
  url: string;
}): Template {
  const site = oneLine(input.siteName);
  const who = oneLine(input.recipient);
  if (input.accepted) {
    return layout({
      kind: "transfer_accepted",
      subject: `${who} is now the owner of ${site}`,
      preheader: `The ownership transfer of ${site} is complete.`,
      heading: "Ownership transfer complete",
      paragraphs: [
        `${who} accepted, and is now the owner of ${site}.`,
        input.retainedAdmin
          ? "You're still on the site as an Admin."
          : "As you chose when starting the transfer, you no longer have access to this site.",
      ],
      button: input.retainedAdmin
        ? { label: "Open the site", url: input.url }
        : { label: "Go to your sites", url: input.url },
      footer: ["You're getting this because you transferred a Klipt site."],
    });
  }
  return layout({
    kind: "transfer_declined",
    subject: `${who} declined ownership of ${site}`,
    preheader: `You're still the owner of ${site}.`,
    heading: "Ownership transfer declined",
    paragraphs: [
      `${who} declined to become the owner of ${site}. You're still the owner, and nothing changed.`,
      "You can start a new transfer from the site's Ownership settings.",
    ],
    button: { label: "Open Ownership settings", url: input.url },
    footer: ["You're getting this because you started transferring a Klipt site."],
  });
}

// ---------------------------------------------------------------------------
// Account security
// ---------------------------------------------------------------------------

export function passwordResetEmail(input: {
  name: string;
  url: string;
  minutes: number;
}): Template {
  return layout({
    kind: "password_reset",
    subject: "Reset your Klipt password",
    preheader: "Choose a new password for Klipt.",
    heading: "Reset your password",
    paragraphs: [
      `Hi ${oneLine(input.name)}, someone asked to reset the password for your Klipt account.`,
      `Choose a new password with the button below. The link works once and expires in ${input.minutes} minutes. Afterwards, every device will need to sign in again.`,
    ],
    button: { label: "Choose a new password", url: input.url },
    footer: [
      "You're getting this because a password reset was requested for this address.",
      "If it wasn't you, ignore this email: your password stays the same.",
    ],
  });
}

export function verifyEmailEmail(input: { name: string; url: string }): Template {
  return layout({
    kind: "verify_email",
    subject: "Confirm your email for Klipt",
    preheader: "One click to confirm this is your email address.",
    heading: "Confirm your email",
    paragraphs: [
      `Hi ${oneLine(input.name)}, confirm that this is your email address so Klipt can send you invitations, password resets and updates about your work.`,
      "The link expires in 1 hour. You can send a new one from your account page.",
    ],
    button: { label: "Confirm email", url: input.url },
    footer: [
      "You're getting this because this address was used for a Klipt account.",
      NOT_EXPECTED,
    ],
  });
}

export function emailChangedEmail(input: {
  name: string;
  newEmail: string;
  resetUrl: string;
}): Template {
  return layout({
    kind: "email_changed",
    subject: "Your Klipt email was changed",
    preheader: `Your Klipt account now uses ${input.newEmail}.`,
    heading: "Your email was changed",
    paragraphs: [
      `Hi ${oneLine(input.name)}, the email for your Klipt account was changed to ${input.newEmail}. You'll sign in with that address from now on.`,
      "If you didn't make this change, reset your password right away and contact the owner of your sites.",
    ],
    button: { label: "Reset password", url: input.resetUrl },
    footer: ["You're getting this because it's the address your Klipt account used before."],
  });
}

// ---------------------------------------------------------------------------
// Assignments and reviews
// ---------------------------------------------------------------------------

interface EntryContext {
  actorName: string;
  title: string;
  siteName: string;
  url: string;
  accountUrl: string;
}

const entryTitle = (title: string) =>
  title.trim() ? `“${oneLine(title, 70)}”` : "an untitled entry";

export function assignedEmail(input: EntryContext & { dueOn: string | null }): Template {
  const title = entryTitle(input.title);
  const site = oneLine(input.siteName);
  return layout({
    kind: "assigned",
    subject: `${oneLine(input.actorName)} assigned you ${title}`,
    preheader: `${title} on ${site} is yours to work on.`,
    heading: "You have a new assignment",
    paragraphs: [
      `${oneLine(input.actorName)} assigned ${title} on ${site} to you.`,
      ...(input.dueOn ? [`It's due on ${formatDay(input.dueOn)}.`] : []),
    ],
    button: { label: "Open the entry", url: input.url },
    footer: notificationFooter(input.accountUrl),
  });
}

export function reviewRequestedEmail(input: EntryContext): Template {
  const title = entryTitle(input.title);
  const site = oneLine(input.siteName);
  return layout({
    kind: "review_requested",
    subject: `Review requested: ${title}`,
    preheader: `${oneLine(input.actorName)} asked for a review on ${site}.`,
    heading: "A review was requested",
    paragraphs: [
      `${oneLine(input.actorName)} asked for a review of ${title} on ${site}.`,
      "Open it to approve and publish, or request changes with a note.",
    ],
    button: { label: "Review the entry", url: input.url },
    footer: notificationFooter(input.accountUrl),
  });
}

export function changesRequestedEmail(input: EntryContext & { note: string }): Template {
  const title = entryTitle(input.title);
  const site = oneLine(input.siteName);
  return layout({
    kind: "changes_requested",
    subject: `Changes requested: ${title}`,
    preheader: `${oneLine(input.actorName)} sent ${title} back with changes.`,
    heading: "Changes were requested",
    paragraphs: [
      `${oneLine(input.actorName)} reviewed ${title} on ${site} and asked for changes. It's back in drafts.`,
      ...(input.note ? [] : ["When it's ready, request a review again."]),
    ],
    quote: input.note ? { label: "Their note", text: input.note } : undefined,
    button: { label: "Open the entry", url: input.url },
    footer: notificationFooter(input.accountUrl),
  });
}

export function approvedEmail(input: EntryContext & { scheduledAt: Date | null }): Template {
  const title = entryTitle(input.title);
  const site = oneLine(input.siteName);
  const scheduled = input.scheduledAt
    ? `It's scheduled to go live on ${input.scheduledAt.toUTCString().replace(" GMT", " UTC")}.`
    : "It's live now.";
  return layout({
    kind: "approved",
    subject: input.scheduledAt
      ? `Approved and scheduled: ${title}`
      : `Approved and published: ${title}`,
    preheader: `${oneLine(input.actorName)} approved ${title}.`,
    heading: input.scheduledAt ? "Approved and scheduled" : "Approved and published",
    paragraphs: [`${oneLine(input.actorName)} approved ${title} on ${site}.`, scheduled],
    button: { label: "Open the entry", url: input.url },
    footer: notificationFooter(input.accountUrl),
  });
}

/** "2026-11-04" → "4 November 2026" (no time zone shifts). */
function formatDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}
