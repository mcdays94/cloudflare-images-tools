# @mcdays/cloudflare-images-core

Core TypeScript logic for the Cloudflare Images family of tools. Upload, dedupe, signed URLs, compression (via `sharp`), AVIF conversion, metadata templating, list, delete, variant management. No editor or platform assumptions, intended to be consumed by surface packages.

Unofficial. Not affiliated with Cloudflare, Inc.

> **Used by:** the [Cloudflare Images](https://www.raycast.com/miguel_caetano_dias/cloudflare-images) Raycast extension by the same author. If you want a ready-to-use surface, install that instead. This package is for developers building new surfaces (CLIs, MCP servers, plugins for other editors) over the same Cloudflare Images API.
>
> Sibling project of the original [`cloudflare-images-upload`](https://github.com/mcdays94/cloudflare-images-upload-extension) VS Code extension.

## Install

```bash
npm install @mcdays/cloudflare-images-core
```

Requires Node 20 or later (uses native `fetch`, `FormData`, `Blob`, `crypto.subtle`).

## Public API

All functions are pure. No global state, no surface-specific dependencies. Pass a `CloudflareConfig` to anything that talks to the API; the surface is responsible for collecting credentials and dedupe-cache storage.

### Upload

```ts
import { uploadImage } from "@mcdays/cloudflare-images-core";

const outcome = await uploadImage({
  source: { type: "file", path: "/tmp/screenshot.png", fileName: "screenshot.png" },
  // or: { type: "buffer", data: buf, fileName: "screenshot.png" }
  config: { accountId, apiToken, accountHash, defaultVariant: "/public", useSignedUrls: false, signingKey: "", signedUrlExpiration: 0 },
  compressionConfig: { enableCompression: true, maxFileSizeMB: 10, compressionQuality: 80, preservePngFormat: false },
  avifConversionFormat: "webp",
  metadataTemplate: { uploadedBy: "my-tool", uploadedAt: "${timestamp}" },
  metadataContext: { fileName: "screenshot.png", filePath: "/tmp/screenshot.png", surfaceVersion: "my-tool-1.0.0" },
  onProgress: (event) => {/* compression / avif-converted / uploading / metadata-warning */},
});
// outcome.imageId, outcome.url, outcome.wasCompressed, outcome.wasAvifConverted, etc.
```

### List, delete, variants

```ts
import { listImages, deleteImage, listVariants } from "@mcdays/cloudflare-images-core";

const page = await listImages({ config: { accountId, apiToken }, perPage: 100, continuationToken: undefined });
// page.images[], page.continuationToken

const ok = await deleteImage("image-id", { accountId, apiToken });

const variants = await listVariants({ accountId, apiToken });
// [{ id: "public", options: {...}, neverRequireSignedURLs: false }, ...]
```

### URL construction

```ts
import { buildDeliveryUrl, buildPublicUrl, generateSignedUrl, formatImageUrl } from "@mcdays/cloudflare-images-core";

// Chooses signed vs public based on config.useSignedUrls
const url = buildDeliveryUrl(imageId, "/public", config);

// Or the lower-level primitives
const publicUrl = buildPublicUrl(imageId, "/public", accountHash);
const signedUrl = generateSignedUrl(imageId, "/public", { ...config, signingKey, useSignedUrls: true });

// Format for paste
formatImageUrl(url, "screenshot.png", "markdown"); // ![screenshot.png](https://...)
formatImageUrl(url, "screenshot.png", "html");     // <img src="..." alt="..." />
formatImageUrl(url, "screenshot.png", "raw");      // https://...
```

### Validation, hashing, image-id extraction

```ts
import { validateCredentials, calculateFileHash, extractImageIdFromUrl, fetchSigningKey } from "@mcdays/cloudflare-images-core";

const result = await validateCredentials({ accountId, apiToken, accountHash });
// { ok: true, imageCount } or { ok: false, reason: "auth-failed" | "account-not-found" | ..., detail }

const hash = calculateFileHash(buffer);                          // SHA-256 hex, used for dedupe cache keys
const imageId = extractImageIdFromUrl("https://imagedelivery.net/HASH/IMG/public"); // "IMG"
const key = await fetchSigningKey(accountId, apiToken);          // hits /accounts/:id/images/v1/keys
```

### Metadata templating

```ts
import { resolveMetadataTemplate } from "@mcdays/cloudflare-images-core";

const resolved = resolveMetadataTemplate(
  { uploadedBy: "my-tool", uploadedAt: "${timestamp}", fileName: "${fileName}" },
  { fileName: "screenshot.png", filePath: "/tmp/screenshot.png", fileSize: 12345, surfaceVersion: "my-tool-1.0.0" },
);
// { uploadedBy: "my-tool", uploadedAt: "2026-05-13T10:00:00.000Z", fileName: "screenshot.png" }
```

Eight placeholders supported: `${fileName}`, `${timestamp}`, `${date}`, `${time}`, `${fileSize}`, `${fileExtension}`, `${surfaceVersion}`, `${workspaceName}`.

### Compression

```ts
import { compressImageIfNeeded, convertAvifIfNeeded } from "@mcdays/cloudflare-images-core";

// Progressive-quality reduction until file fits under maxFileSizeMB
const result = await compressImageIfNeeded("/tmp/big.jpg", { enableCompression: true, maxFileSizeMB: 10, compressionQuality: 80, preservePngFormat: false });
// result.path (may be a temp file), result.wasCompressed, result.originalSize, result.newSize

// CF Images doesn't accept AVIF input; convert first
const avifResult = await convertAvifIfNeeded("/tmp/photo.avif", "webp", { enableCompression: false, maxFileSizeMB: 10, compressionQuality: 80, preservePngFormat: false });
// avifResult.path (temp .webp), avifResult.wasConverted
```

## License

MIT.
