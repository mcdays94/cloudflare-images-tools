import { createHash } from "node:crypto";

/**
 * SHA-256 of an image buffer, hex-encoded. Used as the dedupe cache key — if the
 * same screenshot is pasted twice (or the same file uploaded twice), the hash
 * matches and we can return the existing URL instead of re-uploading.
 *
 * Ported verbatim from the VS Code extension.
 */
export function calculateFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
