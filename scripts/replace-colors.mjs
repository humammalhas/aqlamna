// scripts/replace-colors.mjs — replace hardcoded hex with var(--aq-*)
// Run from repo root: node scripts/replace-colors.mjs

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const srcDir = resolve(root, "packages", "editor", "src");

// Mapping: exact hex → CSS var. Applied in order; first match wins.
const MAP = [
  // Dark theme inverse (hexes that appear in current source = dark palette)
  // Base
  ["#1a1713", "var(--aq-bg)"],
  ["#1c1917", "var(--aq-surface)"],
  ["#2a2620", "var(--aq-surface-hi)"],
  ["#3a3528", "var(--aq-border)"],
  ["#3a352844", "var(--aq-border)"],
  ["#3a352866", "var(--aq-border)"],
  ["#4a4030", "var(--aq-border-hi)"],
  ["#e0d6c2", "var(--aq-text)"],
  ["#9a8c70", "var(--aq-muted)"],
  ["#8a7d66", "var(--aq-muted)"],
  ["#8a8070", "var(--aq-muted)"],
  ["#5a5040", "var(--aq-dim)"],
  ["#5a5440", "var(--aq-dim)"],
  ["#6a6450", "var(--aq-dim)"],
  ["#4a4540", "var(--aq-faint)"],
  ["#525252", "var(--aq-syn-gutter)"],
  ["#a3a3a3", "var(--aq-faint)"],
  ["#d4d4d4", "var(--aq-border)"],
  ["#c8c0b0", "var(--aq-dim)"],
  ["#d0c8b8", "var(--aq-border-hi)"],

  // Accent
  ["#d4a843", "var(--aq-accent)"],
  ["#c49a38", "var(--aq-accent-hi)"],
  ["#b09050", "var(--aq-accent-muted)"],
  ["#c09050", "var(--aq-warning)"],
  ["#c09040", "var(--aq-accent-muted)"],
  ["#c0b090", "var(--aq-accent-muted)"],
  ["#b8a88a", "var(--aq-text)"],  // light text on dark bg
  ["#e8c84a", "var(--aq-accent)"],
  ["#e5c07b", "var(--aq-syn-divert)"],

  // Editor chrome
  ["#141210", "var(--aq-editor-bg)"],
  ["#0e0d0b", "var(--aq-input-bg)"],
  ["#1a1814", "var(--aq-bg-deep)"],
  ["#1a181433", "var(--aq-syn-activeline)"],

  // Buttons
  ["#4a3030", "var(--aq-btn-danger-border)"],
  ["#2a1818", "var(--aq-danger-bg)"],
  ["#1a1414", "var(--aq-danger-bg)"],

  // Semantic
  ["#60b060", "var(--aq-success)"],
  ["#c06050", "var(--aq-danger)"],
  ["#e06060", "var(--aq-danger)"],
  ["#e08080", "var(--aq-error-text)"],
  ["#e0c0c0", "var(--aq-btn-danger-border)"],
  ["#e8a0a0", "var(--aq-error-text)"],
  ["#9a6a6a", "var(--aq-error-text)"],
  ["#6b2a2a", "var(--aq-error-text)"],
  ["#4a2020", "var(--aq-error-bg)"],
  ["#3b1a1a", "var(--aq-error-bg)"],
  ["#3a2020", "var(--aq-error-bg)"],
  ["#2a1a1a", "var(--aq-danger-bg)"],
  ["#2a2010", "var(--aq-warning-bg)"],
  ["#2a201a", "var(--aq-danger-bg)"],
  ["#3a3020", "var(--aq-warning-bg)"],

  // Canvas
  ["#5a8fc0", "var(--aq-node-blue)"],
  ["#48a", "var(--aq-node-blue)"],
  ["#4a8", "var(--aq-node-green)"],
  ["#5a9", "var(--aq-node-green)"],
  ["#c44", "var(--aq-node-red)"],
  ["#c55", "var(--aq-node-red)"],
  ["#d8a", "var(--aq-node-orange)"],
  ["#d9a", "var(--aq-node-orange)"],
  ["#98c379", "var(--aq-syn-string)"],
  ["#7ea87e", "var(--aq-syn-comment)"],
  ["#1a1a2a", "var(--aq-node-blue-bg)"],
  ["#1a2a1a", "var(--aq-node-green-bg)"],
  ["#1a3a1a", "var(--aq-node-green-bg)"],
  ["#3c2a1e", "var(--aq-node-orange-bg)"],
  ["#5a4a30", "var(--aq-node-muted)"],
  ["#5a3e28", "var(--aq-node-orange)"],
  ["#4a4030", "var(--aq-canvas-edge)"],

  // Syntax
  ["#c678dd", "var(--aq-syn-keyword)"],
  ["#d19a66", "var(--aq-syn-choice)"],
  ["#61afef", "var(--aq-syn-comment)"],
  ["#56b6c2", "var(--aq-syn-var)"],
  ["#a08050", "var(--aq-syn-divert)"],
  ["#8b6f3a", "var(--aq-syn-divert)"],
  ["#8a7040", "var(--aq-syn-divert)"],
  ["#8a7060", "var(--aq-muted)"],

  // Other
  ["#f0f0f0", "var(--aq-surface-hi)"],
  ["#f5f0e8", "var(--aq-bg)"],
  ["#faf7f2", "var(--aq-bg)"],
  ["#fafaf9", "var(--aq-bg)"],
  ["#ffffff", "var(--aq-node-bg)"],
  ["#ede4d3", "var(--aq-bg)"],
  ["#c4a97d", "var(--aq-accent-muted)"],
  ["#d19a66", "var(--aq-node-orange)"],
  ["#374151", "var(--aq-node-text)"],
  ["#5c6370", "var(--aq-node-muted)"],
  ["#8a8a7a", "var(--aq-muted)"],
  ["#2563eb", "var(--aq-accent)"],
  ["#1a1a1a", "#0d0d0d"], // placeholder
];

// Collect all source files except the theme
function collect(dir, ext, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "generated") collect(p, ext, files);
    else if (entry.isFile() && entry.name.endsWith(ext)) files.push(p);
  }
  return files;
}

const files = [
  ...collect(resolve(srcDir, "components"), ".tsx"),
  ...collect(resolve(srcDir, "lib"), ".ts"),
  ...collect(resolve(srcDir, "qalam"), ".ts"),
  resolve(srcDir, "store.ts"),
  resolve(srcDir, "App.tsx"),
  resolve(srcDir, "main.tsx"),
  resolve(srcDir, "index.css"),
];

let total = 0;
for (const file of files) {
  let content = readFileSync(file, "utf8");
  let changed = false;
  for (const [hex, v] of MAP) {
    if (content.includes(hex)) {
      content = content.split(hex).join(v);
      changed = true;
      total++;
    }
  }
  if (changed) {
    writeFileSync(file, content, "utf8");
    console.log(`  ${file.replace(root, "")}`);
  }
}
console.log(`\nReplacements: ${total}`);
