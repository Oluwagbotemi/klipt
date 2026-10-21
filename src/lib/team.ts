import { z } from "zod";
import { can, type SitePermission } from "@/lib/permissions";
import type { SiteRole } from "@/lib/types";

/*
 * Team rules (client-safe). Enforcement happens on the server in
 * src/server/team.ts; the UI uses the same functions to decide what to show.
 *
 * Invitations are shareable links for now. Planned: send them by email
 * (Resend) once an email service is connected; see CLAUDE.md.
 */

export const INVITABLE_ROLES = ["admin", "editor", "author", "viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const ROLE_DESCRIPTIONS: Record<SiteRole, string> = {
  owner: "Full control, including billing, ownership and deleting the site.",
  admin: "Manages settings, members and integrations, and all content.",
  editor: "Writes, edits and publishes any content, and manages SEO.",
  author: "Writes their own drafts and submits them for review. Can't publish.",
  viewer: "Can look around but not change anything.",
};

export const INVITATION_DAYS = 7;
export const MAX_OPEN_INVITATIONS = 50;

export const invitationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter their email address.")
    .max(254)
    .email("Enter a valid email address, e.g. alex@example.com."),
  role: z.enum(INVITABLE_ROLES, { message: "Choose a role." }),
});

/** Roles a member may give to others. Only the owner can make admins. */
export function assignableRoles(actor: SiteRole): InvitableRole[] {
  if (actor === "owner") return [...INVITABLE_ROLES];
  if (can(actor, "members.manage")) return ["editor", "author", "viewer"];
  return [];
}

/**
 * Whether `actor` may change or remove `member`. Nobody changes the owner
 * (that's an ownership transfer), people leave rather than remove themselves,
 * and only the owner manages admins.
 */
export function canManageMember(
  actor: { role: SiteRole; userId: string },
  member: { role: SiteRole; userId: string },
): boolean {
  if (member.role === "owner" || member.userId === actor.userId) return false;
  if (!can(actor.role, "members.manage")) return false;
  return actor.role === "owner" || member.role !== "admin";
}

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: SiteRole;
  joinedAt: string;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: SiteRole;
  invitedByName: string | null;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

export interface Team {
  members: TeamMember[];
  /** Only for members who can manage the team. */
  invitations: TeamInvitation[] | null;
}

/** Plain-language names for the permission matrix (Roles & permissions tab). */
export const PERMISSION_LABELS: Record<SitePermission, string> = {
  "site.view": "See the site and its content",
  "content.create": "Create drafts",
  "content.edit_any": "Edit anyone's content",
  "content.publish": "Publish, schedule and unpublish",
  "content.assign": "Assign content to members",
  "activity.view": "See content activity",
  "activity.view_all": "See all site activity (team, settings, integrations)",
  "seo.manage": "Manage SEO settings and redirects",
  "performance.view": "See Core Web Vitals and performance recommendations",
  "performance.manage": "Manage the Core Web Vitals reporting key",
  "taxonomy.manage": "Manage categories, tags and other terms",
  "navigation.manage": "Edit navigation menus",
  "media.upload": "Upload media",
  "models.manage": "Manage content models",
  "members.manage": "Invite and manage members",
  "api_keys.manage": "Manage API keys",
  "webhooks.manage": "Manage webhooks",
  "site.update": "Change site settings",
  "billing.manage": "Manage billing",
  "site.transfer_ownership": "Transfer ownership",
  "site.archive": "Archive the site",
  "site.delete": "Delete the site",
};

export const PERMISSION_ORDER = Object.keys(PERMISSION_LABELS) as SitePermission[];
