// scripts/build-site.mjs — copy build artifacts into site/
// Called from root `build:site` after the editor builds with base /editor/.

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

// 2. Story → site/
const story = resolve(root, "stories", "العطر_المفقود.html");
if (!existsSync(story)) {
  console.error("story file not found:", story);
  process.exit(1);
}
copyFile(story, resolve(site, "العطر_المفقود.html"));
console.log("✓ site/العطر_المفقود.html");

// 3. Brand assets → site/assets/
const brandAssets = ["icon-512.png", "favicon.ico", "logo-transparent.png"];
for (const f of brandAssets) {
  const src = resolve(root, "brand", f);
  if (!existsSync(src)) {
    console.error("brand asset not found:", src);
    process.exit(1);
  }
  copyFile(src, resolve(site, "assets", f));
  console.log(`✓ site/assets/${f}`);
}

console.log("\nSite is ready at site/");
