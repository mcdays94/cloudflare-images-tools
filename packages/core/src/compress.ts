import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import sharp from "sharp";
import type { AvifConversionFormat, CompressionConfig } from "./types.js";

export interface CompressionResult {
  /** Path to the (possibly new, possibly original) file to upload. */
  path: string;
  /** True if a new file was created (caller is responsible for cleanup). */
  wasCompressed: boolean;
  /** Bytes before compression. */
  originalSize: number;
  /** Bytes after compression. Equal to `originalSize` if no compression. */
  newSize: number;
}

export interface AvifConversionResult {
  path: string;
  wasConverted: boolean;
}

/**
 * Converts AVIF to a Cloudflare-compatible format. Cloudflare Images does NOT
 * accept AVIF as input, so this is a required pre-step for AVIF uploads.
 *
 * The output is written to a new temp file; the caller must clean it up.
 *
 * Ported from the VS Code extension.
 */
export async function convertAvifIfNeeded(
  imagePath: string,
  format: AvifConversionFormat,
  compressionConfig: CompressionConfig,
): Promise<AvifConversionResult> {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext !== ".avif") {
    return { path: imagePath, wasConverted: false };
  }

  try {
    const outputExt =
      format === "jpeg" ? ".jpg" : format === "png" ? ".png" : ".webp";
    const tempPath = path.join(
      os.tmpdir(),
      `cf-avif-converted-${Date.now()}${outputExt}`,
    );

    const sharpInstance = sharp(imagePath);
    let buffer: Buffer;

    if (format === "png") {
      buffer = await sharpInstance.png().toBuffer();
    } else if (format === "jpeg") {
      buffer = await sharpInstance
        .jpeg({ quality: compressionConfig.compressionQuality, mozjpeg: true })
        .toBuffer();
    } else {
      buffer = await sharpInstance
        .webp({ quality: compressionConfig.compressionQuality })
        .toBuffer();
    }

    fs.writeFileSync(tempPath, buffer);
    return { path: tempPath, wasConverted: true };
  } catch {
    // Fall back to the original path; the upload will likely fail with a CF
    // error which is more informative than swallowing it here.
    return { path: imagePath, wasConverted: false };
  }
}

/**
 * Compresses an image if it exceeds `maxFileSizeMB`. Tries progressively
 * lower quality settings (5 attempts, dropping by 15 each time) before giving
 * up and returning the last attempt.
 *
 * SVG and GIF are skipped — sharp doesn't compress them effectively, and GIF
 * compression breaks animation.
 *
 * Ported from the VS Code extension.
 */
export async function compressImageIfNeeded(
  imagePath: string,
  compressionConfig: CompressionConfig,
): Promise<CompressionResult> {
  const stats = fs.statSync(imagePath);
  const fileSizeMB = stats.size / (1024 * 1024);
  const originalSize = stats.size;

  if (
    !compressionConfig.enableCompression ||
    fileSizeMB <= compressionConfig.maxFileSizeMB
  ) {
    return {
      path: imagePath,
      wasCompressed: false,
      originalSize,
      newSize: originalSize,
    };
  }

  const ext = path.extname(imagePath).toLowerCase();

  // Skip formats sharp can't usefully reduce.
  if (ext === ".svg" || ext === ".gif") {
    return {
      path: imagePath,
      wasCompressed: false,
      originalSize,
      newSize: originalSize,
    };
  }

  try {
    let outputExt = ext;
    if (ext === ".png" && !compressionConfig.preservePngFormat) {
      outputExt = ".jpg";
    } else if (ext === ".heic" || ext === ".heif" || ext === ".bmp") {
      outputExt = ".jpg";
    }
    const tempPath = path.join(
      os.tmpdir(),
      `cf-compressed-${Date.now()}${outputExt}`,
    );

    let quality = compressionConfig.compressionQuality;
    let compressedBuffer: Buffer | undefined;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      const sharpInstance = sharp(imagePath);

      if (ext === ".png" && compressionConfig.preservePngFormat) {
        compressedBuffer = await sharpInstance
          .png({ compressionLevel: 9, palette: true })
          .toBuffer();
      } else if (
        ext === ".png" ||
        ext === ".jpg" ||
        ext === ".jpeg" ||
        ext === ".heic" ||
        ext === ".heif" ||
        ext === ".bmp"
      ) {
        compressedBuffer = await sharpInstance
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
      } else if (ext === ".webp") {
        compressedBuffer = await sharpInstance.webp({ quality }).toBuffer();
      } else {
        compressedBuffer = await sharpInstance
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
      }

      const compressedSizeMB = compressedBuffer.length / (1024 * 1024);
      if (compressedSizeMB <= compressionConfig.maxFileSizeMB) {
        fs.writeFileSync(tempPath, compressedBuffer);
        return {
          path: tempPath,
          wasCompressed: true,
          originalSize,
          newSize: compressedBuffer.length,
        };
      }

      quality = Math.max(10, quality - 15);
      attempts++;
    } while (attempts < maxAttempts);

    // Give up and return the last (smallest-quality) attempt anyway.
    if (compressedBuffer) {
      fs.writeFileSync(tempPath, compressedBuffer);
      return {
        path: tempPath,
        wasCompressed: true,
        originalSize,
        newSize: compressedBuffer.length,
      };
    }

    return {
      path: imagePath,
      wasCompressed: false,
      originalSize,
      newSize: originalSize,
    };
  } catch {
    return {
      path: imagePath,
      wasCompressed: false,
      originalSize,
      newSize: originalSize,
    };
  }
}
