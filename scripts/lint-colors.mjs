// scripts/lint-colors.mjs — no hardcoded hex colours in the editor's source.
// Every colour comes from a CSS variable; the palette lives in aqlamna-theme.css.
// Exits 0 if clean, 1 otherwise.
//
// This runs as `npm run lint:colors`. It used to be an inline `node -e` in
// package.json that shelled `grep … || true` into `pwsh.exe` — and PowerShell
// has neither `grep` nor `true`. It only ever worked when the whole npm chain
// was launched from Git Bash, whose PATH the spawned pwsh inherited. Run
// `npm test` from a plain PowerShell window and the suite died here, three
// steps in, with four steps never executed. Pure Node, no shell, runs anywhere.
//
// SCOPE — the editor's src/ only, which is what this gate has always actually
// enforced and what the cream-palette bug was about: 46 variables defined and
// 189 hardcoded hex values still in the components.
//
// It is deliberately NOT extended to site/*.html or the exported stories. A
// wider scan written on 30 Jul (never wired into anything) reports 164 hits
// there, and they are correct by design: the standalone export must inline its
// themes because the runtime has zero dependencies (hard rule 4), and
// `<meta name="theme-color">` takes a literal hex and nothing else. Whether
// either deserves a gate of its own is Humam's call, not this script's.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const RE = /#[0-9a-fA-F]{3,8}\b/;

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
const editorFiles = walkEditor(editorDir);
for (const f of editorFiles) {
  allViolations.push(...checkFile(f));
}

// A gate that scans nothing passes trivially. If the editor's source has moved
// or the walk broke, say so instead of printing a green zero.
if (editorFiles.length === 0) {
  console.error(`lint-colors: scanned 0 files under ${editorDir} — nothing was checked.`);
  process.exit(1);
}

if (allViolations.length > 0) {
  console.error(`${allViolations.length} hardcoded colour(s) found:`);
  for (const v of allViolations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`0 hardcoded colours in ${editorFiles.length} editor source file(s)`);
