import { z } from "zod";

/** An API key as shown in Settings. The key itself is never returned after creation. */
export interface ApiKeySummary {
  id: string;
  name: string;
  /** Start of the key, e.g. "klipt_Ab3dE9", so people can tell keys apart. */
  prefix: string;
  createdByName: string | null;
  createdAt: string; // ISO 8601
  lastUsedAt: string | null; // ISO 8601
}

export const apiKeyNameSchema = z
  .string()
  .trim()
  .min(1, "Give the key a name, e.g. the website that will use it.")
  .max(60, "Keep the name to 60 characters or fewer.");

/** Active keys per site. Revoked keys don't count. */
export const MAX_API_KEYS = 20;

export const API_KEY_PREFIX = "klipt_";
