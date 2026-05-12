import type { CloudflareConfig } from "./types.js";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * Deletes a single image by its Cloudflare image ID.
 *
 * Returns `true` on success and `false` on any failure (network error, auth
 * error, 404 if the image was already gone, etc.). Surfaces should distinguish
 * these via `getImage()` first if they need accurate UX (e.g. "already deleted"
 * vs "auth failure"), but for a simple delete-from-list flow the boolean is
 * enough.
 *
 * Ported from the VS Code extension.
 */
export async function deleteImage(
  imageId: string,
  config: Pick<CloudflareConfig, "accountId" | "apiToken">,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${config.accountId}/images/v1/${imageId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${config.apiToken}` },
      },
    );

    return response.ok;
  } catch {
    return false;
  }
}
