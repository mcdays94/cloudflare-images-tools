import * as fs from "node:fs";
import * as path from "node:path";
import {
  compressImageIfNeeded,
  convertAvifIfNeeded,
  type CompressionResult,
} from "./compress.js";
import { resolveMetadataTemplate } from "./metadata.js";
import { buildDeliveryUrl } from "./url-builder.js";
import type {
  AvifConversionFormat,
  CloudflareConfig,
  CompressionConfig,
  MetadataContext,
} from "./types.js";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";
const CF_METADATA_BYTE_LIMIT = 1024;

/**
 * Lifecycle events emitted during upload. Surfaces can attach a UI to these
 * (Raycast toast / HUD, terminal progress bar, MCP tool-call streaming).
 */
export type UploadProgressEvent =
  | { type: "avif-converted"; toFormat: AvifConversionFormat }
  | { type: "compressed"; originalBytes: number; newBytes: number }
  | { type: "uploading" }
  | {
      type: "metadata-warning";
      message: string;
      metadataBytes: number;
      limit: number;
    };

export interface UploadImageOptions {
  /** Where the image data comes from. Either a file path or an in-memory buffer. */
  source:
    | { type: "file"; path: string }
    | { type: "buffer"; data: Buffer; fileName: string };

  /** Cloudflare config — account, token, hash, variant, signing settings. */
  config: CloudflareConfig;

  /** Compression knobs. Omit to skip compression entirely. */
  compressionConfig?: CompressionConfig;

  /**
   * Format to convert AVIF → before uploading. Cloudflare Images doesn't accept AVIF as
   * input. Defaults to `"webp"` if omitted.
   */
  avifConversionFormat?: AvifConversionFormat;

  /**
   * If provided, this template is resolved against `metadataContext` and the
   * resulting key-value pairs are attached as Cloudflare Images metadata.
   * Templates use `${fileName}`, `${timestamp}`, etc. — see `metadata.ts`.
   */
  metadataTemplate?: Record<string, string>;

  /** Context for resolving template variables. Required if `metadataTemplate` is set. */
  metadataContext?: Omit<MetadataContext, "fileSize">;

  /** Optional progress hook for UI updates. */
  onProgress?: (event: UploadProgressEvent) => void;
}

export interface UploadOutcome {
  imageId: string;
  /** Built using `config.defaultVariant`. Signed if `config.useSignedUrls`. */
  url: string;
  finalSizeBytes: number;
  originalSizeBytes: number;
  wasCompressed: boolean;
  wasAvifConverted: boolean;
}

/**
 * Uploads an image to Cloudflare Images. Handles:
 *   1. AVIF → WebP/JPEG/PNG conversion (CF refuses AVIF input)
 *   2. Compression if over `compressionConfig.maxFileSizeMB`
 *   3. Multipart POST to /accounts/:id/images/v1
 *   4. URL construction (public or HMAC-signed)
 *
 * The caller is responsible for dedupe — hash the input with
 * `calculateFileHash()`, check your own cache, and only call this if you don't
 * already have a URL for that hash.
 *
 * Temp files created during conversion / compression are cleaned up before
 * return. On error they are still cleaned up.
 */
