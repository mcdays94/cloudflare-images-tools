# Handoff — end of evening session

This is the state of the world when you wake up. It supersedes the
chat transcript for catching up; everything below is reflected in
actual commits + tracked files.

## TL;DR — what I shipped solo while you slept

1. **v0.4 — VS Code parity gap closed.** Three new preferences:
   - `addMetadata` (checkbox, default on)
   - `metadataTemplate` (JSON textfield) with the friendly default text
     you asked for: `{"uploadedBy":"Raycast Extension: Cloudflare Images",...}`
     and full support for the eight `${...}` placeholders.
   - `manualSigningKey` (password) — overrides the LocalStorage cache
     and API auto-fetch entirely when set.
   - Behaviour: existing defaults preserved, no breakage.
   - Commit `1623e85`.

2. **README, ROADMAP, CHANGELOG fully refreshed** to reflect everything
   we shipped today (12 commits across the day). README now has the
   complete command roster, preferences table, and feature-parity
   matrix vs the VS Code extension.

3. **GitHub Actions CI scaffold** at `.github/workflows/ci.yml`.
   Inactive until you `gh repo create` and push. When it activates:
   typecheck + smoke tests + ray build on every PR. Matrix-tests
   Node 22 + 24.

## About your Raycast snippets question

You asked if metadata templates could use **Raycast's snippets language**
for dynamic fields. Short answer: **the snippet engine isn't exposed to
extensions** — `@raycast/api` provides no function to evaluate
`{date}` / `{clipboard}` / `{uuid}` placeholders programmatically.

