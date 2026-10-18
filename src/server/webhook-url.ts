import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/*
 * Webhook URLs are typed in by customers and fetched by Klipt's servers, so
 * they must not reach internal addresses (cloud metadata, localhost, private
 * networks). Checked when saved and again (after DNS lookup) before sending.
 * Set ALLOW_PRIVATE_WEBHOOK_URLS=1 to test against a local server.
 */

export class WebhookUrlError extends Error {}

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function allowPrivateWebhookUrls() {
  return process.env.ALLOW_PRIVATE_WEBHOOK_URLS === "1" || process.env.NODE_ENV === "development";
}

export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped) return blocked.check(mapped, "ipv4");
  const family = isIP(address);
  if (family === 0) return true;
  return blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

/** Validates the format; returns the normalized URL. */
export function checkWebhookUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new WebhookUrlError("Enter a full address, e.g. https://example.com/api/klipt-webhook.");
  }
  const allowPrivate = allowPrivateWebhookUrls();
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
    throw new WebhookUrlError("Use an address that starts with https://.");
  }
  if (url.username || url.password) {
    throw new WebhookUrlError("Remove the username and password from the address.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivate) {
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
      throw new WebhookUrlError("Use a public address. Klipt can't reach private networks.");
    }
    if (isIP(host) && isPrivateAddress(host)) {
      throw new WebhookUrlError("Use a public address. Klipt can't reach private networks.");
    }
  }
  url.hash = "";
  return url.toString();
}

/** Resolves the host and refuses private addresses (unless allowed). */
export async function assertPublicHost(url: string): Promise<void> {
  if (allowPrivateWebhookUrls()) return;
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new WebhookUrlError(`Couldn't find ${host}. Check the address.`);
      });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new WebhookUrlError("The address points to a private network, which Klipt can't reach.");
  }
}
