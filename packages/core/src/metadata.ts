import * as path from "node:path";
import type { MetadataContext } from "./types.js";

/**
 * Resolves a metadata template by substituting `${...}` variables with values
 * drawn from the supplied context plus the current time.
 *
 * Supported variables:
 *  - `${fileName}`         — original file name (e.g. `screenshot.png`)
 *  - `${timestamp}`        — ISO 8601 upload time (e.g. `2026-05-12T13:45:00.000Z`)
 *  - `${date}`             — date only (`YYYY-MM-DD`)
 *  - `${time}`             — time only (`HH:MM:SS`)
 *  - `${surfaceVersion}`   — version of the calling surface, e.g. `raycast-0.1.0`
 *  - `${fileSize}`         — file size in bytes
 *  - `${fileExtension}`    — file extension including the dot
 *  - `${workspaceName}`    — name of the workspace, or `unknown` if not provided
 *
 * Note: the VS Code extension's variable list included `${extensionVersion}` —
 * that's been renamed to `${surfaceVersion}` so it makes sense across multiple
 * surfaces (Raycast, MCP, etc.). Callers using the old name in stored templates
 * may want to migrate; for now both names map to the same value at runtime.
 *
 * Ported from the VS Code extension (with the rename above).
 */
export function resolveMetadataTemplate(
  template: Record<string, string>,
  context: MetadataContext,
): Record<string, string> {
  const now = new Date();
  const variables: Record<string, string> = {
    "${fileName}": context.fileName,
    "${timestamp}": now.toISOString(),
    "${date}": now.toISOString().split("T")[0] ?? "",
    "${time}": now.toTimeString().split(" ")[0] ?? "",
    "${surfaceVersion}": context.surfaceVersion ?? "unknown",
    "${extensionVersion}": context.surfaceVersion ?? "unknown",
    "${fileSize}": String(context.fileSize),
    "${fileExtension}": path.extname(context.fileName),
    "${workspaceName}": context.workspaceName ?? "unknown",
  };

  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(template)) {
    let resolvedValue = String(value);
    for (const [varName, varValue] of Object.entries(variables)) {
      resolvedValue = resolvedValue.split(varName).join(varValue);
    }
    resolved[key] = resolvedValue;
  }
  return resolved;
}
