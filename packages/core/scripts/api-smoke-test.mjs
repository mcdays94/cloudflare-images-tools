#!/usr/bin/env node
// Live API smoke test against a real Cloudflare Images account.
//
// Run with: `npm run test:api --workspace=@mcdays/cloudflare-images-core`
//
// Requires .env.local at the repo root with:
//   CF_ACCOUNT_ID=...
//   CF_API_TOKEN=... (must have 'Cloudflare Images: Edit' permission)
//   CF_ACCOUNT_HASH=...
//
// What it does:
//   1. validateCredentials — confirms auth + account access
//   2. listVariants — confirms response shape matches our core type
//   3. listImages (page 1) — confirms response shape matches our core type
//   4. Upload a 1×1 transparent PNG with tagged metadata
//   5. Fetch the resulting delivery URL — confirms the CDN serves it AND that
//      the URL we constructed (account hash + image ID + /public variant) is
//      what Cloudflare actually expects
//   6. Delete the uploaded image to clean up
//
// What it does NOT do:
//   - Touch any of your existing images (only the test image we just uploaded
//     is deleted)
//   - Test signed URLs (would require an account with signing keys configured;
//     covered by smoke-test.mjs for the math, but not exercised against live)
//   - Test compression / AVIF conversion (would require sharp + larger test
//     fixtures; covered by manual Raycast testing)
//
// Failure modes are surfaced loudly with the exact HTTP status and response
// body Cloudflare returned, so you can debug auth / permission / endpoint
// issues fast.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildPublicUrl,
  deleteImage,
  listImages,
  listVariants,
  validateCredentials,
} from "../dist/index.js";

// -------------------- env loading --------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const ENV_FILE = resolve(REPO_ROOT, ".env.local");

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(ENV_FILE);

const accountId = process.env.CF_ACCOUNT_ID?.trim();
const apiToken = process.env.CF_API_TOKEN?.trim();
const accountHash = process.env.CF_ACCOUNT_HASH?.trim();

if (!accountId || !apiToken || !accountHash) {
  console.error(`\u001b[31mMissing credentials.\u001b[0m

Expected env vars: CF_ACCOUNT_ID, CF_API_TOKEN, CF_ACCOUNT_HASH.

Easiest way to provide them: copy .env.local.example at the repo root to
.env.local and fill in the three values. .env.local is gitignored.

  cp .env.local.example .env.local
  $EDITOR .env.local

Then re-run:
  npm run test:api --workspace=@mcdays/cloudflare-images-core
`);
  process.exit(1);
}

// -------------------- runner --------------------

let stepCount = 0;
let failCount = 0;
const failures = [];

function step(label) {
  stepCount++;
  process.stdout.write(`\n\u001b[1m${stepCount}. ${label}\u001b[0m\n`);
}

function pass(detail) {
  console.log(`   \u001b[32m✓\u001b[0m ${detail}`);
}

function fail(detail, err) {
  console.log(`   \u001b[31m✗\u001b[0m ${detail}`);
  if (err) {
    const msg = err instanceof Error ? err.message : String(err);
    for (const line of msg.split("\n")) console.log(`     ${line}`);
  }
  failCount++;
  failures.push(detail);
}

// -------------------- 1x1 transparent PNG fixture --------------------

const TRANSPARENT_1X1_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

// -------------------- the tests --------------------

const tag = `cf-images-tools-api-smoke-test-${Date.now()}`;

step("validateCredentials — confirms auth + account access");
let result = await validateCredentials({ accountId, apiToken, accountHash });
if (result.ok) {
  pass(
    `Cloudflare accepted the token. ${
      result.imageCount !== null
        ? `Account has ${result.imageCount} image${result.imageCount === 1 ? "" : "s"}.`
        : "(No image count in response.)"
    }`,
  );
} else {
  fail(`validateCredentials returned: ${result.reason}`, new Error(result.detail));
  // Bail — without working auth no further test can succeed.
  printSummary();
  process.exit(failCount > 0 ? 1 : 0);
}

step("listVariants — confirms response shape matches our core type");
try {
  const variants = await listVariants({ accountId, apiToken });
  pass(`Got ${variants.length} variant${variants.length === 1 ? "" : "s"}`);
  if (variants.length > 0) {
    const v = variants[0];
    pass(
      `First variant id="${v.id}", options=${JSON.stringify(v.options)}, neverRequireSignedURLs=${v.neverRequireSignedURLs}`,
    );
    if (typeof v.id !== "string") {
      fail("variant.id is not a string");
    }
    if (typeof v.options !== "object" || v.options === null) {
      fail("variant.options is not an object");
    }
  } else {
    pass(
      "(no variants returned — unusual but legal; CF default account starts with /public)",
    );
  }
} catch (err) {
  fail("listVariants threw", err);
}

