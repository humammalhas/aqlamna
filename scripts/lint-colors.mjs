// scripts/lint-colors.mjs — ensure zero hardcoded hex colours remain
// in editor source (excluding the theme file and generated/).
// Exits 0 if clean, 1 if any hex found.

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const srcDir = resolve(root, "packages", "editor", "src");

const RE = /#[0-9a-fA-F]{3,8}\b/;

function collect(dir, violations = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "generated") collect(p, violations);
    } else if (/\.(tsx?|css)$/.test(entry.name) && entry.name !== "aqlamna-theme.css") {
      const content = readFileSync(p, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (RE.test(lines[i])) {
          violations.push(`${p}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }
  }
  return violations;
}

const violations = collect(srcDir);
if (violations.length > 0) {
  console.error(`${violations.length} hardcoded colour(s) found:`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log("0 hardcoded colours");
