/**
 * Core domain types. A site is owned independently of any user account:
 * transferring a site never transfers the account.
 */

export type SiteRole = "owner" | "admin" | "editor" | "author" | "viewer";

export type SitePublishState = "live" | "not_published";

export type OwnershipTransferStatus =
  "pending" | "accepted" | "declined" | "cancelled" | "expired" | "failed";

export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

export interface PendingOwnershipTransfer {
  status: Extract<OwnershipTransferStatus, "pending">;
  recipientEmail: string;
  initiatedAt: string; // ISO 8601
}

export interface SiteSummary {
  id: string;
  name: string;
  /** Primary domain, if one has been connected. */
  domain: string | null;
  publishState: SitePublishState;
  owner: UserSummary;
  /** The signed-in user's role on this site. */
  currentUserRole: SiteRole;
  updatedAt: string; // ISO 8601
  pendingTransfer: PendingOwnershipTransfer | null;
}

export const ROLE_LABELS: Record<SiteRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  author: "Author",
  viewer: "Viewer",
};
