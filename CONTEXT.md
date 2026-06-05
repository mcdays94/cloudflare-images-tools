# CONTEXT, Cloudflare Images Tools

Domain glossary for the `@mcdays/cloudflare-images` family of tools (npm
core package, Raycast extension, future MCP server). Read this before
grilling or proposing features so terminology stays consistent across
surfaces and reviewers.

## Terms

### Image
A binary asset (PNG / JPEG / GIF / WebP / SVG) stored in Cloudflare
Images, addressed by a Cloudflare-assigned UUID-shaped `imageId`. Always
served via the CDN host
`imagedelivery.net/{accountHash}/{imageId}/{variant}`.

### Variant
A named transformation profile defined on the Cloudflare account (e.g.
`/public`, `/thumbnail`, `/hero`). Every delivery URL is parameterised by
exactly one Variant. Variants are account-scoped, user-defined, and listed
via `GET /accounts/{id}/images/v1/variants`. Stored Variant values carry a
leading `/` (e.g. `/hero`) to match the URL grammar, `resolveVariant()`
normalises bare names like `hero` to `/hero` on the way out.

### Default Variant
The Variant used for any upload or browse operation that doesn't
explicitly override it. **Resolution order (highest → lowest priority):**

1. Per-invocation Override (`opts.variant`, future feature)
2. Stored value, set via the `Set Default Variant` command (Raycast
   surface stores this in LocalStorage)
3. Preference value (Raycast surface: `defaultVariant` textfield)
4. Hardcoded fallback `/public`

Implemented in `packages/core/src/resolve.ts::resolveVariant`.

### Public URL
An unsigned, world-readable delivery URL. Built by `buildPublicUrl()`.
Pattern: `https://imagedelivery.net/{accountHash}/{imageId}/{variant}`.
Works for Images uploaded with `requireSignedURLs: false`.

### Signed URL
An HMAC-SHA256-signed delivery URL with `sig=` and optional `exp=` (Unix
epoch) query parameters. Built by `generateSignedUrl()`. Required for
Images uploaded with `requireSignedURLs: true`. The Signing Key is fetched
once from the CF API and cached in LocalStorage; users can supply a
manual override via the `manualSigningKey` preference.

### Signing Key
The HMAC secret used to produce Signed URLs. Account-scoped. Fetched by
`fetchSigningKey()`; cached per-account in the surface's persistent
storage (LocalStorage on Raycast). Distinct from the **API Token**
(`apiToken` preference), which authenticates CF API calls.

### Effective Signed Mode
Whether a given upload produces a Signed URL or a Public URL.
**Resolution order:**

1. Per-invocation Override (`opts.signed`, set by commands like
   `Upload Clipboard as Signed Image` / `Upload Clipboard as Image`)
2. The surface's `useSignedUrls` preference (default `false`)

Implemented in `packages/core/src/resolve.ts::resolveSignedMode`.

### Override (per-invocation)
A value passed into the upload pipeline that wins over the resolved
preference for that single invocation. Three Overrides exist or are
planned, all flowing through a single `opts: UploadOverrides` argument
on the surface's `runUploadClipboard` / `runUploadFinder`:

| Field | Status | Source command(s) |
|---|---|---|
| `format` | shipped | `Upload Clipboard Image` (dropdown), `Upload Clipboard as Markdown` / `as HTML` / `as URL` |
| `signed` | shipped | `Upload Clipboard as Signed Image`, `Upload Clipboard as Image` (Finder twins exist) |
| `variant` | planned | (TBD, likely a form-view command; see grilling notes) |

`UploadOverrides` also carries one **behaviour flag** (not an Override):

| Field | Effect |
|---|---|
| `copyRawOnly` | When `true`, the post-upload step copies the raw delivery URL to the clipboard and skips both the format-wrapping step and the cursor-paste step. Set by `Upload Clipboard as Image` / `as Signed Image` (and Finder twins). |

### Combo-locked commands
Some commands lock two axes at once for a single-hotkey workflow. These
exist because Raycast manifest dropdowns can't be bound to specific
values via global hotkeys, the hotkey opens the launcher with the
dropdown visible, requiring an extra keystroke. Combo-locked commands
sidestep that by baking both axes in at the manifest level:

| Command | Axes locked |
|---|---|
| `Upload Clipboard as Signed Markdown` | signed + Markdown |
| `Upload Clipboard as Signed HTML`     | signed + HTML |
| `Upload Clipboard as Signed URL`      | signed + raw URL (pastes at cursor) |
| Finder twins (same three)             | signed + format (copy only) |

Public-side combos (`as Public Markdown` etc.) intentionally don't
exist, the extension default is `useSignedUrls=false`, so the existing
format-locked commands already produce public URLs. If a user defaults
to signed and wants public combos, they can use the **Raycast Quicklinks
escape valve** (below).

### Raycast Quicklinks escape valve
For any Override combination not covered by a dedicated command, users
can build a custom hotkey-bindable launcher via a Raycast Quicklink:

```
raycast://extensions/miguel_caetano_dias/cloudflare-images/upload-clipboard?arguments={"format":"markdown","signed":"public"}
```

Steps:
1. Open Raycast → `Create Quicklink`
2. Paste the deeplink above (adjust `format` and `signed` values)
3. Name it (e.g. "Upload Public Markdown")
4. Assign a hotkey via Raycast Settings → Quicklinks

Result: pressing that hotkey runs `upload-clipboard` with the specified
arguments pre-filled, zero further keystrokes. This unlocks arbitrary
Override combinations (public combos, variant overrides, etc.) without
us shipping a dedicated command for each.

### Surface
A user-facing client of `@mcdays/cloudflare-images-core`. Today: the
Raycast extension. Planned: an MCP server, possibly a CLI. Every Surface
gathers its own preferences/storage and feeds them into the same pure
core functions.

## Avoid

- "Unsigned URL", say **Public URL**, matching CF docs and
  `buildPublicUrl()` in the core package.
- "Transformation" or "Preset", say **Variant**.
- "Token" for the Signing Key, say **Signing Key**. "API Token" is
  reserved for the CF API authentication token (`apiToken` preference).
- "Clear Cache" without qualifier, say **Image Dedupe Cache** (the
  upload-side cache keyed by file hash) or **Signing Key Cache** (the
  per-account HMAC secret cache). They are independent.

## Example dialogue

> "Can we make the signed-locked command pick a different variant per upload?"

Better:

> "Can the `Upload Clipboard as Signed Image` command accept a
> per-invocation **Variant** Override, in addition to its locked
> **Effective Signed Mode**?"
