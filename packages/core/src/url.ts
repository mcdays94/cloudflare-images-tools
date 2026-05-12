import type { OutputFormat } from "./types.js";

/**
 * Renders a Cloudflare Images URL in one of three output formats.
 *
 * Why three formats and not VS Code's per-language matrix? Outside an editor,
 * the surface (Raycast hotkey, MCP tool call) has no idea what the user is
 * about to paste into. Letting the user pick the format up front via a single
 * preference is simpler and covers > 95% of real use.
 *
 * - `markdown` → `![fileName](url)`
 * - `html`     → `<img src="url" alt="fileName" />`
 * - `raw`      → `url` (the user pastes a bare URL and wraps it themselves)
 */
export function formatImageUrl(
  imageUrl: string,
  fileName: string,
  format: OutputFormat,
): string {
  switch (format) {
    case "markdown":
      return `![${escapeMarkdown(fileName)}](${imageUrl})`;
    case "html":
      return `<img src="${imageUrl}" alt="${escapeHtml(fileName)}" />`;
    case "raw":
      return imageUrl;
  }
}

function escapeMarkdown(text: string): string {
  // Only escape the alt-text breakers; `]` and `\` are enough to keep the
  // syntax legal for almost every realistic filename.
  return text.replace(/\\/g, "\\\\").replace(/]/g, "\\]");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
