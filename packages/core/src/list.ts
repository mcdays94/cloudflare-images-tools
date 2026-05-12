import type {
  CloudflareConfig,
  CloudflareImage,
  CloudflareImageListPage,
} from "./types.js";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

export interface ListImagesOptions {
  /** Cloudflare auth + account. Only `accountId` and `apiToken` are read. */
  config: Pick<CloudflareConfig, "accountId" | "apiToken">;
  /** Max images per page. CF default is 100, max 10000. */
  perPage?: number;
  /** Continuation token from a previous response, for pagination. */
  continuationToken?: string;
  /** Optional filter on the `sort_order` parameter. */
  sortOrder?: "asc" | "desc";
}

/**
 * Lists images from the Cloudflare Images v2 API (the cursor-paginated
 * endpoint). The v1 list endpoint exists but uses page-number pagination
 * which is deprecated for new code.
 *
 * See https://developers.cloudflare.com/api/operations/cloudflare-images-list-images-v2
 *
 * NOTE: at the time of writing this scaffold the response shape was not
 * exercised against a real account. The interface mirrors the documented
 * shape; if CF returns something different in practice, adjust the parse
 * step below. Surface this if it bites you during integration.
 */
export async function listImages(
  options: ListImagesOptions,
): Promise<CloudflareImageListPage> {
  const params = new URLSearchParams();
  params.set("per_page", String(options.perPage ?? 100));
  if (options.continuationToken) {
    params.set("continuation_token", options.continuationToken);
  }
  if (options.sortOrder) {
    params.set("sort_order", options.sortOrder);
  }

  const response = await fetch(
    `${CF_API_BASE}/accounts/${options.config.accountId}/images/v2?${params.toString()}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${options.config.apiToken}` },
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Cloudflare Images list failed (${response.status} ${response.statusText}): ${errorBody}`,
    );
  }

  const data = (await response.json()) as {
    result?: {
      images?: CloudflareImage[];
      continuation_token?: string | null;
    };
  };

  return {
    images: data.result?.images ?? [],
    continuationToken: data.result?.continuation_token ?? null,
  };
}
