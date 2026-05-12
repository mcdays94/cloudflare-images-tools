import { LocalStorage } from "@raycast/api";
import { fetchSigningKey } from "@mcdays94/cf-images-core";

/**
 * The signing key lives in Raycast LocalStorage keyed by account ID, so each
 * Cloudflare account a user might switch between gets its own cached key.
 * It does NOT use `password`-type preferences because Raycast preferences are
 * declared statically at manifest time — and we want to lazily fetch this
 * value the first time it's needed, not prompt the user.
 *
 * If a user rotates their signing key inside Cloudflare, call
 * `clearCachedSigningKey(accountId)` to force a refetch. We don't expose
 * that as a Raycast command yet; for now it's manual.
 */
const KEY_PREFIX = "signing-key:";

export async function getCachedOrFetchSigningKey(
  accountId: string,
  apiToken: string,
): Promise<string> {
  const cacheKey = KEY_PREFIX + accountId;

  const cached = await LocalStorage.getItem<string>(cacheKey);
  if (cached) {
    return cached;
  }

  const fetched = await fetchSigningKey(accountId, apiToken);
  if (!fetched) {
    throw new Error(
      "Couldn't fetch a signing key from Cloudflare. Make sure your API token has the 'Cloudflare Images: Edit' permission, then try again. If you don't have signed URLs configured, turn off the Signed URLs preference.",
    );
  }

  await LocalStorage.setItem(cacheKey, fetched);
  return fetched;
}

export async function clearCachedSigningKey(accountId: string): Promise<void> {
  await LocalStorage.removeItem(KEY_PREFIX + accountId);
}
