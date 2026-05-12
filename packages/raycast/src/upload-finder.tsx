import {
  Clipboard,
  closeMainWindow,
  getSelectedFinderItems,
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
} from "@mcdays94/cloudflare-images-core";
import {
  buildCloudflareConfig,
  buildCompressionConfig,
  getPreferences,
} from "./lib/config.js";
import { addImageToCache, getCachedImage } from "./lib/cache.js";
import { getEffectiveDefaultVariant } from "./lib/variant.js";

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
 * Upload Selected File — V0.3 milestone in ROADMAP.md.
 *
 * STATUS: stub. The skeleton handles single-item upload end-to-end; batch /
 * multi-selection support is sketched but commented out so you can decide
 * the UX (one paste per file? joined newlines? confirmation prompt?).
 *
 * High-level flow:
 *   1. Ask Raycast for the currently-selected Finder items.
 *      Raycast handles the permission prompt the first time.
 *   2. Filter to image files (extension check).
 *   3. For each, hash → cache check → upload → format URL.
 *   4. Write the result(s) to clipboard.
 */
export default async function UploadFinderCommand() {
  await closeMainWindow();

  const prefs = getPreferences();
  const effectiveVariant = await getEffectiveDefaultVariant(prefs);
  // TODO (v0.3 polish): mirror upload-clipboard's signing-key fetch when
  // `prefs.useSignedUrls` is true. For now this stub passes an empty signing
  // key, so signed URLs will produce broken HMACs in upload-finder.
  const config = buildCloudflareConfig(prefs, "", effectiveVariant);
  const compression = buildCompressionConfig(prefs);

  // TODO: short-circuit if accountId / apiToken / accountHash are missing.

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

  // TODO (v0.3 polish): if imageItems.length > 1, decide on the batch UX
  // — for now we upload the first item only so this stub is safe to run.
  const item = imageItems[0]!;
  const fileName = item.path.split("/").pop() ?? "image";

  try {
    const buffer = fs.readFileSync(item.path);
    const hash = calculateFileHash(buffer);
    const cached = await getCachedImage(hash);

    let url: string;

    if (cached) {
      // Rebuild URL with current variant settings; cached imageId is stable.
      url = buildDeliveryUrl(cached.imageId, effectiveVariant, config);
      await showToast({
        style: Toast.Style.Success,
        title: "Duplicate detected — reusing existing image",
      });
    } else {
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: `Uploading ${fileName}…`,
      });

      const result = await uploadImage({
        // For Finder uploads `path.basename(item.path)` would already
        // give the friendly name, but pass explicitly for consistency
        // with upload-clipboard and to keep the metadata + form-data
        // filename in sync.
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
          surfaceVersion: "raycast-0.1.0",
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
      url = result.url;
      toast.hide();
    }

    const formatted = formatImageUrl(url, fileName, prefs.outputFormat);
    await Clipboard.copy(formatted);
    await showHUD(`✓ ${fileName} → clipboard (${prefs.outputFormat})`);
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: `Failed to upload ${fileName}`,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
