import {
  Clipboard,
  closeMainWindow,
  getSelectedFinderItems,
  launchCommand,
  LaunchType,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import * as fs from "node:fs";

import {
  buildDeliveryUrl,
  calculateFileHash,
  formatImageUrl,
  uploadImage,
  type OutputFormat,
} from "@mcdays94/cloudflare-images-core";
import {
  buildCloudflareConfig,
  buildCompressionConfig,
  getPreferences,
  type CfImagesPreferences,
} from "./config.js";
import { addImageToCache, getCachedImage } from "./cache.js";
import { getEffectiveDefaultVariant } from "./variant.js";
import { getCachedOrFetchSigningKey } from "./signing-key.js";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".tif",
  ".tiff",
  ".bmp",
  ".svg",
  ".heic",
  ".heif",
  ".avif",
]);

/**
 * The full Upload Selected File pipeline, parameterised by an optional
 * format override. Used by:
 *
 *   - `upload-finder.tsx`           (formatOverride = null → user preference)
 *   - `upload-finder-markdown.tsx`  (formatOverride = "markdown")
 *   - `upload-finder-html.tsx`      (formatOverride = "html")
 *   - `upload-finder-url.tsx`       (formatOverride = "raw")
 *
 * Sequential not parallel: keeps the progress toast linear and readable, and
 * sidesteps cache races (two simultaneous uploads of identical bytes would
 * both miss and both upload). For ~10 files this is plenty fast.
 *
 * Failure mode is partial-tolerant: a single bad file doesn't kill the whole
 * batch. Successes are still copied; failures are surfaced afterwards in a
 * follow-up toast naming the affected files.
 */
export async function runUploadFinder(
  formatOverride: OutputFormat | null,
): Promise<void> {
  const prefs = getPreferences();
  const effectiveFormat: OutputFormat = formatOverride ?? prefs.outputFormat;

  // Credentials check up front — bail before closing the window.
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

  // Read the Finder selection BEFORE closing the Raycast window — Raycast
  // sometimes returns an empty selection if Finder has lost focus first.
  let selection: Awaited<ReturnType<typeof getSelectedFinderItems>>;
  try {
    selection = await getSelectedFinderItems();
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Couldn't read Finder selection",
      message:
        err instanceof Error
          ? err.message
          : "Make sure Finder is the frontmost app and at least one image is selected.",
    });
    return;
  }

  const imageItems = selection.filter((item) => {
    const ext = item.path.slice(item.path.lastIndexOf(".")).toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
  });

  if (imageItems.length === 0) {
    await showToast({
      style: Toast.Style.Failure,
      title: "No images selected in Finder",
      message: "Select one or more image files in Finder, then run this again.",
    });
    return;
  }

  // Resolve variant + signing key up front so every file uses the same
  // current settings.
  const effectiveVariant = await getEffectiveDefaultVariant(prefs);
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
  const config = buildCloudflareConfig(prefs, signingKey, effectiveVariant);
  const compression = buildCompressionConfig(prefs);

  await closeMainWindow();

  const total = imageItems.length;
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: total === 1 ? "Uploading…" : `Uploading 0/${total}…`,
  });

  type Success = { fileName: string; url: string; fromCache: boolean };
  type Failure = { fileName: string; error: string };
  const successes: Success[] = [];
  const failures: Failure[] = [];

  for (let i = 0; i < imageItems.length; i++) {
    const item = imageItems[i]!;
    const fileName = item.path.split("/").pop() ?? "image";
    toast.title =
      total === 1
        ? `Uploading ${fileName}…`
        : `Uploading ${i + 1}/${total}: ${fileName}`;
    toast.message = undefined;

    try {
      const buffer = fs.readFileSync(item.path);
      const hash = calculateFileHash(buffer);
      const cached = await getCachedImage(hash);

      if (cached) {
        const url = buildDeliveryUrl(cached.imageId, effectiveVariant, config);
        successes.push({ fileName, url, fromCache: true });
        continue;
      }

      const result = await uploadImage({
        source: { type: "file", path: item.path, fileName },
        config,
        compressionConfig: compression,
        avifConversionFormat: prefs.avifConversionFormat,
        metadataTemplate: {
          uploadedBy: "raycast-cloudflare-images",
          uploadedAt: "${timestamp}",
          fileName: "${fileName}",
        },
        metadataContext: {
          fileName,
          filePath: item.path,
          surfaceVersion: "raycast-0.3.0",
        },
        onProgress: (event) => {
          if (event.type === "compressed") {
            toast.message = `Compressed ${formatBytes(event.originalBytes)} → ${formatBytes(event.newBytes)}`;
          } else if (event.type === "avif-converted") {
            toast.message = `Converting AVIF → ${event.toFormat}…`;
          }
        },
      });

      await addImageToCache(hash, result.imageId, fileName);
      successes.push({ fileName, url: result.url, fromCache: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ fileName, error: message });
    }
  }

  await toast.hide();

  if (successes.length === 0) {
    await showToast({
      style: Toast.Style.Failure,
      title: total === 1 ? "Upload failed" : `All ${total} uploads failed`,
      message:
        total === 1
          ? failures[0]?.error
          : `${failures.map((f) => f.fileName).join(", ")}`,
    });
    return;
  }

  const formatted = successes
    .map((s) => formatImageUrl(s.url, s.fileName, effectiveFormat))
    .join("\n");

  await Clipboard.copy(formatted);

  const cacheHits = successes.filter((s) => s.fromCache).length;
  const cacheHitsNote =
    cacheHits > 0 ? ` (${cacheHits} reused from dedupe cache)` : "";
  const formatLabel = humanFormatLabel(effectiveFormat);

  if (failures.length === 0) {
    if (total === 1) {
      await showHUD(
        `✓ ${successes[0]!.fileName} copied as ${formatLabel}`,
      );
    } else {
      await showHUD(
        `✓ ${successes.length} images copied as ${formatLabel}${cacheHitsNote}`,
      );
    }
  } else {
    await showToast({
      style: Toast.Style.Failure,
      title: `${successes.length}/${total} uploaded, ${failures.length} failed`,
      message: `Failed: ${failures.map((f) => f.fileName).join(", ")}. Successes are on the clipboard.`,
    });
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

function humanFormatLabel(format: OutputFormat): string {
  switch (format) {
    case "markdown":
      return "Markdown";
    case "html":
      return "HTML";
    case "raw":
      return "URL";
  }
}
