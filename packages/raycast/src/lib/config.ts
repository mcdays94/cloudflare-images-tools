import { getPreferenceValues } from "@raycast/api";
import type {
  AvifConversionFormat,
  CloudflareConfig,
  CompressionConfig,
  OutputFormat,
} from "@mcdays94/cloudflare-images-core";

/**
 * Shape of the Raycast preferences declared in `package.json`. Mirrored here
 * for type safety. Raycast also generates `raycast-env.d.ts` with a similar
 * interface on `ray develop` / `ray build`, but defining it explicitly here
 * means we don't depend on that build step having run yet.
 */
export interface CfImagesPreferences {
  accountId: string;
  apiToken: string;
  accountHash: string;
  defaultVariant: string;
  outputFormat: OutputFormat;
  useSignedUrls: boolean;
  signedUrlExpiration: string; // textfield → string from Raycast, parsed below
  enableCompression: boolean;
  maxFileSizeMB: string;
  compressionQuality: string;
  preservePngFormat: boolean;
  avifConversionFormat: AvifConversionFormat;
}

/**
 * Reads the user's Raycast preferences and returns them as a strongly-typed
 * object. Numeric textfields are parsed to numbers and clamped to sensible
 * ranges; missing optional values fall back to defaults that match the
 * `package.json` manifest.
 */
export function getPreferences(): CfImagesPreferences {
  const raw = getPreferenceValues<CfImagesPreferences>();
  return {
    ...raw,
    defaultVariant: raw.defaultVariant?.trim() || "/public",
  };
}

/**
 * Builds a `CloudflareConfig` (the core's auth + URL-shape struct) from
 * Raycast preferences. The `signingKey` field starts empty — the surface
 * is expected to populate it lazily from cache or by calling
 * `fetchSigningKey()` when an actual signed-URL upload happens.
 *
 * `defaultVariantOverride` lets the caller supply a variant resolved via the
 * `lib/variant.ts` precedence chain (stored → preference → /public). When
 * omitted, the textfield value flows straight through.
 */
export function buildCloudflareConfig(
  prefs: CfImagesPreferences,
  signingKey = "",
  defaultVariantOverride?: string,
): CloudflareConfig {
  return {
    accountId: prefs.accountId.trim(),
    apiToken: prefs.apiToken.trim(),
    accountHash: prefs.accountHash.trim(),
    defaultVariant: defaultVariantOverride ?? prefs.defaultVariant,
    useSignedUrls: prefs.useSignedUrls,
    signingKey,
    signedUrlExpiration: clampNonNegativeInt(prefs.signedUrlExpiration, 0),
  };
}

/**
 * Builds a `CompressionConfig` for the core's `compressImageIfNeeded` from
 * Raycast preferences.
 */
export function buildCompressionConfig(
  prefs: CfImagesPreferences,
): CompressionConfig {
  return {
    enableCompression: prefs.enableCompression,
    maxFileSizeMB: clampPositiveInt(prefs.maxFileSizeMB, 10),
    compressionQuality: clampRange(prefs.compressionQuality, 1, 100, 80),
    preservePngFormat: prefs.preservePngFormat,
  };
}

function clampNonNegativeInt(input: string, fallback: number): number {
  const n = Number.parseInt(input, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function clampPositiveInt(input: string, fallback: number): number {
  const n = Number.parseInt(input, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clampRange(
  input: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number.parseInt(input, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
