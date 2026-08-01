// ---------------------------------------------------------------------------
// cli.mjs — Aqlamna standalone HTML exporter CLI
//
// Usage: node cli.mjs <path-to.qalam> [-o out.html] [--theme dark|light|book]
//   npm run export -- <path-to.qalam> [-o out.html] [--theme dark|light|book]
//
// Compiles the .qalam source via @aqlamna/core, then inlines the compiled
// story JSON, the runtime engine, and ALL THREE theme CSS files into a single
// .html file. The --theme flag selects the default (light if omitted).
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildThemeBlocks } from "../../../scripts/theme-builder.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(__dirname, "..");

// ---- Resolve CLI args ------------------------------------------------------

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  console.log("Usage: node cli.mjs <path-to.qalam> [-o out.html] [--theme dark|light|book]");
  process.exit(args.length === 0 ? 1 : 0);
}

const VALID_THEMES = new Set(["dark", "light", "book"]);

const qalamPath = resolve(args[0]);
let outPath = qalamPath.replace(/\.qalam$/, ".html");
let defaultTheme = "light";
for (let i = 1; i < args.length; i++) {
  if (args[i] === "-o" || args[i] === "--out") {
    outPath = resolve(args[i + 1] ?? outPath);
    i++;
  } else if (args[i] === "--theme") {
    const t = args[i + 1];
    if (t && VALID_THEMES.has(t)) {
      defaultTheme = t;
      i++;
    } else {
      console.error(
        "[export] قيمة السمة غير صالحة: '" + (t ?? "") + "'.\n" +
        "  القيم المسموحة: dark, light, book",
      );
      process.exit(1);
    }
  }
}

// ---- Compile the .qalam source ---------------------------------------------

console.log("[export] Compiling: " + qalamPath);

// Dynamic import from @aqlamna/core (must be pre-built)
const coreDist = join(pkgDir, "..", "core", "dist", "index.js");
const { compile } = await import(pathToFileURL(coreDist).href);

const source = readFileSync(qalamPath, "utf-8");
const filename = qalamPath.replace(/^.*[\\/]/, "");

// metadata.created / metadata.modified come from the SOURCE, not the clock.
// With the wall clock, exporting an unchanged story produced a different file
// every time, so `npm run build:all` left three story HTMLs dirty with a
// timestamp-only diff on every run — and "confirm every path in `git status`
// is one you deliberately changed" cannot survive three files that are always
// listed. Same input file, same bytes out.
const sourceTimestamp = statSync(qalamPath).mtime.toISOString();

let storyJson;
try {
  storyJson = compile(source, filename, { timestamp: sourceTimestamp });
} catch (err) {
  console.error("[export] Compilation failed: " + (err?.message ?? err));
  process.exit(1);
}

// ---- Inline the illustrations ----------------------------------------------
//
// The compiled JSON carries only each image's DECLARATION — its name and Arabic
// description. In the editor the bytes come from IndexedDB; a build script has
// no such thing, so it reads the same files `copy-seed.mjs` reads:
//
//   stories/images/<story-basename>-<image-name>.webp
//
// Without this the CLI exported a picture-less story and the frames carried
// their descriptions instead — correct behaviour for an undrawn image, and a
// silent downgrade for one that had been drawn.
if (storyJson.images && Object.keys(storyJson.images).length > 0) {
  const storyName = filename.replace(/\.qalam$/, "");
  const imagesDir = join(qalamPath, "..", "images");
  let inlined = 0;
  for (const [name, decl] of Object.entries(storyJson.images)) {
    const file = join(imagesDir, `${storyName}-${name}.webp`);
    if (!existsSync(file)) {
      console.warn(`[export] no bytes for image "${name}" — exporting its frame only`);
      continue;
    }
    decl.data = `data:image/webp;base64,${readFileSync(file).toString("base64")}`;
    inlined++;
  }
  console.log(
    `[export] Inlined ${inlined}/${Object.keys(storyJson.images).length} image(s)`,
  );
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

  const storyJsonText = JSON.stringify(storyJson);
  const safeJson = storyJsonText.replace(/</g, "\\u003c");
  const title = escapeHtml(storyJson.title ?? "قصة تفاعلية");
  const lang = storyJson.language === "en" ? "en" : "ar";
  const dir = storyJson.direction === "ltr" ? "ltr" : "rtl";

  // Inline all three themes with theme-switching JS
  const themeHtml = buildThemeBlocks(storyJson.title ?? "قصة");

  return [
    "<!DOCTYPE html>",
    `<html lang="${lang}" dir="${dir}">`,
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
}

function escapeHtml(s) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}
