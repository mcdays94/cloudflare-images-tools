# cf-images-tools

A monorepo for the **CF Images** family of tools — a clipboard-first uploader for
Cloudflare Images, plus surfaces for Raycast, Zed (via MCP), and beyond.

Unofficial. Not affiliated with Cloudflare, Inc.

---

## Why this exists

The original implementation lives in the
[`cloudflare-images-upload`](https://github.com/mcdays94/cloudflare-images-upload-extension)
VS Code / Cursor / Windsurf extension. That works great inside the VS Code
extension model — `documentPasteEdits` and `documentDropEdits` intercept paste
and drag events directly in the editor.

Other editors (Zed, in particular) don't expose those surfaces. The fix is to
move the workflow *next to* the editor instead of *inside* it: a Raycast
extension fired from `⌘ Space` preserves the paste-from-clipboard moment and
works in every app, not just one editor. A future MCP server adds an
agent-callable surface that drops the same logic into Zed, Claude Code,
Cursor, and anything else that speaks MCP.

The VS Code extension stays as-is — this repo is its sibling, not its
replacement.

## Packages

| Package | Status | Purpose |
|---|---|---|
| [`packages/core`](./packages/core) | scaffolded | `@mcdays94/cf-images-core` — pure TypeScript: auth, upload, dedupe, signed URLs, compression, metadata, list, delete. No editor or platform assumptions. |
| [`packages/raycast`](./packages/raycast) | scaffolded, **Validate Credentials** command works end-to-end | `CF Images` Raycast extension. Three commands: **Upload Clipboard Image**, **Upload Selected File**, **My CF Images**. |
| `packages/mcp` | not yet | `@mcdays94/cf-images-mcp` — MCP server wrapping the same core. Adds Zed/Claude Code/Cursor support. |

## Layout

```
cf-images-tools/
  package.json              ← npm workspaces root
  tsconfig.base.json        ← shared strict TS config
  packages/
    core/                   ← @mcdays94/cf-images-core
      src/
        index.ts            ← public exports
        types.ts
        hash.ts             ← SHA-256 for dedupe
        compress.ts         ← sharp-based compression + AVIF conversion
        metadata.ts         ← metadata template variable resolution
        signed-urls.ts      ← HMAC signing, signing-key fetch
        url.ts              ← format URL as markdown / HTML / raw
        upload.ts           ← POST to /accounts/:id/images/v1
        list.ts             ← GET /accounts/:id/images/v1 (paginated)
        delete.ts           ← DELETE /accounts/:id/images/v1/:image_id
        validate.ts         ← Cheap auth check (HEAD-style ping)
    raycast/                ← CF Images Raycast extension
      package.json          ← Raycast manifest
      src/
        validate-credentials.tsx   ← Working — pings CF API, shows toast
        upload-clipboard.tsx       ← Stub
        upload-finder.tsx          ← Stub
        my-images.tsx              ← Stub
        lib/
          config.ts                ← Read Raycast prefs → CloudflareConfig
          cache.ts                 ← LocalStorage-based dedupe cache
```

## Get started

```bash
npm install
npm run typecheck
# Then for Raycast development:
cd packages/raycast
npm run dev   # launches Raycast in dev mode and registers all commands
```

Open Raycast → "Validate Cloudflare Credentials" command should appear under
"CF Images". The first time you run it, it'll prompt for your account ID, API
token, and account hash via Raycast preferences. Then it pings the CF Images
API and shows a success / failure toast.

## What's stubbed vs working in this initial scaffold

| Piece | Status |
|---|---|
| `packages/core` — types, signatures, public exports | ✅ |
| `packages/core` — `calculateFileHash`, `extractImageIdFromUrl`, `formatImageUrl`, `validateCredentials` | ✅ ported / written |
| `packages/core` — `uploadImage`, `listImages`, `deleteImage`, `generateSignedUrl`, `compressImageIfNeeded`, `convertAvifIfNeeded`, `resolveMetadataTemplate`, `fetchSigningKey` | ✅ ported from VS Code ext |
| `packages/raycast` — manifest, preferences, three command declarations | ✅ |
| `packages/raycast` — Validate Credentials command (end-to-end working) | ✅ |
| `packages/raycast` — `lib/config.ts`, `lib/cache.ts` | ✅ |
| `packages/raycast` — `upload-clipboard.tsx` | ⬜ stubbed; clipboard-image reading pattern documented inline |
| `packages/raycast` — `upload-finder.tsx` | ⬜ stubbed |
| `packages/raycast` — `my-images.tsx` | ⬜ stubbed |
| `packages/mcp` | ⬜ not started — v2 |

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md).

## License

MIT. See [`LICENSE`](./LICENSE).
