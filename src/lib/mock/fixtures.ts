/**
 * MOCK DATA — not real sites, users, or ownership state.
 *
 * Used until the backend exists. Names are neutral placeholders. Nothing here
 * represents a live metric, a verified domain, or a completed transfer.
 */
import type { SiteSummary, UserSummary } from "@/lib/types";

export const MOCK_CURRENT_USER: UserSummary = {
  id: "usr_mock_1",
  name: "Sam Rivera",
  email: "sam@example.com",
};

const studioOwner: UserSummary = {
  id: "usr_mock_2",
  name: "Morgan Lee",
  email: "morgan@example.com",
};

export const MOCK_SITES: SiteSummary[] = [
  {
    id: "northwind-journal",
    name: "Northwind Journal",
    domain: "northwindjournal.example",
    publishState: "live",
    owner: MOCK_CURRENT_USER,
    currentUserRole: "owner",
    updatedAt: "2026-10-14T16:20:00Z",
    pendingTransfer: null,
  },
  {
    id: "harbor-pine-studio",
    name: "Harbor & Pine Studio",
    domain: "harborpine.example",
    publishState: "live",
    owner: MOCK_CURRENT_USER,
    currentUserRole: "owner",
    updatedAt: "2026-10-12T09:05:00Z",
    pendingTransfer: {
      status: "pending",
      recipientEmail: "client@harborpine.example",
      initiatedAt: "2026-10-11T13:40:00Z",
    },
  },
  {
    id: "lumen-clinic",
    name: "Lumen Clinic",
    domain: null,
    publishState: "not_published",
    owner: MOCK_CURRENT_USER,
    currentUserRole: "owner",
    updatedAt: "2026-10-09T18:45:00Z",
    pendingTransfer: null,
  },
  {
    id: "atlas-outdoor",
    name: "Atlas Outdoor Supply",
    domain: "atlasoutdoor.example",
    publishState: "live",
    owner: studioOwner,
    currentUserRole: "editor",
    updatedAt: "2026-10-02T11:10:00Z",
    pendingTransfer: null,
  },
];
