// scripts/build-all.mjs — one command regenerates every shipped artifact.
//
// Order: images → core → runtime → linter → editor → all three exported story
// HTMLs → site → docs. Nobody should ever again ship a file older than the fix it needs.
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

// ── 1. Images ───────────────────────────────────────────────────────────────
// FIRST, and specifically before the editor build: build-images.mjs writes into
// packages/editor/public/, which Vite copies verbatim into the editor bundle.
// Run it after step 4 and /editor/ ships the previous icons — the same class of
// bug as exporting the stories before rebuilding the runtime.
console.log("══ Step 1/8: images (derived from brand/)");
run("node scripts/build-images.mjs");

// ── 2. Core ─────────────────────────────────────────────────────────────────
console.log("══ Step 2/8: core");
run("npm run build -w @aqlamna/core");

// ── 3. Runtime ──────────────────────────────────────────────────────────────
console.log("══ Step 3/8: runtime");
run("npm run build -w @aqlamna/runtime");

// ── 4. Linter ───────────────────────────────────────────────────────────────
// Rules first, then tsc — the compiler reads src/generated/rules.ts.
// This step was missing until 31 Jul 2026, so `build:all` rebuilt every shipped
// artifact except the one generated from ARABIC_MASTERY.md. The editor picked
// up new corrections (build-mastery-prompt runs inside the editor build) while
// the linter kept the previous ones, from the same corpus, in the same commit.
console.log("══ Step 4/8: linter (rules from ARABIC_MASTERY.md, then tsc)");
run("npm run build:rules -w @aqlamna/linter");
run("npm run build -w @aqlamna/linter");

// ── 5. Editor ───────────────────────────────────────────────────────────────
// BEFORE the story exports, not after. `build:site` starts by rebuilding
// @aqlamna/runtime, so running it later rewrote dist/aqlamna-runtime.js after
// the stories had already been wrapped around it — leaving every exported story
// permanently older than the bundle inside it. Identical bytes, but the
// timestamps said "stale" and they were right to: nothing guaranteed the two
// runs produced the same output. check:artifacts caught this.
console.log("══ Step 5/8: editor");
run("npm run build:site -w @aqlamna/editor");

// ── 6. Export story HTMLs ───────────────────────────────────────────────────
// Must follow every step that can touch packages/runtime/dist, and precede
// build-site.mjs, which copies stories/العطر_المفقود.html into site/.
console.log("══ Step 6/8: export story HTMLs");

const cliPath = join(root, "packages", "runtime", "scripts", "cli.mjs");

// 6a. العطر_المفقود → stories/ and site/
const qalamSource = join(root, "stories", "العطر_المفقود.qalam");
if (!existsSync(qalamSource)) {
  console.error("Missing story source: " + qalamSource);
  process.exit(1);
}
run(`node "${cliPath}" "${qalamSource}" -o "${join(root, "stories", "العطر_المفقود.html")}"`);
run(`node "${cliPath}" "${qalamSource}" -o "${join(root, "site", "العطر_المفقود.html")}"`);

// 6b. طائرة_الورق → site/. The editor's example, and the only shipped story
//     with illustrations — the CLI inlines them from stories/images/.
const kiteSource = join(root, "stories", "طائرة_الورق.qalam");
if (!existsSync(kiteSource)) {
  console.error("Missing story source: " + kiteSource);
  process.exit(1);
}
run(`node "${cliPath}" "${kiteSource}" -o "${join(root, "site", "طائرة_الورق.html")}"`);

// 6c/6d. Two stories have no .qalam in this repo. Their compiled JSON is the
//     master and lives inside the HTML itself, so they are re-wrapped rather
//     than re-exported: extract the JSON, wrap it in the freshly-built runtime
//     and the current themes. Without this they keep whatever bundle they were
//     exported against and silently fall behind every runtime fix — which is
//     how حرّاس الخزنة would have been the one story on the site that shows no
//     author, on the day the byline shipped.
console.log("\n  → rewrap الرحيق.html (extract JSON + fresh runtime)");
rewrapStory(join(root, "packages", "runtime", "examples", "الرحيق.html"));
console.log("  → rewrap stories/حرّاس_الخزنة.html (extract JSON + fresh runtime)");
rewrapStory(join(root, "stories", "حرّاس_الخزنة.html"));

// ── 7. Site ─────────────────────────────────────────────────────────────────
console.log("══ Step 7/8: site");
run("node scripts/build-site.mjs");

// ── 8. Docs ─────────────────────────────────────────────────────────────────
console.log("══ Step 8/8: docs");
run("node scripts/build-docs.mjs");

// ── Timestamp check ─────────────────────────────────────────────────────────
console.log("\n══ Timestamps:");
const storyFiles = [
  join(root, "stories", "العطر_المفقود.html"),
  join(root, "site", "العطر_المفقود.html"),
  join(root, "site", "طائرة_الورق.html"),
  join(root, "packages", "runtime", "examples", "الرحيق.html"),
];
for (const f of storyFiles) {
  const { mtimeMs, size } = statSync(f);
  const rel = f.replace(root, "").replace(/^[\\/]/, "");
  console.log(`  ${rel}  ${size} bytes  ${new Date(mtimeMs).toISOString()}`);
}

// ── rewrapStory ─────────────────────────────────────────────────────────────
//
// For a story whose compiled JSON lives inside its own HTML and nowhere else:
// take that JSON out, wrap it in the current runtime and themes, write it back.
// The bytes of the story do not change; the player around them does.
function rewrapStory(nectarHtml) {
  const name = nectarHtml.replace(root, "").replace(/^[\\/]/, "");

  // Read existing HTML and extract story JSON
  const html = readFileSync(nectarHtml, "utf-8");
  const m = html.match(/<script id="qalam-story" type="application\/json">\s*([\s\S]*?)\s*<\/script>/);
  if (!m) {
    console.error(`Could not extract story JSON from ${name}`);
    process.exit(1);
  }
  const storyJsonText = m[1].trim();
  let storyJson;
  try {
    storyJson = JSON.parse(storyJsonText);
  } catch (e) {
    console.error(`Invalid JSON in ${name}:`, e.message);
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

  const authorMeta = storyJson.author
    ? [`<meta name="author" content="${escapeHtml(storyJson.author)}">`]
    : [];

  const out = [
    "<!DOCTYPE html>",
    '<html lang="ar" dir="rtl">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${title}</title>`,
    ...authorMeta,
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
  console.log(`  ✓ ${name}  (${out.length} bytes)`);
}

function escapeHtml(s) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}
