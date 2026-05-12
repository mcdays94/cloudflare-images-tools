import {
  Clipboard,
  closeMainWindow,
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
} from "./lib/config.js";
import { addImageToCache, getCachedImage } from "./lib/cache.js";

const execAsync = promisify(exec);

/**
 * Upload Clipboard Image — V0.2 milestone in ROADMAP.md.
 *
 * STATUS: stub. The skeleton is here and the core pipeline is wired, but the
 * clipboard-image reading needs to be exercised end-to-end and the failure
 * paths need polishing. Read each `TODO` below before shipping.
 *
 * High-level flow:
 *   1. Read clipboard. Three sources, in order:
 *        (a) `Clipboard.read().file` — a file reference (someone did
 *            "Copy" on a file in Finder)
 *        (b) `Clipboard.read().text` — a string that looks like an image
 *            file path
 *        (c) Raw image data on the system pasteboard (e.g. a screenshot
 *            from ⌘⇧4 / ⌘⇧⌃4). Dumped to a temp PNG via `osascript "«class PNGf»"`.
 *      This three-source pattern is lifted verbatim from
 *      raycast-open-in-photoshop/src/open-in-photoshop.ts.
 *   2. Hash the image with `calculateFileHash()` and check the local cache.
 *      If a hit, skip the upload and reuse the cached URL.
 *   3. Otherwise, call `uploadImage()` with the user's preferences.
 *   4. Format the resulting URL using the user's `outputFormat` preference
 *      (markdown / html / raw).
 *   5. Write back to clipboard so the next `⌘V` pastes the URL.
 *   6. HUD with a friendly confirmation.
 */
export default async function UploadClipboardCommand() {
  await closeMainWindow();

  const prefs = getPreferences();
  const config = buildCloudflareConfig(prefs);
  const compression = buildCompressionConfig(prefs);

  // TODO: short-circuit if accountId / apiToken / accountHash are missing —
  // direct the user to run "Validate Cloudflare Credentials" first.

  let imagePath: string | null = null;
  let cleanupPath: string | null = null;
  let fileName = "clipboard-image.png";

  try {
    // ----- 1. Read clipboard --------------------------------------------------
    const clipboard = await Clipboard.read();

    if (clipboard.file) {
      // Decode file:// URLs that Finder puts on the pasteboard
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
      // No file reference — try to dump raw clipboard image data via AppleScript.
      // This is the same trick used in raycast-open-in-photoshop. It returns
      // the bytes of the «class PNGf» flavor of whatever's on the pasteboard.
      const tempPath = join(tmpdir(), `cf-clipboard-${randomUUID()}.png`);
      try {
        await execAsync(
          `osascript -e 'set theFile to open for access POSIX file "${tempPath}" with write permission' ` +
            `-e 'set theData to the clipboard as «class PNGf»' ` +
            `-e 'write theData to theFile' ` +
            `-e 'close access theFile'`,
        );
        imagePath = tempPath;
        cleanupPath = tempPath;
        fileName = `clipboard-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      } catch (err) {
        await showToast({
          style: Toast.Style.Failure,
          title: "No image on clipboard",
          message:
            "Copy an image (or a file reference to one) and try again. You can also screenshot to clipboard with ⌘⇧⌃4.",
        });
        return;
      }
    }

    if (!imagePath) {
      // Unreachable in theory; defensive.
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not read clipboard image",
      });
      return;
    }

    // ----- 2. Dedupe ----------------------------------------------------------
    const buffer = fs.readFileSync(imagePath);
    const hash = calculateFileHash(buffer);
    const cached = await getCachedImage(hash);

    let url: string;

    if (cached) {
      url = cached.url;
      await showToast({
        style: Toast.Style.Success,
        title: "Duplicate detected — reusing existing URL",
      });
    } else {
      // ----- 3. Upload --------------------------------------------------------
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Uploading to Cloudflare Images…",
      });

      const outcome = await uploadImage({
        source: { type: "file", path: imagePath },
        config,
        compressionConfig: compression,
        avifConversionFormat: prefs.avifConversionFormat,
        // TODO: wire up metadata template once a Raycast preference exists for
        // it. For now we just attach a sensible default.
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
          if (event.type === "compressed") {
            toast.message = `Compressed ${formatBytes(event.originalBytes)} → ${formatBytes(event.newBytes)}`;
          } else if (event.type === "avif-converted") {
            toast.message = `Converting AVIF → ${event.toFormat}…`;
          } else if (event.type === "uploading") {
            toast.message = "Uploading…";
          }
        },
      });

      url = outcome.url;
      await addImageToCache(hash, url, fileName);
      toast.hide();
    }

    // ----- 4. Format ----------------------------------------------------------
    const formatted = formatImageUrl(url, fileName, prefs.outputFormat);

    // ----- 5. Clipboard -------------------------------------------------------
    await Clipboard.copy(formatted);

    // ----- 6. Confirm ---------------------------------------------------------
    await showHUD(`✓ ${humanFormatLabel(prefs.outputFormat)} copied to clipboard`);
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Upload failed",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    if (cleanupPath) {
      try {
        fs.unlinkSync(cleanupPath);
      } catch {
        // ignore
      }
    }
  }
}

function formatBytes(bytes: number): string {
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
