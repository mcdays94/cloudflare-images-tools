import type { CloudflareConfig } from "./types.js";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

export type ValidationResult =
  | { ok: true; imageCount: number | null }
  | { ok: false; reason: ValidationFailureReason; detail: string };

export type ValidationFailureReason =
  | "missing-account-id"
  | "missing-api-token"
  | "missing-account-hash"
  | "auth-failed"
  | "account-not-found"
  | "network-error"
  | "unexpected";

/**
 * Cheaply validates a CloudflareConfig by hitting the images list endpoint
 * with `per_page=1`. Used by the Raycast "Validate Credentials" command and
 * any future setup wizards.
 *
 * Why this endpoint? It exercises auth (via `apiToken`), account scope
 * (via `accountId`), AND read access to Images (a more meaningful
 * permission check than e.g. `/user/tokens/verify`). It does NOT validate
 * `accountHash` — that's only used to construct delivery URLs and can't be
 * verified server-side. The surface layer should add a UX hint along the
 * lines of "Account Hash isn't checked here — copy it from the URL of any
 * image in your Cloudflare Images dashboard."
 */
export async function validateCredentials(
  config: Pick<CloudflareConfig, "accountId" | "apiToken" | "accountHash">,
): Promise<ValidationResult> {
  if (!config.accountId?.trim()) {
    return {
      ok: false,
      reason: "missing-account-id",
      detail: "Account ID is empty. Find it in your Cloudflare dashboard URL.",
    };
  }
  if (!config.apiToken?.trim()) {
    return {
      ok: false,
      reason: "missing-api-token",
      detail:
        "API Token is empty. Create one with the 'Cloudflare Images: Edit' permission.",
    };
  }
  if (!config.accountHash?.trim()) {
    return {
      ok: false,
      reason: "missing-account-hash",
      detail:
        "Account Hash is empty. Copy it from the URL of any image in the Cloudflare Images dashboard.",
    };
  }

  try {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${config.accountId}/images/v1?per_page=1`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${config.apiToken}` },
      },
    );

    if (response.status === 401 || response.status === 403) {
      const body = await safeReadText(response);
      return {
        ok: false,
        reason: "auth-failed",
        detail: `Cloudflare rejected the API token (${response.status}). Make sure the token has the 'Images:Edit' permission and is scoped to the right account. Response: ${body}`,
      };
    }
    if (response.status === 404) {
      const body = await safeReadText(response);
      return {
        ok: false,
        reason: "account-not-found",
        detail: `Cloudflare returned 404 — your Account ID is probably wrong. Response: ${body}`,
      };
    }
    if (!response.ok) {
      const body = await safeReadText(response);
      return {
        ok: false,
        reason: "unexpected",
        detail: `Cloudflare returned ${response.status} ${response.statusText}: ${body}`,
      };
    }

    // Try to surface the image count if CF gives us one. Not every response
    // shape includes it; we just don't show it if we can't find it.
    const data = (await response.json()) as {
      result?: { images?: unknown[] };
      result_info?: { count?: number; total_count?: number };
    };
    const imageCount =
      data.result_info?.total_count ??
      data.result_info?.count ??
      data.result?.images?.length ??
      null;

    return { ok: true, imageCount };
  } catch (err) {
    return {
      ok: false,
      reason: "network-error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "(empty body)";
  }
}