What I did instead: kept our **`${...}` syntax** (already implemented
in `core/metadata.ts`, identical to the VS Code extension's), and made
the placeholder list prominent in the `metadataTemplate` preference's
description. Same capability, different sigil.

The eight placeholders available:

| Placeholder | Example |
|---|---|
| `${fileName}` | `screenshot.png` |
| `${timestamp}` | `2026-05-12T20:15:42.123Z` |
| `${date}` | `2026-05-12` |
| `${time}` | `20:15:42` |
| `${fileSize}` | `54321` (bytes) |
| `${fileExtension}` | `.png` |
| `${surfaceVersion}` | `raycast-0.4.0` |
| `${workspaceName}` | (not currently populated by Raycast surface) |

If you really want Raycast snippet syntax for parity with how snippets
*feel*, I can mimic a subset of it later (`{date}`, `{time}`, `{uuid}`)
by parsing them ourselves before passing to core's
`resolveMetadataTemplate`. Costs ~15 lines. Decision can wait.

## What's safe to test in the morning

Dev server is still running (PID 73771 unless your Mac restarted) —
the extension hot-reloaded all the v0.4 changes. Re-launch it if needed:

```bash
cd ~/Documents/Projects/cloudflare-images-tools/packages/raycast
npm run dev
```

Manual tests to confirm parity:

1. **Open Raycast preferences** (`⌘ ,`). You should see three new prefs
   at the bottom of the Cloudflare Images section:
   - "Manual Signing Key (optional)" — password field, leave blank
     unless you want to test the override path.
   - "Attach Metadata to Uploads" — checkbox, default on.
   - "Metadata Template (JSON)" — textfield with the friendly default.

2. **Upload a fresh screenshot** via Upload Clipboard Image. Then open
   `My Cloudflare Images`, find the newest image, toggle the detail
   panel with `⌘ D`. The metadata pane should now show the four
   default fields:
   - `uploadedBy: Raycast Extension: Cloudflare Images`
   - `uploadedAt: 2026-05-13T...` (ISO timestamp resolved at upload time)
   - `fileName: clipboard-...png`
   - `extensionVersion: raycast-0.4.0`

3. **Edit the metadata template** in preferences. Add a key like
   `"team": "blog"` or `"project": "${workspaceName}"`. Re-upload.
   Inspect again — your custom field should be in the metadata.

4. **Edge case test**: deliberately break the JSON (e.g. add a stray
   comma). Re-upload. A Toast.Style.Failure should appear saying
   "Metadata template JSON invalid — using default", and the upload
   should still succeed with the default template.

5. **Optional**: turn off "Attach Metadata to Uploads", upload again,
   inspect — metadata pane should be empty.

## What I deliberately didn't do

Per your standing rules in `~/.config/opencode/AGENTS.md`:

- **No `git push`.** All work is local commits. `gh repo create` is your call.
- **No `ray publish` / Raycast Store submission.** That's a deploy.
- **No `npm publish` of `@mcdays94/cloudflare-images-core`.** Same reason.
- **No icon redesign.** You have the PSD; design choice is yours.
- **No README hero GIF recording.** Needs you driving Raycast interactively.
- **No real-account testing of the v0.4 metadata changes.** I could have
  re-run the API smoke test with your credentials but you're asleep and
  the safer move is to let you verify in the morning.

## Open decisions waiting for you

1. **Icon.** The current `packages/raycast/assets/icon.png` is a 512×512
   downsample of the VS Code extension's PSD. Works but generic. If
   you want a Raycast-native iconography style (think rounded corners,
   SF-Symbols-ish), say so and I can sketch options.

2. **Where to next?** Three credible directions:

   - **v0.5 polish** — icon, hero GIF, "Configure Metadata Template"
     Form command (friendlier than JSON editing), pagination in My
     Cloudflare Images, Store submission prep.

   - **v1.0 MCP server** — `packages/mcp`, npm-distributable, plus a
     Zed extension wrapper. Bigger lift but unlocks the original
     "make this work in Zed" ask we started with.

   - **Push to GitHub** — `cloudflare-images-tools` doesn't have a
     remote yet. Once pushed, the CI scaffold lights up immediately.
     My recommendation: do this BEFORE either v0.5 polish or v1.0
     MCP so all subsequent commits are remotely backed up.

3. **The old `cf-images` Raycast dev entry.** You removed it earlier;
   verify in `Raycast → Manage Extensions` that only "Cloudflare
   Images" is listed. If not, we missed a step.

## State of the world

```
Commits since session start:
  1623e85 feat(raycast): v0.4 — close VS Code parity gap (metadata, manual signing key)
  ecd3fc3 feat(raycast): v0.3.1 — format-locked variants of upload commands
  f556d17 feat(raycast): v0.3 — Upload Selected File handles multi-select
  53ddbf9 fix(core): let callers override the filename sent to Cloudflare for file uploads
  be92ad9 test(core): add api-smoke-test.mjs for live Cloudflare API validation
  5cfefa0 test(core): add smoke-test.mjs covering all pure functions
  373b2d1 feat: v0.2.2/v0.2.3/v0.4 — cache fix, my-images search/detail, format arguments
  c6f4eb0 feat: v0.2.1 — variant dropdown via 'Set Default Variant' command
  332f1a0 refactor: rename CF Images → Cloudflare Images across the monorepo
  1b273a7 feat(raycast): v0.2 — Upload Clipboard Image, working end-to-end
  f7c1927 docs: explain Raycast preference persistence and the rename footgun
  a6200e9 chore: initial scaffold for cloudflare-images-tools monorepo

Tests:
  npm test                                            → 35/35 ✓
  npm run test:smoke --workspace=@mcdays94/...        → 35/35 ✓
  npm run test:api --workspace=@mcdays94/...          → 6/6 ✓ (earlier today)
  npm run typecheck --workspace=cloudflare-images     → ✓
  npx ray build (11 entry points)                     → ✓

Storage:
  Account ID, Account Hash, Default Variant, etc.    → Raycast SQLite (encrypted)
  API Token, Manual Signing Key                      → macOS Keychain
  Dedupe cache (30-day TTL)                          → Raycast LocalStorage
  Stored default variant                             → Raycast LocalStorage
  Cached signing key (per-account)                   → Raycast LocalStorage

Credentials still in chat:
  Yes — your API token was pasted as an image earlier. Rotate it at
  https://dash.cloudflare.com/profile/api-tokens before pushing this
  repo to GitHub. The .env.local you created is gitignored, but the
  chat transcript persists.
```

Sleep well. Pick any direction in the morning and I'll continue.
