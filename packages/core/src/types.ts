/**
 * Shape of the Cloudflare credentials and per-account settings needed to make any
 * Images API call. All fields are required *for the function that uses them* — the
 * surface (Raycast extension / MCP server / etc.) is responsible for collecting
 * them from its native config mechanism (Raycast preferences, env vars, MCP
 * config) and passing a complete object to the core functions.
 *
 * `signingKey` may be empty when `useSignedUrls === false`. When signed URLs are
 * enabled but no manual key is supplied, surfaces should call `getSigningKey()`
 * which auto-fetches from the Cloudflare API.
 */
export interface CloudflareConfig {
  /** Account ID — e.g. `0abcd1234...`. Found in the dashboard URL. */
  accountId: string;
  /** API token with Images:Edit permission. */
  apiToken: string;
  /** Account hash — public hash that appears in `imagedelivery.net/{hash}/...` URLs. */
  accountHash: string;
  /** Default variant to use when constructing URLs. Conventionally `/public`. */
  defaultVariant: string;
  /** Whether to require and generate signed URLs for new uploads. */
  useSignedUrls: boolean;
  /** HMAC signing key, used when `useSignedUrls === true`. */
  signingKey: string;
  /** Signed URL TTL in seconds, or 0 for no expiry. */
  signedUrlExpiration: number;
}

/**
 * Knobs controlling whether and how an image is compressed before upload.
 * Mirrors the VS Code extension's compression preferences.
 */
export interface CompressionConfig {
  enableCompression: boolean;
  maxFileSizeMB: number;
  compressionQuality: number;
  preservePngFormat: boolean;
}

/**
 * The three output formats supported by the Raycast extension (and the MCP
 * server, eventually). Replaces the VS Code extension's per-language formatting
 * since the destination isn't known to a global hotkey.
 */
export type OutputFormat = "markdown" | "html" | "raw";

/**
 * What format AVIF images should be converted to before uploading. Cloudflare Images
 * doesn't accept AVIF as an input format.
 */
export type AvifConversionFormat = "webp" | "jpeg" | "png";

/**
 * An entry stored in the dedupe cache so we don't re-upload the same image
 * twice. The hash is the SHA-256 of the raw image buffer.
 *
 * `imageId` is the canonical Cloudflare image identifier (the `{imageId}`
 * segment in `imagedelivery.net/{accountHash}/{imageId}/{variant}`). URLs are
 * NOT cached because the variant and signing settings can change between the
 * original upload and a future cache hit — instead, surfaces rebuild the URL
 * fresh on each hit using `buildDeliveryUrl(imageId, variant, config)`.
 *
 * `url` is retained for backward compatibility with v0.2.1 cache entries that
 * predate `imageId` and may be present in LocalStorage during a one-time
 * migration window. Surfaces should prefer `imageId` and treat entries
 * without it as cache misses (with optional best-effort recovery via
 * `extractImageIdFromUrl(url)`).
 */
export interface ImageCacheEntry {
  hash: string;
  imageId: string;
  /** Deprecated since v0.2.2 — kept for migration of legacy entries. */
  url?: string;
  fileName: string;
  uploadedAt: number;
}

export type ImageCache = Record<string, ImageCacheEntry>;

/**
 * Context used to resolve `${...}` variables in a metadata template.
 */
export interface MetadataContext {
  fileName: string;
  filePath: string;
  fileSize: number;
  /** Version string for the calling surface (e.g. `raycast-0.1.0`). */
  surfaceVersion?: string;
  /** Optional workspace / project name. */
  workspaceName?: string;
}

/**
 * Result of a successful upload.
 */
export interface UploadResult {
  /** Cloudflare-side image ID. */
  imageId: string;
  /** Public (or signed) URL constructed with `defaultVariant`. */
  url: string;
  /** True if the upload was skipped because we found a cache hit. */
  fromCache: boolean;
  /** Bytes after compression — equal to original if no compression was applied. */
  finalSizeBytes: number;
  /** Bytes of the original input before any compression / format conversion. */
  originalSizeBytes: number;
  /** Whether the input was compressed by `compressImageIfNeeded`. */
  wasCompressed: boolean;
  /** Whether AVIF was converted to a CF-compatible format. */
  wasAvifConverted: boolean;
}

/**
 * Shape returned by the Cloudflare Images list API for each image.
 * See https://developers.cloudflare.com/api/operations/cloudflare-images-list-images
 */
export interface CloudflareImage {
  id: string;
  filename: string;
  uploaded: string; // ISO timestamp
  requireSignedURLs: boolean;
  variants: string[];
  meta?: Record<string, string>;
}

export interface CloudflareImageListPage {
  images: CloudflareImage[];
  /** Continuation token if more pages exist. */
  continuationToken: string | null;
}
