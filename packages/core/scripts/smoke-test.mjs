#!/usr/bin/env node
// Smoke tests for the pure-function exports of @mcdays/cloudflare-images-core.
//
// Run with: `npm run test:smoke --workspace=@mcdays/cloudflare-images-core`
//
// This is intentionally NOT a full test framework — it's a single Node script
// that imports the built `dist/` output and exercises each pure function with
// known inputs + expected outputs. The deliberate constraint is "no external
// dependencies, no mocks, no Raycast/CF/network access" — the goal is fast,
// deterministic validation of the math/string/HMAC building blocks. Network,
// Raycast, and clipboard tests live elsewhere (api-smoke-test.mjs for the
// former, manual Raycast testing for the latter).

import { createHash, createHmac } from "node:crypto";
import {
  buildDeliveryUrl,
  buildPublicUrl,
  calculateFileHash,
  extractImageIdFromUrl,
  formatImageUrl,
  generateSignedUrl,
  resolveMetadataTemplate,
} from "../dist/index.js";

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  \u001b[32m\u2713\u001b[0m ${label}`);
    passed++;
  } else {
    console.log(`  \u001b[31m\u2717\u001b[0m ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function group(name, fn) {
  console.log(`\n\u001b[1m${name}\u001b[0m`);
  fn();
}

// ---------- calculateFileHash ----------
group("calculateFileHash", () => {
  const buf = Buffer.from("hello world");
  const expected = createHash("sha256").update(buf).digest("hex");
  const actual = calculateFileHash(buf);
  check("hashes a known buffer to expected SHA-256", actual === expected, `expected ${expected}, got ${actual}`);
  check("output is 64-char hex", /^[0-9a-f]{64}$/.test(actual));

  // Stability: same input → same hash
  check("is deterministic", calculateFileHash(buf) === calculateFileHash(buf));

  // Distinctness: different inputs → different hashes
  const different = calculateFileHash(Buffer.from("hello world!"));
  check("differs on different input", different !== actual);
});

// ---------- extractImageIdFromUrl ----------
group("extractImageIdFromUrl", () => {
  check(
    "public URL with variant",
    extractImageIdFromUrl("https://imagedelivery.net/abc123/img-456/public") === "img-456",
  );
  check(
    "URL with UUID-like image id",
    extractImageIdFromUrl(
      "https://imagedelivery.net/abc123hash/12345678-90ab-cdef-1234-567890abcdef/hero",
    ) === "12345678-90ab-cdef-1234-567890abcdef",
  );
  check(
    "signed URL (with query string)",
    extractImageIdFromUrl(
      "https://imagedelivery.net/abc123/img-456/public?exp=1700000000&sig=deadbeef",
    ) === "img-456",
  );
  check("returns null for unrelated URL", extractImageIdFromUrl("https://example.com/foo") === null);
  check("returns null for empty string", extractImageIdFromUrl("") === null);
  check(
    "returns null for malformed delivery URL",
    extractImageIdFromUrl("imagedelivery.net/only-hash") === null,
  );
});

// ---------- formatImageUrl ----------
group("formatImageUrl", () => {
  const url = "https://imagedelivery.net/hash/img/public";
  check(
    "markdown format",
    formatImageUrl(url, "screenshot.png", "markdown") === `![screenshot.png](${url})`,
  );
  check(
    "html format escapes attribute quotes",
    formatImageUrl(url, 'tricky"name.png', "html") ===
      `<img src="${url}" alt="tricky&quot;name.png" />`,
  );
  check(
    "raw format returns bare URL",
    formatImageUrl(url, "screenshot.png", "raw") === url,
  );
  check(
    "markdown escapes square brackets in alt text",
    formatImageUrl(url, "name [with brackets].png", "markdown") ===
      `![name [with brackets\\].png](${url})`,
  );
  check(
    "html escapes <, >, & in alt text",
    formatImageUrl(url, "a<b&c>d.png", "html") ===
      `<img src="${url}" alt="a&lt;b&amp;c&gt;d.png" />`,
  );
});

// ---------- buildPublicUrl ----------
group("buildPublicUrl", () => {
  const expected = "https://imagedelivery.net/myhash/myimage/public";
  const got = buildPublicUrl("myimage", "/public", "myhash");
  check("constructs the canonical delivery URL", got === expected, `got ${got}`);

  check(
    "accepts a non-/public variant",
    buildPublicUrl("img-456", "/hero", "hash123") ===
      "https://imagedelivery.net/hash123/img-456/hero",
  );
});

// ---------- generateSignedUrl ----------
group("generateSignedUrl", () => {
  const config = {
    accountId: "acc",
    apiToken: "token",
    accountHash: "myhash",
    defaultVariant: "/public",
    useSignedUrls: true,
    signingKey: "secret-signing-key",
    signedUrlExpiration: 0, // no expiry
  };

  const signed = generateSignedUrl("myimage", "/public", config);
  check("signed URL starts with imagedelivery.net + hash + image + variant", signed.startsWith("https://imagedelivery.net/myhash/myimage/public"));
  check("signed URL contains a 64-char hex sig query parameter", /[?&]sig=[0-9a-f]{64}/.test(signed));
  check("signed URL has no exp= when expiration is 0", !/[?&]exp=/.test(signed));

  // Independently compute the expected signature and verify it matches
  const expectedSig = createHmac("sha256", "secret-signing-key")
    .update("/myhash/myimage/public")
    .digest("hex");
  const sigFromUrl = new URL(signed).searchParams.get("sig");
  check("signature matches independent HMAC-SHA256 over path", sigFromUrl === expectedSig);

  // With expiration
  const withExpiry = generateSignedUrl("myimage", "/hero", {
    ...config,
    signedUrlExpiration: 3600,
  });
  check("signed URL with expiry has exp=", /[?&]exp=\d+/.test(withExpiry));
  check("signed URL with expiry has sig=", /[?&]sig=[0-9a-f]{64}/.test(withExpiry));
  const expQuery = new URL(withExpiry).searchParams.get("exp");
  const expN = Number(expQuery);
  const now = Math.floor(Date.now() / 1000);
  check(
    "exp= is within 5 seconds of now+3600",
    Number.isFinite(expN) && Math.abs(expN - (now + 3600)) <= 5,
    `exp=${expQuery}, now=${now}`,
  );
});

// ---------- buildDeliveryUrl ----------
group("buildDeliveryUrl", () => {
  const baseConfig = {
    accountId: "acc",
    apiToken: "token",
    accountHash: "myhash",
    defaultVariant: "/public",
    useSignedUrls: false,
    signingKey: "",
    signedUrlExpiration: 0,
  };

  const unsigned = buildDeliveryUrl("myimage", "/public", baseConfig);
  check(
    "useSignedUrls=false → public URL with no signature",
    unsigned === "https://imagedelivery.net/myhash/myimage/public",
  );

  const signed = buildDeliveryUrl("myimage", "/public", {
    ...baseConfig,
    useSignedUrls: true,
    signingKey: "secret",
  });
  check(
    "useSignedUrls=true → signed URL with sig param",
    /[?&]sig=[0-9a-f]{64}/.test(signed),
  );
});

// ---------- resolveMetadataTemplate ----------
group("resolveMetadataTemplate", () => {
  const template = {
    uploadedBy: "raycast-cloudflare-images",
    version: "${surfaceVersion}",
    uploadedAt: "${timestamp}",
    fileName: "${fileName}",
    sizeBytes: "${fileSize}",
    ext: "${fileExtension}",
  };

  const resolved = resolveMetadataTemplate(template, {
    fileName: "screenshot.png",
    filePath: "/tmp/screenshot.png",
    fileSize: 12345,
    surfaceVersion: "raycast-0.2.3",
    workspaceName: "blog",
  });

  check("literal value passes through", resolved.uploadedBy === "raycast-cloudflare-images");
  check("${surfaceVersion} substituted", resolved.version === "raycast-0.2.3");
  check("${fileName} substituted", resolved.fileName === "screenshot.png");
  check("${fileSize} substituted as string", resolved.sizeBytes === "12345");
  check("${fileExtension} substituted", resolved.ext === ".png");
  check(
    "${timestamp} substituted to ISO format",
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(resolved.uploadedAt),
  );

  // Backward compatibility: ${extensionVersion} should still resolve.
  const legacy = resolveMetadataTemplate(
    { v: "${extensionVersion}" },
    {
      fileName: "x.png",
      filePath: "/x.png",
      fileSize: 0,
      surfaceVersion: "raycast-9.9.9",
    },
  );
  check("legacy ${extensionVersion} still resolves", legacy.v === "raycast-9.9.9");

  // Missing context falls back gracefully
  const missingContext = resolveMetadataTemplate(
    { x: "${surfaceVersion}", y: "${workspaceName}" },
    { fileName: "x.png", filePath: "/x.png", fileSize: 0 },
  );
  check("missing surfaceVersion → 'unknown'", missingContext.x === "unknown");
  check("missing workspaceName → 'unknown'", missingContext.y === "unknown");
});

// ---------- Summary ----------
console.log(
  `\n\u001b[1m${passed + failed} checks\u001b[0m: ${passed} passed, ${failed} failed`,
);
if (failed > 0) {
  console.log("\n\u001b[31mFailures:\u001b[0m");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("\u001b[32mAll smoke tests passed.\u001b[0m");
