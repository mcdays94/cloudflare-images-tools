# Roadmap

## v0.1 — Raycast Validate-Only (this scaffold)

- [x] Monorepo skeleton (npm workspaces, TS project references)
- [x] `packages/core` with all the pure logic ported from the VS Code extension
- [x] `packages/raycast` with preferences + Validate Credentials command working
- [ ] User runs `npm install`, `npm run dev` in `packages/raycast`, confirms the Validate Credentials command pings CF successfully

## v0.2 — Upload Clipboard Image

- [ ] `upload-clipboard.tsx`: read clipboard (file ref → text path → raw image via `osascript "«class PNGf»"`)
- [ ] Pipe through core: compress → dedupe (LocalStorage cache) → upload → format URL
- [ ] Write formatted URL back to clipboard (markdown / HTML / raw based on preference)
- [ ] Toast + HUD with success / failure
- [ ] Optional: `Clipboard.paste()` to insert at cursor in frontmost app

## v0.3 — Upload Selected Finder File

- [ ] `upload-finder.tsx`: read selected Finder items via Raycast's `getSelectedFinderItems()`
- [ ] Same core pipeline as v0.2
- [ ] Batch mode (multiple selections)

## v0.4 — My Cloudflare Images

- [ ] `my-images.tsx`: paginated list view with thumbnails (Raycast `List.Item` with image accessory)
- [ ] Actions: copy URL (markdown / HTML / raw), open in browser, delete (with confirmation), copy image ID, view metadata
- [ ] Search / filter by filename / metadata
- [ ] Pagination via Raycast list pagination

## v0.5 — Polish

- [ ] Icon (replace placeholder)
- [ ] README hero gif via `readme-hero-gif` skill
- [ ] CHANGELOG via changesets
- [ ] CI on GitHub Actions
- [ ] Raycast Store submission

## v1.0 — MCP server

- [ ] `packages/mcp` — `@mcdays94/cloudflare-images-mcp`
- [ ] Tools: `upload_image`, `list_images`, `delete_image`, `get_image`
- [ ] Stdio MCP transport
- [ ] Zed extension wrapper (Rust + WIT bindings)
- [ ] Publish to Zed Extension Registry

## Out of scope (for now)

- Drag-drop into Raycast's own UI (separate command if ever requested)
- Delete-on-removal from editor (only really makes sense inside the editor — VS Code extension has this; can't reasonably replicate in Raycast)
- Per-language smart syntax formatting (replaced by a single output-format preference in Raycast)
- Bulk upload from clipboard (clipboard can only hold one image)
- Account switching / multi-account (file an issue if you want this)
