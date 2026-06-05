// Pure resolution helpers for per-invocation upload overrides.
//
// Each surface (Raycast extension, future MCP server, future CLI) gathers
// its own preferences and stored state, then asks these helpers which value
// wins for a given upload. Keeping the resolution rules here means the
// terminology stays consistent across surfaces.
//
// See repo-level CONTEXT.md for the domain glossary (Default Variant,
// Effective Signed Mode, Override).

import type { OutputFormat } from "./types.js";

/**
 * Per-invocation Overrides and behaviour flags that callers pass into the
 * upload pipeline. Each field is independent: any subset may be provided.
 *
 * **Overrides** (win over the surface's preferences):
 *   - `format`  - Output format Override (Markdown / HTML / raw URL)
 *   - `signed`  - Signed-mode Override (`useSignedUrls` preference)
 *   - `variant` - Variant Override (stored value / `defaultVariant` pref)
 *
 * `null` / `undefined` for an Override field means "no Override; resolve
 * from the preference".
 *
 * **Behaviour flags** (decide what happens after the upload succeeds):
 *   - `copyRawOnly` - when `true`, skip the format-wrapping step and the
 *     cursor-paste step; just `Clipboard.copy()` the raw delivery URL.
 *     Used by the `Upload Clipboard as Image` / `Upload Clipboard as
 *     Signed Image` family of commands (and Finder twins). The user then
 *     pastes wherever they want with native ⌘V.
 *
 * See `CONTEXT.md > Override` for the canonical list.
 */
export type UploadOverrides = {
  /** Output format Override (Markdown / HTML / raw URL). */
  format?: OutputFormat | null;
  /** Signed-mode Override; wins over `useSignedUrls` preference. */
  signed?: boolean | null;
  /** Variant Override; wins over stored value and `defaultVariant` preference. */
  variant?: string | null;
  /**
   * When `true`, the post-upload step skips format-wrapping and skips the
   * cursor-paste; the raw delivery URL is copied to the clipboard so the
   * user can paste it with native ⌘V wherever they want.
   *
   * Default: `false` (i.e. the surface's normal behaviour, which is
   * "format-wrap + paste" for clipboard, and "format-wrap + copy" for
   * Finder).
   */
  copyRawOnly?: boolean;
};

/**
 * Decide whether a given upload produces a Signed URL or a Public URL.
 *
 * Resolution order (highest → lowest priority):
 *   1. Per-invocation override (`override`), if not `null` / `undefined`
 *   2. The surface's `useSignedUrls` preference
 *
 * @param preference  The user's `useSignedUrls` preference (boolean).
 * @param override    Optional per-invocation override. `null` / `undefined`
 *                    means "no override; use the preference". `true` / `false`
 *                    wins over the preference for this single invocation.
 */
export function resolveSignedMode(
  preference: boolean,
  override: boolean | null | undefined,
): boolean {
  return override === null || override === undefined ? preference : override;
}

/**
 * Decide which Variant a given upload or browse operation uses.
 *
 * Resolution order (highest → lowest priority):
 *   1. Per-invocation override (`override`), if non-empty after trimming
 *   2. The surface's persistent stored value (`stored`), if non-empty.
 *      For the Raycast extension this is what the `Set Default Variant`
 *      command writes to LocalStorage.
 *   3. The surface's preference value (`preference`), if non-empty.
 *      For the Raycast extension this is the `defaultVariant` textfield.
 *   4. Hardcoded fallback `/public`.
 *
 * Stored / preference / override values may be passed with or without a
 * leading `/`. The returned value always has one, see
 * `CONTEXT.md > Variant` for why the leading-slash convention exists.
 */
export function resolveVariant(inputs: {
  override?: string | null;
  stored?: string | null;
  preference?: string | null;
}): string {
  const pick = (value: string | null | undefined): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };
  const ensureSlash = (v: string): string => (v.startsWith("/") ? v : `/${v}`);

  const chosen =
    pick(inputs.override) ?? pick(inputs.stored) ?? pick(inputs.preference);
  return chosen ? ensureSlash(chosen) : "/public";
}
