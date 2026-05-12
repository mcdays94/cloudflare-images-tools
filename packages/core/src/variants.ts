import type { CloudflareConfig } from "./types.js";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * Resize/fit modes supported by Cloudflare Images variants.
 * See https://developers.cloudflare.com/images/transform-images/transform-via-url/
 */
export type VariantFit = "scale-down" | "contain" | "cover" | "crop" | "pad";

export type VariantMetadata = "keep" | "copyright" | "none";

export interface CloudflareVariantOptions {
  fit?: VariantFit;
  width?: number;
  height?: number;
  metadata?: VariantMetadata;
}

export interface CloudflareVariant {
  /** Variant slug (e.g. "public", "hero"). The URL path uses /<id>. */
  id: string;
  options: CloudflareVariantOptions;
  /** When true this variant is always served unsigned, even on private images. */
  neverRequireSignedURLs?: boolean;
}

/**
 * Fetches the list of variants configured for the account from Cloudflare's
 * Images API. The response is keyed-by-id; we flatten to an array sorted by
 * id so the calling UI can render a stable list.
 *
 * Every account has at least a `public` variant out of the box. Listing won't
 * include any user-defined "named transformations" — only variants set in the
 * dashboard or via the variants endpoint.
 *
 * See https://developers.cloudflare.com/api/operations/cloudflare-images-variants-list-variants
 */
export async function listVariants(
  config: Pick<CloudflareConfig, "accountId" | "apiToken">,
): Promise<CloudflareVariant[]> {
  const response = await fetch(
    `${CF_API_BASE}/accounts/${config.accountId}/images/v1/variants`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${config.apiToken}` },
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Cloudflare variants list failed (${response.status} ${response.statusText}): ${errorBody}`,
    );
  }

  const data = (await response.json()) as {
    result?: {
      variants?: Record<
        string,
        { id?: string; options?: CloudflareVariantOptions; neverRequireSignedURLs?: boolean }
      >;
    };
  };

  const variantsMap = data.result?.variants ?? {};
  const list = Object.entries(variantsMap).map(([key, value]) => ({
    id: value.id ?? key,
    options: value.options ?? {},
    neverRequireSignedURLs: value.neverRequireSignedURLs,
  }));

  // Stable sort so list views don't shuffle between requests.
  list.sort((a, b) => a.id.localeCompare(b.id));
  return list;
}
