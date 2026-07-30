// ---------------------------------------------------------------------------
// cli.mjs — Aqlamna standalone HTML exporter CLI
//
// Usage: node cli.mjs <path-to.qalam> [-o out.html]
//   npm run export -- <path-to.qalam> [-o out.html]
//
// Compiles the .qalam source via @aqlamna/core, then inlines the compiled
// story JSON, the runtime engine, and the theme CSS into a single .html file.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(__dirname, "..");

// ---- Resolve CLI args ------------------------------------------------------

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  console.log("Usage: node cli.mjs <path-to.qalam> [-o out.html]");
  process.exit(args.length === 0 ? 1 : 0);
}

const qalamPath = resolve(args[0]);
let outPath = qalamPath.replace(/\.qalam$/, ".html");
for (let i = 1; i < args.length; i++) {
  if (args[i] === "-o" || args[i] === "--out") {
    outPath = resolve(args[i + 1] ?? outPath);
    i++;
  }
}

// ---- Compile the .qalam source ---------------------------------------------

console.log("[export] Compiling: " + qalamPath);

// Dynamic import from @aqlamna/core (must be pre-built)
const coreDist = join(pkgDir, "..", "core", "dist", "index.js");
const { compile } = await import(pathToFileURL(coreDist).href);

const source = readFileSync(qalamPath, "utf-8");
const filename = qalamPath.replace(/^.*[\\/]/, "");
let storyJson;
try {
  storyJson = compile(source, filename);
} catch (err) {
  console.error("[export] Compilation failed: " + (err?.message ?? err));
  process.exit(1);
}

// ---- Build the HTML --------------------------------------------------------

const html = buildHtml(storyJson);
writeFileSync(outPath, html, "utf-8");

console.log("[export] Wrote: " + outPath + " (" + html.length + " bytes)");

// ---- HTML assembly ---------------------------------------------------------

function buildHtml(storyJson) {
  // Read the pre-built runtime bundle
  const bundlePath = join(pkgDir, "dist", "aqlamna-runtime.js");
  let runtimeJs;
  try {
    runtimeJs = readFileSync(bundlePath, "utf-8");
  } catch {
    console.error(
      "[export] Runtime bundle not found at: " + bundlePath +
      "\n  Run: npm run build -w @aqlamna/runtime"
    );
    process.exit(1);
  }

  // Inline the theme CSS (same as src/themes/dark.css, duplicated for simplicity)
  const css = getThemeCss();

  const storyJsonText = JSON.stringify(storyJson);
  const safeJson = storyJsonText.replace(/</g, "\\u003c");
  const title = escapeHtml(storyJson.title ?? "قصة تفاعلية");
  const lang = storyJson.language === "en" ? "en" : "ar";
  const dir = storyJson.direction === "ltr" ? "ltr" : "rtl";

  return [
    "<!DOCTYPE html>",
    `<html lang="${lang}" dir="${dir}">`,
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${title}</title>`,
    "<style>",
    css.trim(),
    "</style>",
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
}

function escapeHtml(s) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

// Inlined theme CSS (synced with src/themes/dark.css)
function getThemeCss() {
  return `
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  background: #1a1814;
}

body {
  min-block-size: 100vh;
}

.aq-story {
  direction: rtl;
  text-align: start;
  font-family:
    "IBM Plex Sans Arabic",
    "Noto Sans Arabic",
    "Amiri",
    "Tajawal",
    system-ui,
    sans-serif;
  font-size: 1.125rem;
  line-height: 1.85;
  color: #e0d6c2;
  background: #1a1814;
  max-inline-size: 42rem;
  margin-inline: auto;
  padding: 2rem 1.5rem;
}

.aq-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #d4a843;
  text-align: center;
  margin-block-end: 2rem;
  border-block-end: 1px solid #3a3528;
  padding-block-end: 0.75rem;
}

.aq-output {
  margin-block-end: 1.5rem;
}

.aq-text {
  margin-block: 0.75rem;
  text-indent: 0;
}

.aq-choices {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-block: 2rem;
}

.aq-choice-btn {
  display: block;
  inline-size: 100%;
  padding-block: 0.75rem;
  padding-inline: 1.25rem;
  font-family: inherit;
  font-size: 1.0625rem;
  text-align: start;
  color: #e0d6c2;
  background: #2a2620;
  border: 1px solid #4a4030;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.aq-choice-btn:hover {
  background: #3a3528;
  border-color: #8a7040;
}

.aq-choice-btn:focus-visible {
  outline: 2px solid #d4a843;
  outline-offset: 2px;
}

.aq-end {
  text-align: center;
  margin-block: 3rem;
}

.aq-end-text {
  font-size: 1.25rem;
  color: #d4a843;
  font-weight: 600;
  margin-block-end: 1.5rem;
}

.aq-toolbar {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-block-start: 3rem;
  padding-block-start: 1.5rem;
  border-block-start: 1px solid #3a3528;
}

.aq-btn {
  padding-block: 0.5rem;
  padding-inline: 1rem;
  font-family: inherit;
  font-size: 0.875rem;
  color: #9a8c70;
  background: transparent;
  border: 1px solid #3a3528;
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.aq-btn:hover {
  color: #d4a843;
  border-color: #5a4a30;
}

.aq-btn:focus-visible {
  outline: 2px solid #d4a843;
  outline-offset: 2px;
}

@media (max-width: 480px) {
  .aq-story {
    padding: 1rem;
    font-size: 1rem;
  }

  .aq-title {
    font-size: 1.375rem;
  }
}
`;
}
