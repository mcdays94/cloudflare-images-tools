/**
 * Extracts the Cloudflare image ID from a delivery URL.
 *
 * Format: `https://imagedelivery.net/{accountHash}/{imageId}/{variant}` (with
 * an optional `?exp=…&sig=…` query string for signed URLs).
 *
 * Returns `null` if the input doesn't look like a CF image URL.
 *
 * Ported from the VS Code extension.
 */
export function extractImageIdFromUrl(url: string): string | null {
  const match = url.match(/imagedelivery\.net\/[^/]+\/([^/?#]+)/);
  return match?.[1] ?? null;
}
