import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  confirmAlert,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";

import {
  buildPublicUrl,
  deleteImage,
  formatImageUrl,
  generateSignedUrl,
  listImages,
  type CloudflareImage,
} from "@mcdays94/cloudflare-images-core";
import { buildCloudflareConfig, getPreferences } from "./lib/config.js";
import { getEffectiveDefaultVariant } from "./lib/variant.js";

/**
 * My Cloudflare Images — V0.4 milestone in ROADMAP.md.
 *
 * STATUS: stub. The list scaffold works: it fetches the first page of images
 * and renders them with thumbnails and a basic action panel (copy URL,
 * open, delete). To finish:
 *
 *   - Pagination via `List.Item.Pagination` and the `continuationToken`
 *     returned by `listImages()`.
 *   - "Copy as Markdown / HTML / Raw" action variants (currently uses the
 *     user's `outputFormat` preference for the primary action only).
 *   - "View Metadata" detail (Raycast has a built-in Detail view that
 *     renders the `meta` object nicely).
 *   - Confirm-before-delete tightening — current confirmAlert dialog uses
 *     the default style; consider Alert.ActionStyle.Destructive.
 *   - Search/filter — Raycast's List supports onSearchTextChange; wire it
 *     up to filter on filename + metadata.
 *   - Signed-URL handling: if `requireSignedURLs` is true on an image,
 *     `buildPublicUrl()` won't work — we need the signing key. Fetch it
 *     lazily via `getSigningKey` (TODO: not yet implemented in this surface;
 *     `core` exposes `fetchSigningKey`).
 *
 * The Cloudflare list API is described at
 * https://developers.cloudflare.com/api/operations/cloudflare-images-list-images-v2
 * — the shape this stub assumes was not exercised against a live account.
 * If it returns 404 or has a different envelope shape, adjust `core/list.ts`
 * accordingly.
 */
export default function MyImagesCommand() {
  const prefs = getPreferences();
  // `config.defaultVariant` is whatever the preferences textfield holds; it's
  // overridden by the resolved effective variant below before we actually
  // build any URLs. Kept here so accountId / apiToken / accountHash are
  // available immediately for the list query without waiting on async.
  const config = buildCloudflareConfig(prefs);

  const [images, setImages] = useState<CloudflareImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  // Resolved asynchronously from the variant precedence chain (stored →
  // textfield → /public). Until it loads, fall back to the textfield value
  // so the first render doesn't show 404 thumbnails.
  const [effectiveVariant, setEffectiveVariant] = useState<string>(
    prefs.defaultVariant || "/public",
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const [page, variant] = await Promise.all([
          listImages({
            config: { accountId: config.accountId, apiToken: config.apiToken },
            perPage: 100,
          }),
          getEffectiveDefaultVariant(prefs),
        ]);
        if (!cancelled) {
          setImages(page.images);
          setEffectiveVariant(variant);
        }
      } catch (err) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to list images",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <List isLoading={isLoading} isShowingDetail={false}>
      {images.map((image) => {
        const previewUrl = image.requireSignedURLs
          ? // TODO: build signed URL here once we have a signing key fetched
            buildPublicUrl(image.id, effectiveVariant, config.accountHash)
          : buildPublicUrl(image.id, effectiveVariant, config.accountHash);

        return (
          <List.Item
            key={image.id}
            id={image.id}
            title={image.filename || image.id}
            subtitle={image.id}
            accessories={[{ date: new Date(image.uploaded) }]}
            icon={{ source: previewUrl }}
            actions={
              <ActionPanel>
                <Action
                  title={`Copy as ${labelFor(prefs.outputFormat)}`}
                  icon={Icon.Clipboard}
                  onAction={async () => {
                    const formatted = formatImageUrl(
                      previewUrl,
                      image.filename,
                      prefs.outputFormat,
                    );
                    await Clipboard.copy(formatted);
                    await showToast({
                      style: Toast.Style.Success,
                      title: "Copied",
                    });
                  }}
                />
                <Action.OpenInBrowser url={previewUrl} title="Open in Browser" />
                <Action.CopyToClipboard
                  content={image.id}
                  title="Copy Image ID"
                  shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
                />
                <Action
                  title="Delete Image"
                  icon={Icon.Trash}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  onAction={async () => {
                    const confirmed = await confirmAlert({
                      title: "Delete this image from Cloudflare?",
                      message:
                        "This permanently removes the image from your Cloudflare Images account. URLs already pasted in your notes / blog posts / etc. will 404.",
                      primaryAction: {
                        title: "Delete",
                        style: Alert.ActionStyle.Destructive,
                      },
                    });
                    if (!confirmed) return;

                    const ok = await deleteImage(image.id, {
                      accountId: config.accountId,
                      apiToken: config.apiToken,
                    });
                    if (ok) {
                      setImages((prev) =>
                        prev.filter((i) => i.id !== image.id),
                      );
                      await showToast({
                        style: Toast.Style.Success,
                        title: "Deleted",
                      });
                    } else {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: "Couldn't delete image",
                      });
                    }
                  }}
                />
                <Action
                  title="Reload"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={() => setReloadKey((k) => k + 1)}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

function labelFor(format: "markdown" | "html" | "raw"): string {
  switch (format) {
    case "markdown":
      return "Markdown";
    case "html":
      return "HTML";
    case "raw":
      return "URL";
  }
}
