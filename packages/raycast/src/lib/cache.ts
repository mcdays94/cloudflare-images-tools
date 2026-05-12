import { LocalStorage } from "@raycast/api";
import type { ImageCacheEntry } from "@mcdays94/cf-images-core";

const CACHE_KEY_PREFIX = "image-cache:";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Look up a previously-uploaded image by its SHA-256 hash. Returns `undefined`
 * if not in cache OR if the entry is older than 30 days.
 *
 * The cache uses Raycast's `LocalStorage` so it persists across runs and
 * survives extension upgrades. It's keyed per-machine, not per-account — if
 * you change accounts, run `Clear Cache` (TODO: not built yet) before
 * uploading or you may get URLs that don't match the active account.
 */
export async function getCachedImage(
  hash: string,
): Promise<ImageCacheEntry | undefined> {
  const raw = await LocalStorage.getItem<string>(CACHE_KEY_PREFIX + hash);
  if (!raw) return undefined;

  try {
    const entry = JSON.parse(raw) as ImageCacheEntry;
    if (Date.now() - entry.uploadedAt > CACHE_TTL_MS) {
      await LocalStorage.removeItem(CACHE_KEY_PREFIX + hash);
      return undefined;
    }
    return entry;
  } catch {
    // Corrupt cache entry — drop it.
    await LocalStorage.removeItem(CACHE_KEY_PREFIX + hash);
    return undefined;
  }
}

/**
 * Stores a successful upload in the cache so a future identical paste / drop
 * is deduplicated.
 */
export async function addImageToCache(
  hash: string,
  url: string,
  fileName: string,
): Promise<void> {
  const entry: ImageCacheEntry = {
    hash,
    url,
    fileName,
    uploadedAt: Date.now(),
  };
  await LocalStorage.setItem(CACHE_KEY_PREFIX + hash, JSON.stringify(entry));
}

/**
 * Clears the entire dedupe cache. Useful when switching CF accounts or
 * if cached URLs end up stale (e.g. signed-URL signing key rotation).
 */
export async function clearImageCache(): Promise<number> {
  const all = await LocalStorage.allItems();
  let removed = 0;
  for (const key of Object.keys(all)) {
    if (key.startsWith(CACHE_KEY_PREFIX)) {
      await LocalStorage.removeItem(key);
      removed++;
    }
  }
  return removed;
}
