// scripts/build-all.mjs — one command regenerates every shipped artifact.
//
// Order: core → runtime → all three exported story HTMLs → editor → site → docs.
// Nobody should ever again ship a file older than the fix it needs.
//
// Usage: node scripts/build-all.mjs
//   npm run build:all

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildThemeBlocks } from "./theme-builder.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function run(cmd, cwd = root) {
  console.log(`\n  → ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

// ── 1. Core ─────────────────────────────────────────────────────────────────
console.log("══ Step 1/6: core");
run("npm run build -w @aqlamna/core");

// ── 2. Runtime ──────────────────────────────────────────────────────────────
console.log("══ Step 2/6: runtime");
run("npm run build -w @aqlamna/runtime");

// ── 3. Export story HTMLs ───────────────────────────────────────────────────
console.log("══ Step 3/6: export story HTMLs");

const cliPath = join(root, "packages", "runtime", "scripts", "cli.mjs");

// 3a. العطر_المفقود → stories/ and site/
const qalamSource = join(root, "stories", "العطر_المفقود.qalam");
if (!existsSync(qalamSource)) {
  console.error("Missing story source: " + qalamSource);
  process.exit(1);
}
run(`node "${cliPath}" "${qalamSource}" -o "${join(root, "stories", "العطر_المفقود.html")}"`);
run(`node "${cliPath}" "${qalamSource}" -o "${join(root, "site", "العطر_المفقود.html")}"`);

// 3b. الرحيق — no .qalam source; extract JSON from existing HTML and re-wrap
//     with the freshly-built runtime.
console.log("\n  → rebuild الرحيق.html (extract JSON + fresh runtime)");
rebuildNectar();

// ── 4. Editor ───────────────────────────────────────────────────────────────
console.log("══ Step 4/6: editor");
run("npm run build:site -w @aqlamna/editor");

// ── 5. Site ─────────────────────────────────────────────────────────────────
console.log("══ Step 5/6: site");
run("node scripts/build-site.mjs");

// ── 6. Docs ─────────────────────────────────────────────────────────────────
console.log("══ Step 6/6: docs");
run("node scripts/build-docs.mjs");

// ── Timestamp check ─────────────────────────────────────────────────────────
console.log("\n══ Timestamps:");
const storyFiles = [
  join(root, "stories", "العطر_المفقود.html"),
  join(root, "site", "العطر_المفقود.html"),
  join(root, "packages", "runtime", "examples", "الرحيق.html"),
];
for (const f of storyFiles) {
  const { mtimeMs, size } = statSync(f);
  const rel = f.replace(root, "").replace(/^[\\/]/, "");
  console.log(`  ${rel}  ${size} bytes  ${new Date(mtimeMs).toISOString()}`);
}

// ── rebuildNectar ───────────────────────────────────────────────────────────
function rebuildNectar() {
  const nectarHtml = join(root, "packages", "runtime", "examples", "الرحيق.html");

  // Read existing HTML and extract story JSON
  const html = readFileSync(nectarHtml, "utf-8");
  const m = html.match(/<script id="qalam-story" type="application\/json">\s*([\s\S]*?)\s*<\/script>/);
  if (!m) {
    console.error("Could not extract story JSON from الرحيق.html");
    process.exit(1);
  }
  const storyJsonText = m[1].trim();
  let storyJson;
  try {
    storyJson = JSON.parse(storyJsonText);
  } catch (e) {
    console.error("Invalid JSON in الرحيق.html:", e.message);
    process.exit(1);
  }

  // Read fresh runtime bundle
  const bundlePath = join(root, "packages", "runtime", "dist", "aqlamna-runtime.js");
  const runtimeJs = readFileSync(bundlePath, "utf-8");

  // Inline all three themes with theme-switching JS
  const themeHtml = buildThemeBlocks(storyJson.title ?? "قصة");

  // Build HTML (same logic as cli.mjs)
  const safeJson = JSON.stringify(storyJson).replace(/</g, "\\u003c");
  const title = escapeHtml(storyJson.title ?? "قصة تفاعلية");

  const out = [
    "<!DOCTYPE html>",
    '<html lang="ar" dir="rtl">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${title}</title>`,
    themeHtml,
    "</head>",
    "<body>",
    '<div id="qalam-player"></div>',
    '<script id="qalam-story" type="application/json">',
    safeJson,
    "</script>",
    "<script>",
    runtimeJs.trim(),
    "</script>",
    "</body>",
    "</html>",
    "",
  ].join("\n");

  writeFileSync(nectarHtml, out, "utf-8");
  console.log(`  ✓ packages/runtime/examples/الرحيق.html  (${out.length} bytes)`);
}

function escapeHtml(s) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}
