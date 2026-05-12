import {
  Clipboard,
  closeMainWindow,
  launchCommand,
  LaunchType,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as fs from "node:fs";

import {
  calculateFileHash,
  formatImageUrl,
  uploadImage,
} from "@mcdays94/cf-images-core";
import {
  buildCloudflareConfig,
  buildCompressionConfig,
  getPreferences,
  type CfImagesPreferences,
} from "./lib/config.js";
import { addImageToCache, getCachedImage } from "./lib/cache.js";
import { getCachedOrFetchSigningKey } from "./lib/signing-key.js";

const execAsync = promisify(exec);

/**
 * Upload Clipboard Image — V0.2.
 *
 * Flow:
 *   1. Validate credentials are present in prefs.
 *   2. Close Raycast so the previous app regains focus (this matters for
 *      step 8 — Clipboard.paste pastes into the now-focused app).
 *   3. Read the clipboard, in priority order:
 *        a. `clipboard.file` (Finder-copied file reference)
 *        b. `clipboard.text` that looks like an image path
 *        c. Raw image bytes via osascript `«class PNGf»` (screenshots etc.)
 *   4. Hash the bytes. If we've uploaded this exact image before, reuse the
 *      cached URL (Raycast LocalStorage holds the dedupe cache for 30 days).
 *   5. Otherwise, fetch a signing key if signed URLs are enabled, then call
 *      `uploadImage()` from the core.
 *   6. Format the resulting URL per the user's `outputFormat` preference.
 *   7. `Clipboard.paste(formatted)` — Raycast pastes into the focused app at
 *      the cursor AND leaves the formatted string on the clipboard, so even
 *      if the paste lands somewhere unexpected the user can ⌘V again.
 *   8. HUD confirmation.
 *
 * Failure surfaces:
 *   - Missing credentials → toast directs user to Validate Credentials
 *   - No image on clipboard → toast with hint
 *   - Network / CF error → toast with the error message
 */
export default async function UploadClipboardCommand() {
  const prefs = getPreferences();

  // 1. Credentials check — bail before closing the window so the toast is visible.
  const missing = missingCredentials(prefs);
  if (missing.length > 0) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Cloudflare credentials missing",
      message: `Fill in ${missing.join(", ")} via ⌘ , — or run Validate Cloudflare Credentials.`,
      primaryAction: {
        title: "Run Validate Credentials",
        onAction: async () => {
          await launchCommand({
            name: "validate-credentials",
            type: LaunchType.UserInitiated,
          });
        },
      },
    });
    return;
  }

  // 2. Close Raycast — gives focus back to the app the user was in so the
  // eventual Clipboard.paste lands in the right place. Done early so the user
  // sees their previous app immediately while the upload runs.
  await closeMainWindow();

  let imagePath: string | null = null;
  let cleanupOsascriptPath: string | null = null;
  let fileName = "clipboard-image.png";

  try {
    // 3. Read clipboard.
    const clipboard = await Clipboard.read();

    if (clipboard.file) {
      imagePath = decodeURIComponent(clipboard.file.replace(/^file:\/\//, ""));
      fileName = imagePath.split("/").pop() ?? fileName;
    } else if (
      clipboard.text &&
      /\.(png|jpe?g|gif|webp|tiff?|bmp|svg|heic|heif|avif)$/i.test(
        clipboard.text.trim(),
      )
    ) {
      imagePath = clipboard.text.trim();
      fileName = imagePath.split("/").pop() ?? fileName;
    } else {
      // Raw image data on the system pasteboard (e.g. ⌘⇧⌃4 screenshot, or a
      // copy-image from a browser). osascript dumps the PNGf flavor to a
      // temp file we then upload.
      const tempPath = join(tmpdir(), `cf-clipboard-${randomUUID()}.png`);
      try {
        await execAsync(
          `osascript -e 'set theFile to open for access POSIX file "${tempPath}" with write permission' ` +
            `-e 'set theData to the clipboard as «class PNGf»' ` +
            `-e 'write theData to theFile' ` +
            `-e 'close access theFile'`,
        );
        // osascript happily creates a zero-byte file when there's no image —
        // check the file actually has bytes.
        const stat = fs.statSync(tempPath);
        if (stat.size === 0) {
          try {
            fs.unlinkSync(tempPath);
          } catch {
            // ignore
          }
          await showToast({
            style: Toast.Style.Failure,
            title: "No image on clipboard",
            message:
              "Copy an image first. Tip: ⌘⇧⌃4 screenshots to clipboard directly.",
          });
          return;
        }
        imagePath = tempPath;
        cleanupOsascriptPath = tempPath;
        fileName = `clipboard-${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.png`;
      } catch {
        await showToast({
          style: Toast.Style.Failure,
          title: "No image on clipboard",
          message:
            "Copy an image first. Tip: ⌘⇧⌃4 screenshots to clipboard directly.",
        });
        return;
      }
    }

    if (!imagePath) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not read clipboard image",
      });
      return;
    }

    // 4. Dedupe.
    const buffer = fs.readFileSync(imagePath);
    const hash = calculateFileHash(buffer);
    const cached = await getCachedImage(hash);

    let url: string;
    let toast: Toast | null = null;

    if (cached) {
      url = cached.url;
      await showToast({
        style: Toast.Style.Success,
        title: "Duplicate detected",
        message: `Reusing existing URL for ${cached.fileName}`,
      });
    } else {
      // 5. Build config (with signing key if needed) + upload.
      let signingKey = "";
      if (prefs.useSignedUrls) {
        try {
          signingKey = await getCachedOrFetchSigningKey(
            prefs.accountId,
            prefs.apiToken,
          );
        } catch (err) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Couldn't fetch signing key",
            message: err instanceof Error ? err.message : String(err),
          });
          return;
        }
      }

      const config = buildCloudflareConfig(prefs, signingKey);
      const compression = buildCompressionConfig(prefs);

      toast = await showToast({
        style: Toast.Style.Animated,
        title: "Uploading to Cloudflare Images…",
      });

      const outcome = await uploadImage({
        source: { type: "file", path: imagePath },
        config,
        compressionConfig: compression,
        avifConversionFormat: prefs.avifConversionFormat,
        metadataTemplate: {
          uploadedBy: "raycast-cf-images",
          uploadedAt: "${timestamp}",
          fileName: "${fileName}",
        },
        metadataContext: {
          fileName,
          filePath: imagePath,
          surfaceVersion: "raycast-0.1.0",
        },
        onProgress: (event) => {
          if (!toast) return;
          if (event.type === "compressed") {
            toast.message = `Compressed ${formatBytes(event.originalBytes)} → ${formatBytes(event.newBytes)}`;
          } else if (event.type === "avif-converted") {
            toast.message = `Converting AVIF → ${event.toFormat}…`;
          } else if (event.type === "uploading") {
            toast.message = "Uploading…";
          } else if (event.type === "metadata-warning") {
            // Quiet warning — surface in the HUD post-upload instead of
            // interrupting the in-flight toast.
            console.warn(event.message);
          }
        },
      });

      url = outcome.url;
      await addImageToCache(hash, url, fileName);
      await toast.hide();
      toast = null;
    }

    // 6. Format per output preference.
    const formatted = formatImageUrl(url, fileName, prefs.outputFormat);

    // 7. Paste at cursor in the previously-focused app. Clipboard.paste also
    // copies, so the formatted string ends up on the clipboard regardless of
    // where the paste lands.
    await Clipboard.paste(formatted);

    // 8. HUD confirmation. Raycast shows HUDs as a small bezel even after the
    // window is closed.
    await showHUD(`✓ ${humanFormatLabel(prefs.outputFormat)} pasted from CF Images`);
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Upload failed",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    if (cleanupOsascriptPath) {
      try {
        fs.unlinkSync(cleanupOsascriptPath);
      } catch {
        // ignore — temp files get GC'd by macOS
      }
    }
  }
}

function missingCredentials(prefs: CfImagesPreferences): string[] {
  const missing: string[] = [];
  if (!prefs.accountId?.trim()) missing.push("Account ID");
  if (!prefs.apiToken?.trim()) missing.push("API Token");
  if (!prefs.accountHash?.trim()) missing.push("Account Hash");
  return missing;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function humanFormatLabel(format: "markdown" | "html" | "raw"): string {
  switch (format) {
    case "markdown":
      return "Markdown";
    case "html":
      return "HTML";
    case "raw":
      return "URL";
  }
}
