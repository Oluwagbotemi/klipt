import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/*
 * Encryption for secrets Klipt must be able to read back (webhook signing
 * secrets, invitation links). AES-256-GCM with a key derived from BETTER_AUTH_SECRET, so a
 * database copy alone doesn't reveal them. Rotating BETTER_AUTH_SECRET makes
 * existing values unreadable; the affected webhooks then need a new secret.
 */

export class SecretUnavailableError extends Error {
  constructor() {
    super("This secret can't be read. Generate a new signing secret for this webhook.");
  }
}

function key(): Buffer {
  const appSecret = process.env.BETTER_AUTH_SECRET;
  if (!appSecret) throw new Error("BETTER_AUTH_SECRET must be set to store webhook secrets.");
  return Buffer.from(hkdfSync("sha256", appSecret, "klipt", "webhook-secrets/v1", 32));
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new SecretUnavailableError();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SecretUnavailableError();
  }
}
