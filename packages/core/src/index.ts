// Public exports for @mcdays/cloudflare-images-core.
//
// All functions are pure: they take their inputs as arguments and return their
// results. Surfaces (Raycast, MCP, CLI) wire them up to their native UIs.

export { calculateFileHash } from "./hash.js";
export { extractImageIdFromUrl } from "./image-id.js";
export { formatImageUrl } from "./url.js";

export {
  fetchSigningKey,
  generateSignedUrl,
  buildPublicUrl,
} from "./signed-urls.js";

export { buildDeliveryUrl } from "./url-builder.js";

export { resolveMetadataTemplate } from "./metadata.js";

export { resolveSignedMode, resolveVariant } from "./resolve.js";
export type { UploadOverrides } from "./resolve.js";

export {
  compressImageIfNeeded,
  convertAvifIfNeeded,
} from "./compress.js";
export type { CompressionResult, AvifConversionResult } from "./compress.js";

export { uploadImage } from "./upload.js";
export type {
  UploadImageOptions,
  UploadOutcome,
  UploadProgressEvent,
} from "./upload.js";

export { listImages } from "./list.js";
export type { ListImagesOptions } from "./list.js";

export { listVariants } from "./variants.js";
export type {
  CloudflareVariant,
  CloudflareVariantOptions,
  VariantFit,
  VariantMetadata,
} from "./variants.js";

export { deleteImage } from "./delete.js";

export { validateCredentials } from "./validate.js";
export type { ValidationResult, ValidationFailureReason } from "./validate.js";

export type {
  AvifConversionFormat,
  CloudflareConfig,
  CloudflareImage,
  CloudflareImageListPage,
  CompressionConfig,
  ImageCache,
  ImageCacheEntry,
  MetadataContext,
  OutputFormat,
} from "./types.js";
