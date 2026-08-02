// ---------------------------------------------------------------------------
// build-runtime.mjs — compiles runtime TypeScript to a single plain JS bundle
//
// Runs tsc, then concatenates dist/*.js files (stripping module syntax) into
// one IIFE that exposes no globals and bootstraps the player automatically.
//
// Usage: node build-runtime.mjs [--out out.js]
// ---------------------------------------------------------------------------

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(__dirname, "..");
const distDir = join(pkgDir, "dist");
const outFile = join(pkgDir, "dist", "aqlamna-runtime.js");

// 1. Compile TypeScript
console.log("[build-runtime] Compiling TypeScript...");
execSync("npx tsc", { cwd: pkgDir, stdio: "inherit" });

// 2. Read compiled JS files in dependency order.
//
// index.js is in this list, and that is the whole point: it holds mount(), the
// game loop. The bootstrap below used to re-implement that loop by hand,
// complete with its own onSave and onLoad, because index.js opens with `import`
// statements and the stripper only knew how to remove `export`. The copy is how
// save/load feedback came to be implemented in the source and absent from every
// exported story. Stripping imports too costs three lines and removes the
// second implementation instead of maintaining it.
const files = ["types.js", "engine.js", "renderer.js", "save.js", "index.js"];

let combined = "";

for (const f of files) {
  const path = join(distDir, f);
  let src = readFileSync(path, "utf-8");

  // Strip source map comment
  src = src.replace(/^\/\/# sourceMappingURL=.*$/m, "");

  // Strip module syntax — keep declarations, drop the keyword only.
  // "export class Engine {"  →  "class Engine {"
  // "export function f("     →  "function f("
  // "export { ... };", "export default ...;", "import ... ;" → dropped entirely
  //
  // Dropping imports is safe only because every module named in one is
  // concatenated into this same scope, ahead of the file that imports it. The
  // assertion after the loop is what keeps that true.
  src = src
    .split("\n")
    .map((line) => {
      // Drop bare export { } and export default statements
      if (/^\s*export\s*\{/.test(line)) return null;
      if (/^\s*export\s+default\s/.test(line)) return null;
      // Drop imports — the imported bindings are already in scope
      if (/^\s*import\s/.test(line)) return null;
      // Strip "export " keyword prefix only (keeps the declaration)
      return line.replace(
        /^(\s*)export\s+(?=class\s|function\s|const\s|let\s|var\s|async\s)/,
        "$1",
      );
    })
    .filter((line) => line !== null)
    .join("\n");

  // Remove trailing blank lines
  src = src.trimEnd();

  if (src.length > 0) {
    combined += src + "\n";
  }
}

// A single surviving `import` or `export` makes the bundle a module, and a
// module inside a <script> tag is a SyntaxError that kills the whole player.
// The stripper is line-based, so a multi-line import emitted by a future tsc
// would slip straight through it. Fail here, loudly, rather than shipping an
// exported story that opens to a blank page.
const leftovers = combined
  .split("\n")
  .map((line, i) => [i + 1, line])
  .filter(([, line]) => /^\s*(import|export)[\s{*]/.test(line));
if (leftovers.length > 0) {
  console.error("[build-runtime] module syntax survived the stripper:");
  for (const [n, line] of leftovers) console.error(`  line ${n}: ${line.trim()}`);
  process.exit(1);
}

// 3. Bootstrap — finds the story JSON and hands it to mount().
//
// Everything below this comment is wiring. There is no game loop here any more
// and there must never be one again: mount() in src/index.ts is the single
// implementation, and it is the one the editor's player pane runs too, so the
// exported story and the editor preview cannot drift apart.
const bootstrap = `
// ---- Aqlamna standalone bootstrap -----------------------------------------
(function () {
  var storyEl = document.getElementById("qalam-story");
  if (!storyEl) return;
  var root = document.getElementById("qalam-player");
  if (!root) return;

  // An exported story carries all three themes and the switcher that cycles
  // them — and until now no button called it. The reader got whichever theme
  // was chosen at export and no way to change it, while the editor's own
  // preview had the 🎨 the same renderer draws. The button exists only when
  // there is something for it to do: an export assembled without the theme
  // blocks has no switcher, and a dead button is worse than none.
  var options = {};
  if (typeof window !== "undefined" && typeof window.__aqlamnaCycleTheme === "function") {
    options.onThemeToggle = function () { window.__aqlamnaCycleTheme(); };
  }

  mount(JSON.parse(storyEl.textContent), root, options);
})();
`;

// 4. Wrap everything in an IIFE (the bootstrap already is one, but wrap the
//    runtime code too so nothing leaks to global scope)
const wrapped =
  "(function () {\n" + combined + "\n" + bootstrap + "\n})();\n";

// Write only when the bytes actually changed. This script runs three times in
// one `npm run build:all` and again inside `npm run test:site`, and an
// unconditional write moved the bundle's mtime past every story exported
// against it — while the contents were identical. A timestamp that moves
// without a change makes every timestamp here worthless, and "check the
// timestamps" is a rule this project earned the hard way.
const unchanged = existsSync(outFile) && readFileSync(outFile, "utf-8") === wrapped;
if (unchanged) {
  console.log("[build-runtime] Unchanged — " + outFile + " (" + wrapped.length + " bytes)");
} else {
  writeFileSync(outFile, wrapped, "utf-8");
  console.log("[build-runtime] Wrote " + outFile + " (" + wrapped.length + " bytes)");
}
