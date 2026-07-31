// scripts/build-site.mjs — copy build artifacts into site/
// Called from root `build:site` after the editor builds with base /editor/.

import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isolateAscii } from "./bidi-isolate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const site = resolve(root, "site");

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  ensureDir(dirname(dest));
  cpSync(src, dest, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(dirname(dest));
  cpSync(src, dest);
}

// 1. Editor dist → site/editor/
const editorDist = resolve(root, "packages", "editor", "dist");
if (!existsSync(editorDist)) {
  console.error("editor dist/ not found — run the editor build first");
  process.exit(1);
}
copyDir(editorDist, resolve(site, "editor"));
console.log("✓ site/editor/");

// Vite builds the editor with `--base /editor/` and rewrites every absolute
// href in index.html to sit under that base — including the manifest link, so
// `/manifest.webmanifest` came out as `/editor/manifest.webmanifest`. There is
// exactly one manifest and it lives at the site root, because its scope is the
// whole site. Point the tag back and fail loudly if the rewrite ever stops.
{
  const editorIndex = resolve(site, "editor", "index.html");
  let html = readFileSync(editorIndex, "utf-8");
  html = html.replace(
    /href="\/editor\/manifest\.webmanifest"/,
    'href="/manifest.webmanifest"',
  );
  if (!html.includes('href="/manifest.webmanifest"')) {
    console.error("editor index.html does not link /manifest.webmanifest");
    process.exit(1);
  }
  writeFileSync(editorIndex, html, "utf-8");
  console.log("✓ site/editor/index.html → /manifest.webmanifest");
}

// 2. Story → site/
const story = resolve(root, "stories", "العطر_المفقود.html");
if (!existsSync(story)) {
  console.error("story file not found:", story);
  process.exit(1);
}
copyFile(story, resolve(site, "العطر_المفقود.html"));
console.log("✓ site/العطر_المفقود.html");

// 3. Brand assets → site/assets/
// icon-192 and icon-512 are referenced by /manifest.webmanifest, whose scope
// is the whole site — so they must exist at /assets/, not only under /editor/.
// The manifest previously pointed at paths that 404'd, which is one reason
// the app was never installable.
const brandAssets = [
  ["icon-512.png", "icon-512.png"],
  ["icon-192.png", "icon-192.png"],
  ["icon-180.png", "apple-touch-icon.png"],
  ["favicon.ico", "favicon.ico"],
  ["logo-transparent.png", "logo-transparent.png"],
];
for (const [from, to] of brandAssets) {
  const src = resolve(root, "brand", from);
  if (!existsSync(src)) {
    console.error("brand asset not found:", src);
    process.exit(1);
  }
  copyFile(src, resolve(site, "assets", to));
  console.log(`✓ site/assets/${to}`);
}

// Every icon the manifest names must actually resolve, or Chrome silently
// refuses to install and never says why.
const manifestPath = resolve(site, "manifest.webmanifest");
if (!existsSync(manifestPath)) {
  console.error("manifest not found:", manifestPath);
  process.exit(1);
}
for (const icon of JSON.parse(readFileSync(manifestPath, "utf-8")).icons) {
  const iconPath = resolve(site, icon.src.replace(/^\//, ""));
  if (!existsSync(iconPath)) {
    console.error(`manifest names ${icon.src} but ${iconPath} does not exist`);
    process.exit(1);
  }
}
console.log("✓ manifest icons all resolve");

// 4. Demo prose — generated from stories/العطر_المفقود.qalam
const qalamSrc = resolve(root, "stories", "العطر_المفقود.qalam");
if (!existsSync(qalamSrc)) {
  console.error("qalam source not found:", qalamSrc);
  process.exit(1);
}
const demoHtml = generateDemoHtml(qalamSrc);

// Inject into site/index.html
const indexHtml = resolve(site, "index.html");
let indexContent = readFileSync(indexHtml, "utf-8");
const demoRe = /<!-- DEMO_START[^]*?<!-- DEMO_END -->/;
if (!demoRe.test(indexContent)) {
  console.error("DEMO markers not found in site/index.html");
  process.exit(1);
}
// Preserve markers around the generated content so this remains idempotent
indexContent = indexContent.replace(
  demoRe,
  "<!-- DEMO_START — generated from stories/العطر_المفقود.qalam by build-site.mjs -->\n" + demoHtml + "\n    <!-- DEMO_END -->",
);
writeFileSync(indexHtml, indexContent, "utf-8");
console.log("✓ site/index.html (demo prose injected)");

console.log("\nSite is ready at site/");

// ── generateDemoHtml ────────────────────────────────────────────────────
function generateDemoHtml(qalamPath) {
  const src = readFileSync(qalamPath, "utf-8");

  // Extract the first passage: from first === to next === or end
  const passageRe = /^(=== .+ ===[^\n]*)\n((?:(?!^=== ).*\n?)*)/m;
  const m = passageRe.exec(src);
  if (!m) return "<!-- DEMO: could not parse first passage -->";

  const header = m[1].replace(/#[^\n]*/, "").trim(); // strip tags
  const body = m[2].trim();

  // Split into lines for processing
  const lines = body.split("\n");

  // Build source display and result blocks.
  // Prose = everything before the first choice. Choices = labels only.
  const sourceLines = [];
  const proseLines = [];
  const choiceLabels = [];
  let beforeChoices = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      sourceLines.push("");
      continue;
    }
    if (trimmed.startsWith("* [")) {
      beforeChoices = false;
      const label = trimmed.match(/\* \[([^\]]+)\]/)?.[1] ?? trimmed;
      // Show the choice line + its divert in source
      sourceLines.push(trimmed);
      choiceLabels.push(label);
    } else if (!beforeChoices) {
      // Inside choice body — show in source, skip for result prose
      sourceLines.push(line);
    } else {
      sourceLines.push(trimmed);
      proseLines.push(trimmed);
    }
  }

  // ASCII runs get an LTR isolate so `->` does not paint as `<-`.
  // See scripts/bidi-isolate.mjs.
  const sourceBlock = isolateAscii(
    escHtml(header + "\n\n" + sourceLines.join("\n")),
  );
  const proseBlock = proseLines.map((p) => `<p class="loop-prose">${escHtml(p)}</p>`).join("\n");
  const choiceButtons = choiceLabels.map((l) => `            <button disabled>${escHtml(l)}</button>`).join("\n");

  return `    <!-- Source / result side-by-side -->
    <section class="loop-section">
      <div class="loop-card">
        <h3>تكتب هذا</h3>
        <pre class="loop-source">${sourceBlock}</pre>
      </div>
      <div class="loop-card">
        <h3>يصير هذا</h3>
        <div class="loop-result">
${proseBlock}
          <div class="loop-choices">
${choiceButtons}
          </div>
        </div>
      </div>
    </section>`;
}

function escHtml(s) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}
