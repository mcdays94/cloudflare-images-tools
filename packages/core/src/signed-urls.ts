import { createHmac } from "node:crypto";
import type { CloudflareConfig } from "./types.js";

/**
 * Fetches the first (default) signing key from the Cloudflare API. Returns
 * `null` on failure (network error, auth failure, no keys configured).
 *
 * The surface layer is expected to cache the result — calling this on every
 * upload would burn ~100ms per request unnecessarily.
 *
 * Ported from the VS Code extension.
 */
export async function fetchSigningKey(
  accountId: string,
  apiToken: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/keys`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      success?: boolean;
      result?: { keys?: Array<{ value?: string }> };
    };

    if (!data.success || !data.result?.keys?.length) {
      return null;
    }
    return data.result.keys[0]?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Generates a signed CF Images URL using HMAC-SHA256 over the URL path.
 *
 * Format of the URL path that gets signed:
 *   `/<accountHash>/<imageId><variant>`        (no expiry)
 *   `/<accountHash>/<imageId><variant>?exp=N`  (with expiry, Unix seconds)
 *
 * Note `variant` is expected to *include* its leading `/` — i.e. `/public`,
 * not `public`. This matches the convention used in the VS Code ext and the CF
 * dashboard.
 *
 * Ported from the VS Code extension.
 */
export function generateSignedUrl(
  imageId: string,
  variant: string,
  config: CloudflareConfig,
): string {
  const urlPath = `/${config.accountHash}/${imageId}${variant}`;

  let expiry: number | null = null;
  if (config.signedUrlExpiration > 0) {
    expiry = Math.floor(Date.now() / 1000) + config.signedUrlExpiration;
  }

  const stringToSign = expiry !== null ? `${urlPath}?exp=${expiry}` : urlPath;

  const signature = createHmac("sha256", config.signingKey)
    .update(stringToSign)
    .digest("hex");

  return expiry !== null
    ? `https://imagedelivery.net${urlPath}?exp=${expiry}&sig=${signature}`
    : `https://imagedelivery.net${urlPath}?sig=${signature}`;
}

/**
 * Constructs the public (unsigned) URL for a given image and variant.
 */
export function buildPublicUrl(
  imageId: string,
  variant: string,
  accountHash: string,
): string {
  return `https://imagedelivery.net/${accountHash}/${imageId}${variant}`;
}