step("listImages — confirms v2 list shape matches our core type");
try {
  const page = await listImages({
    config: { accountId, apiToken },
    perPage: 5,
  });
  pass(`Got ${page.images.length} image${page.images.length === 1 ? "" : "s"} in first page`);
  pass(`continuationToken=${page.continuationToken === null ? "null" : `"${page.continuationToken}"`}`);
  if (page.images.length > 0) {
    const i = page.images[0];
    const missing = [];
    if (typeof i.id !== "string") missing.push("id");
    if (typeof i.filename !== "string") missing.push("filename");
    if (typeof i.uploaded !== "string") missing.push("uploaded");
    if (typeof i.requireSignedURLs !== "boolean") missing.push("requireSignedURLs");
    if (!Array.isArray(i.variants)) missing.push("variants");
    if (missing.length > 0) {
      fail(
        `image object is missing or wrongly-typed fields: ${missing.join(", ")}. Full object: ${JSON.stringify(i)}`,
      );
    } else {
      pass(`First image id="${i.id}" filename="${i.filename}" uploaded="${i.uploaded}" variants.length=${i.variants.length}`);
    }
  } else {
    pass("(account empty — that's fine for a fresh account)");
  }
} catch (err) {
  fail("listImages threw", err);
}

// ---------- Upload → fetch URL → delete cycle ----------

step("Upload a 1×1 transparent PNG with a unique metadata tag");
let uploadedImageId = null;
try {
  const form = new FormData();
  form.append(
    "file",
    new Blob([TRANSPARENT_1X1_PNG], { type: "image/png" }),
    "cf-images-tools-smoke-test.png",
  );
  form.append("requireSignedURLs", "false");
  form.append(
    "metadata",
    JSON.stringify({
      uploadedBy: tag,
      purpose: "api-smoke-test",
      uploadedAt: new Date().toISOString(),
    }),
  );

  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
      body: form,
    },
  );

  if (!resp.ok) {
    const body = await resp.text();
    fail(
      `Upload failed: HTTP ${resp.status} ${resp.statusText}`,
      new Error(body),
    );
  } else {
    const data = await resp.json();
    uploadedImageId = data.result?.id;
    if (!uploadedImageId) {
      fail(`Upload succeeded but no image ID in response: ${JSON.stringify(data)}`);
    } else {
      pass(`Uploaded image. id="${uploadedImageId}"`);
    }
  }
} catch (err) {
  fail("Upload threw", err);
}

if (uploadedImageId) {
  step("Fetch the delivery URL — confirms CDN serves what we just uploaded");
  const deliveryUrl = buildPublicUrl(uploadedImageId, "/public", accountHash);
  pass(`Constructed URL: ${deliveryUrl}`);
  try {
    // CDN may take a beat to propagate; one retry with a short delay.
    let resp = await fetch(deliveryUrl);
    if (!resp.ok && resp.status === 404) {
      await new Promise((r) => setTimeout(r, 1000));
      resp = await fetch(deliveryUrl);
    }
    if (!resp.ok) {
      const body = await resp.text();
      fail(`Delivery URL returned HTTP ${resp.status}`, new Error(body.slice(0, 500)));
    } else {
      const contentType = resp.headers.get("content-type");
      if (!contentType || !contentType.startsWith("image/")) {
        fail(`Delivery URL OK but content-type is "${contentType}" (expected image/*)`);
      } else {
        const buf = Buffer.from(await resp.arrayBuffer());
        pass(`CDN served ${buf.length} bytes, content-type=${contentType}`);
      }
    }
  } catch (err) {
    fail("Fetching delivery URL threw", err);
  }

  step("Delete the uploaded image — cleanup");
  try {
    const ok = await deleteImage(uploadedImageId, { accountId, apiToken });
    if (ok) {
      pass(`Deleted image id="${uploadedImageId}"`);
    } else {
      fail("deleteImage returned false");
    }
  } catch (err) {
    fail("Delete threw", err);
  }
}

printSummary();
process.exit(failCount > 0 ? 1 : 0);

function printSummary() {
  console.log(
    `\n\u001b[1m${stepCount} steps\u001b[0m: ${stepCount - failCount} ok, ${failCount} failed`,
  );
  if (failCount > 0) {
    console.log("\n\u001b[31mFailures:\u001b[0m");
    for (const f of failures) console.log(`  - ${f}`);
  } else {
    console.log("\u001b[32mAll API smoke checks passed.\u001b[0m");
  }
}
