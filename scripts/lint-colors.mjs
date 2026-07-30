// scripts/lint-colors.mjs — ensure zero hardcoded hex colours outside allowed files.
// Allowed: aqlamna-theme.css, site/assets/aqlamna.css, runtime theme CSS files.
// Exits 0 if clean, 1 if any hex found in any other source file.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const RE = /#[0-9a-fA-F]{3,8}\b/;
const EXCLUDE = new Set([
  "aqlamna-theme.css",
  "aqlamna.css",
]);

// Collect files from a directory tree
function walk(dir, exts, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "generated") walk(p, exts, files);
    else if (entry.isFile()) {
      const ext = entry.name.split(".").pop();
      if (exts.has(ext) && !EXCLUDE.has(entry.name)) {
        // Also exclude runtime theme CSS files (in packages/runtime/src/themes/)
        if (p.includes("packages\\runtime\\src\\themes")) continue;
        files.push(p);
      }
    }
  }
  return files;
}

function checkFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    if (RE.test(lines[i])) {
      violations.push(`${filePath}:${i + 1}: ${lines[i].trim()}`);
    }
  }
  return violations;
}

// ---- Scan directories ----
let allViolations = [];

// 1. Editor source
const editorDir = resolve(root, "packages", "editor", "src");
const editorExclude = new Set(["aqlamna-theme.css"]);
function walkEditor(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "generated") walkEditor(p, files);
    else if (entry.isFile() && /\.(tsx?|css)$/.test(entry.name) && !editorExclude.has(entry.name)) {
      files.push(p);
    }
  }
  return files;
}
for (const f of walkEditor(editorDir)) {
  allViolations.push(...checkFile(f));
}

// 2. Site HTML pages
const siteDir = resolve(root, "site");
for (const f of walk(siteDir, new Set(["html"]))) {
  allViolations.push(...checkFile(f));
}

// 3. Build scripts
const scriptsDir = resolve(root, "scripts");
for (const entry of readdirSync(scriptsDir, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const p = resolve(scriptsDir, entry.name);
  if (/\.(m?js)$/.test(entry.name)) {
    allViolations.push(...checkFile(p));
  }
}

if (allViolations.length > 0) {
  console.error(`${allViolations.length} hardcoded colour(s) found:`);
  for (const v of allViolations) console.error(`  ${v}`);
  process.exit(1);
}
console.log("0 hardcoded colours");
