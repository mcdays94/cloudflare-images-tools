import { buildPublicUrl, generateSignedUrl } from "./signed-urls.js";
import type { CloudflareConfig } from "./types.js";

/**
 * Constructs a Cloudflare Images delivery URL for an image ID, choosing
 * between a public URL and an HMAC-signed URL based on `config.useSignedUrls`.
 *
 * This is the single source of truth for "given an image ID, build the URL"
 * across the codebase — used by `uploadImage()` after a fresh upload AND by
 * the Raycast cache-hit path (so a variant change between uploads is
 * reflected in the URL returned for an already-cached image).
 *
 * Note on signed URLs: this rebuilds the signature from `config.signingKey`
 * each call. Callers in the surface layer should resolve the signing key
 * (via the helper that caches it in LocalStorage) before invoking this for
 * signed accounts.
 */
export function buildDeliveryUrl(
  imageId: string,
  variant: string,
  config: CloudflareConfig,
): string {
  return config.useSignedUrls
    ? generateSignedUrl(imageId, variant, config)
    : buildPublicUrl(imageId, variant, config.accountHash);
}
