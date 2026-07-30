// ---------------------------------------------------------------------------
// build-runtime.mjs — compiles runtime TypeScript to a single plain JS bundle
//
// Runs tsc, then concatenates dist/*.js files (stripping module syntax) into
// one IIFE that exposes no globals and bootstraps the player automatically.
//
// Usage: node build-runtime.mjs [--out out.js]
// ---------------------------------------------------------------------------

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(__dirname, "..");
const distDir = join(pkgDir, "dist");
const outFile = join(pkgDir, "dist", "aqlamna-runtime.js");

// 1. Compile TypeScript
console.log("[build-runtime] Compiling TypeScript...");
execSync("npx tsc", { cwd: pkgDir, stdio: "inherit" });

// 2. Read compiled JS files in dependency order
const files = ["types.js", "engine.js", "renderer.js", "save.js"];

let combined = "";

for (const f of files) {
  const path = join(distDir, f);
  let src = readFileSync(path, "utf-8");

  // Strip source map comment
  src = src.replace(/^\/\/# sourceMappingURL=.*$/m, "");

  // Strip export syntax — keep declarations, drop the keyword only.
  // "export class Engine {"  →  "class Engine {"
  // "export function f("     →  "function f("
  // "export { ... };"  and  "export default ...;"  →  dropped entirely
  src = src
    .split("\n")
    .map((line) => {
      // Drop bare export { } and export default statements
      if (/^\s*export\s*\{/.test(line)) return null;
      if (/^\s*export\s+default\s/.test(line)) return null;
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

// 3. Bootstrap — reads story JSON, starts game loop
const bootstrap = `
// ---- Aqlamna standalone bootstrap -----------------------------------------
(function () {
  var storyEl = document.getElementById("qalam-story");
  if (!storyEl) return;
  var story = JSON.parse(storyEl.textContent);
  var engine = new Engine(story);
  var root = document.getElementById("qalam-player");
  if (!root) return;

  function render(scene) {
    renderScene(root, scene, story.title, {
      onChoice: function (choiceId) {
        var next = engine.choose(choiceId);
        render(next);
      },
      onRestart: function () {
        engine = new Engine(story);
        render(engine.start());
      },
      onSave: function () {
        try {
          saveToLocalStorage(story.title || "قصة", engine.getState());
          return "تم الحفظ";
        } catch (e) {
          return "تعذّر الحفظ";
        }
      },
      onLoad: function () {
        try {
          var saved = loadFromLocalStorage(story.title || "قصة");
          if (saved) {
            engine.loadState(saved);
            render(engine.start());
            return "تم التحميل";
          }
          return "لا يوجد حفظ محفوظ";
        } catch (e) {
          return "تعذّر التحميل";
        }
      },
    });
  }

  render(engine.start());
})();
`;

// 4. Wrap everything in an IIFE (the bootstrap already is one, but wrap the
//    runtime code too so nothing leaks to global scope)
const wrapped =
  "(function () {\n" + combined + "\n" + bootstrap + "\n})();\n";

writeFileSync(outFile, wrapped, "utf-8");
console.log("[build-runtime] Wrote " + outFile + " (" + wrapped.length + " bytes)");