export async function uploadImage(
  options: UploadImageOptions,
): Promise<UploadOutcome> {
  let workingPath: string;
  let cleanupSourcePath: string | null = null;

  // Step 1: get a real file path. If we were given a buffer, write it to a
  // temp file (sharp + form-data both want a path or stream, not a Buffer).
  if (options.source.type === "buffer") {
    const tempPath = path.join(
      require("node:os").tmpdir(),
      `cf-upload-${Date.now()}-${sanitizeFileName(options.source.fileName)}`,
    );
    fs.writeFileSync(tempPath, options.source.data);
    workingPath = tempPath;
    cleanupSourcePath = tempPath;
  } else {
    workingPath = options.source.path;
  }

  let cleanupAvifPath: string | null = null;
  let cleanupCompressedPath: string | null = null;

  try {
    // Step 2: AVIF conversion.
    const avifFormat = options.avifConversionFormat ?? "webp";
    const compressionConfig = options.compressionConfig ?? defaultCompression();
    const avifResult = await convertAvifIfNeeded(
      workingPath,
      avifFormat,
      compressionConfig,
    );
    if (avifResult.wasConverted) {
      cleanupAvifPath = avifResult.path;
      workingPath = avifResult.path;
      options.onProgress?.({
        type: "avif-converted",
        toFormat: avifFormat,
      });
    }

    // Step 3: compression.
    let compressionResult: CompressionResult = {
      path: workingPath,
      wasCompressed: false,
      originalSize: fs.statSync(workingPath).size,
      newSize: fs.statSync(workingPath).size,
    };
    if (options.compressionConfig) {
      compressionResult = await compressImageIfNeeded(
        workingPath,
        options.compressionConfig,
      );
      if (compressionResult.wasCompressed) {
        cleanupCompressedPath = compressionResult.path;
        workingPath = compressionResult.path;
        options.onProgress?.({
          type: "compressed",
          originalBytes: compressionResult.originalSize,
          newBytes: compressionResult.newSize,
        });
      }
    }

    // Step 4: build the multipart body and POST.
    options.onProgress?.({ type: "uploading" });

    const fileName =
      options.source.type === "buffer"
        ? options.source.fileName
        : path.basename(options.source.path);

    const form = new FormData();
    const fileBuffer = fs.readFileSync(workingPath);
    const fileBlob = new Blob([fileBuffer as unknown as Uint8Array]);
    form.append("file", fileBlob, fileName);
    form.append(
      "requireSignedURLs",
      options.config.useSignedUrls ? "true" : "false",
    );

    if (options.metadataTemplate) {
      if (!options.metadataContext) {
        throw new Error(
          "uploadImage: metadataTemplate provided but metadataContext is missing.",
        );
      }
      const fileSize = compressionResult.newSize;
      const metadata = resolveMetadataTemplate(options.metadataTemplate, {
        ...options.metadataContext,
        fileSize,
      });
      const metadataJson = JSON.stringify(metadata);
      if (metadataJson.length > CF_METADATA_BYTE_LIMIT) {
        options.onProgress?.({
          type: "metadata-warning",
          message: `Metadata exceeds Cloudflare's ${CF_METADATA_BYTE_LIMIT}-byte limit (${metadataJson.length} bytes). It may be truncated.`,
          metadataBytes: metadataJson.length,
          limit: CF_METADATA_BYTE_LIMIT,
        });
      }
      form.append("metadata", metadataJson);
    }

    const response = await fetch(
      `${CF_API_BASE}/accounts/${options.config.accountId}/images/v1`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.config.apiToken}`,
        },
        body: form,
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Cloudflare Images upload failed (${response.status} ${response.statusText}): ${errorBody}`,
      );
    }

    const data = (await response.json()) as { result?: { id?: string } };
    const imageId = data.result?.id;
    if (!imageId) {
      throw new Error(
        "Cloudflare Images upload succeeded but the response had no image ID.",
      );
    }

    const url = buildDeliveryUrl(
      imageId,
      options.config.defaultVariant,
      options.config,
    );

    return {
      imageId,
      url,
      finalSizeBytes: compressionResult.newSize,
      originalSizeBytes: compressionResult.originalSize,
      wasCompressed: compressionResult.wasCompressed,
      wasAvifConverted: avifResult.wasConverted,
    };
  } finally {
    // Best-effort cleanup. Ignore errors — temp files will be GC'd by macOS
    // eventually if we miss one.
    for (const p of [cleanupCompressedPath, cleanupAvifPath, cleanupSourcePath]) {
      if (p) {
        try {
          fs.unlinkSync(p);
        } catch {
          // ignore
        }
      }
    }
  }
}

function defaultCompression(): CompressionConfig {
  return {
    enableCompression: false,
    maxFileSizeMB: 10,
    compressionQuality: 80,
    preservePngFormat: false,
  };
}

function sanitizeFileName(name: string): string {
  // Strip path separators and any character that's unsafe in a temp filename.
  return name.replace(/[/\\]/g, "_").replace(/[^\w.\-]/g, "_");
}
