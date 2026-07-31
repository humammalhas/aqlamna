// scripts/build-all.mjs — one command regenerates every shipped artifact.
//
// Order: core → runtime → linter → editor → all three exported story HTMLs →
// site → docs. Nobody should ever again ship a file older than the fix it needs.
//
// `npm run check:artifacts` is the gate that proves this ran. See
// scripts/artifacts.manifest.mjs for the invariant it enforces.
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
console.log("══ Step 1/7: core");
run("npm run build -w @aqlamna/core");

// ── 2. Runtime ──────────────────────────────────────────────────────────────
console.log("══ Step 2/7: runtime");
run("npm run build -w @aqlamna/runtime");

// ── 3. Linter ───────────────────────────────────────────────────────────────
// Rules first, then tsc — the compiler reads src/generated/rules.ts.
// This step was missing until 31 Jul 2026, so `build:all` rebuilt every shipped
// artifact except the one generated from ARABIC_MASTERY.md. The editor picked
// up new corrections (build-mastery-prompt runs inside the editor build) while
// the linter kept the previous ones, from the same corpus, in the same commit.
console.log("══ Step 3/7: linter (rules from ARABIC_MASTERY.md, then tsc)");
run("npm run build:rules -w @aqlamna/linter");
run("npm run build -w @aqlamna/linter");

// ── 4. Editor ───────────────────────────────────────────────────────────────
// BEFORE the story exports, not after. `build:site` starts by rebuilding
// @aqlamna/runtime, so running it later rewrote dist/aqlamna-runtime.js after
// the stories had already been wrapped around it — leaving every exported story
// permanently older than the bundle inside it. Identical bytes, but the
// timestamps said "stale" and they were right to: nothing guaranteed the two
// runs produced the same output. check:artifacts caught this.
console.log("══ Step 4/7: editor");
run("npm run build:site -w @aqlamna/editor");

// ── 5. Export story HTMLs ───────────────────────────────────────────────────
// Must follow every step that can touch packages/runtime/dist, and precede
// build-site.mjs, which copies stories/العطر_المفقود.html into site/.
console.log("══ Step 5/7: export story HTMLs");

const cliPath = join(root, "packages", "runtime", "scripts", "cli.mjs");

// 5a. العطر_المفقود → stories/ and site/
const qalamSource = join(root, "stories", "العطر_المفقود.qalam");
if (!existsSync(qalamSource)) {
  console.error("Missing story source: " + qalamSource);
  process.exit(1);
}
run(`node "${cliPath}" "${qalamSource}" -o "${join(root, "stories", "العطر_المفقود.html")}"`);
run(`node "${cliPath}" "${qalamSource}" -o "${join(root, "site", "العطر_المفقود.html")}"`);

// 5b. الرحيق — no .qalam source; extract JSON from existing HTML and re-wrap
//     with the freshly-built runtime.
console.log("\n  → rebuild الرحيق.html (extract JSON + fresh runtime)");
rebuildNectar();

// ── 6. Site ─────────────────────────────────────────────────────────────────
console.log("══ Step 6/7: site");
run("node scripts/build-site.mjs");

// ── 7. Docs ─────────────────────────────────────────────────────────────────
console.log("══ Step 7/7: docs");
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
