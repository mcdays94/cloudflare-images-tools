# Roadmap

## ✅ v0.1 — Raycast Validate-Only

- [x] Monorepo skeleton (npm workspaces, TS project references)
- [x] `packages/core` with all the pure logic ported from the VS Code extension
- [x] `packages/raycast` with preferences + Validate Credentials command working end-to-end

## ✅ v0.2 — Upload Clipboard Image

- [x] `upload-clipboard.tsx`: read clipboard (file ref → text path → raw image via `osascript "«class PNGf»"`)
- [x] Pipe through core: compress → dedupe (LocalStorage cache) → upload → format URL
- [x] Write formatted URL back to clipboard (markdown / html / raw based on preference)
- [x] Toast + HUD with success / failure
- [x] `Clipboard.paste()` to insert at cursor in frontmost app — preserves the paste-from-clipboard UX

## ✅ v0.2.1 — Variant dropdown

- [x] Live list of CF Images variants from `GET /images/v1/variants`
- [x] "Set Default Variant" command with checkmark on currently-stored
- [x] Stored in LocalStorage; falls back to textfield preference then `/public`

## ✅ v0.2.2 — Variant cache fix

- [x] Cache stores `imageId` instead of full URL
- [x] Variant change between uploads now respected on cache hits
- [x] Legacy v0.2.1 cache entries migrated via `extractImageIdFromUrl`

## ✅ v0.2.3 — Format dropdown argument

- [x] Optional dropdown argument on Upload Clipboard Image: Markdown / HTML / Raw URL / Use preference
- [x] LaunchProps typed; falls back to preference when skipped

## ✅ v0.2.4 — Filename in CF Images dashboard

- [x] `uploadImage()`'s `source: file` accepts optional `fileName` override
- [x] Upload Clipboard Image passes the timestamp-based name (not the UUID temp name)
- [x] Upload Selected File passes the Finder basename

## ✅ v0.3 — Upload Selected File multi-select

- [x] Sequential upload of all selected Finder image items
- [x] Per-file progress toast: "Uploading 3/7: foo.png"
- [x] Partial-failure tolerant: successes copied even if some fail
- [x] Joined newline-separated output for clipboard paste

## ✅ v0.3.1 — Format-locked command variants

- [x] `Upload Clipboard as Markdown` / `as HTML` / `as URL`
- [x] `Upload Selected File as Markdown` / `as HTML` / `as URL`
- [x] All thin shims over `lib/upload-clipboard-impl.ts` and `lib/upload-finder-impl.ts`

## ✅ v0.4 — VS Code parity gap closed

- [x] `addMetadata` toggle preference (on by default)
- [x] `metadataTemplate` JSON textfield preference with `${...}` placeholders
- [x] Default template identifies the Raycast extension as the uploader
- [x] `manualSigningKey` password-type preference for explicit override
- [x] Signing key resolution: manual override > LocalStorage cache > API auto-fetch
- [x] `SURFACE_VERSION` constant for `${surfaceVersion}` in metadata
- [x] My Cloudflare Images browser with search (keywords on filename + ID + metadata)
- [x] Detail panel toggleable via ⌘ D showing rendered image + metadata table
- [x] Delete with destructive confirm

## ⬜ v0.5 — Polish + Raycast Store prep

- [ ] Replace placeholder icon (you have the PSD in cf-images-vs-code-extension repo)
- [ ] README hero GIF via the `readme-hero-gif` skill (recorded screencast of paste workflow)
- [ ] CHANGELOG.md kept up to date — Raycast Store displays this in the listing
- [ ] CI on GitHub Actions: typecheck + ray build + smoke tests on PR
- [ ] Configure Metadata Template form-view command (friendlier than editing JSON)
- [ ] Pagination in My Cloudflare Images via `continuationToken` (beyond 100 images)
- [ ] Signed-URL list-view handling (currently best-effort; works when key fetchable)
- [ ] Bulk delete in My Cloudflare Images (currently one-at-a-time)
- [ ] Raycast Store submission

## ⬜ v1.0 — MCP server (Zed-native surface)

- [ ] `packages/mcp` — `@mcdays94/cloudflare-images-mcp`
- [ ] Tools: `upload_image_from_path`, `upload_image_from_base64`, `list_images`, `get_image`, `delete_image`, `list_variants`, `set_default_variant`
- [ ] Stdio MCP transport
- [ ] Zed extension wrapper (Rust + WIT bindings) — publishes to Zed Extension Registry
- [ ] npm-distributable for Claude Code / Cursor / Cody users
- [ ] Documentation: Zed install instructions; .mcp.json snippets for other clients

## Out of scope (not building)

- **Drag-drop into the editor** — Raycast can't intercept editor drop events. Drop into Raycast's own UI is a different paradigm; would need a separate command.
- **Delete-on-removal from editor** — only really makes sense inside the editor. The VS Code extension has this; My Cloudflare Images list view is the closest substitute.
- **Per-language smart syntax formatting** — replaced by `outputFormat` preference + dropdown + 6 format-locked commands.
- **Bulk upload from clipboard** — clipboard can only hold one image at a time.
- **Account switching / multi-account** — file an issue if you want this.
