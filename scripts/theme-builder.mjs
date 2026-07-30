// ---------------------------------------------------------------------------
// theme-builder.mjs — shared theme HTML generation for story exporters.
//
// Used by cli.mjs, build-all.mjs (rebuildNectar), and the equivalent TS in
// export-html.ts.  Inlines all three theme CSS files with theme-switching JS.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const themesDir = join(__dirname, "..", "packages", "runtime", "src", "themes");

function readTheme(name) {
  return readFileSync(join(themesDir, `${name}.css`), "utf-8");
}

const THEME_CSS = {
  light: readTheme("light"),
  dark: readTheme("dark"),
  book: readTheme("book"),
};

/**
 * Return the three <style> blocks (light enabled, others disabled) and the
 * theme-switching <script>.  storyKey should be a stable identifier for
 * localStorage (e.g. the story title).
 */
export function buildThemeBlocks(storyKey) {
  const safeKey = JSON.stringify(storyKey);

  let html = "";

  // Three theme <style> blocks — light is default, others disabled
  for (const name of ["light", "dark", "book"]) {
    const disabled = name === "light" ? "" : " disabled";
    html += `<style id="aq-theme-${name}"${disabled}>\n${THEME_CSS[name].trim()}\n</style>\n`;
  }

  // Theme-switching script — self-contained, zero globals except the hook
  html += `<script>
(function () {
  var THEMES = ["light", "dark", "book"];
  var STORY_KEY = ${safeKey};

  function getTheme() {
    try { return localStorage.getItem("aq-theme-" + STORY_KEY) || "light"; }
    catch (e) { return "light"; }
  }

  function applyTheme(name) {
    for (var i = 0; i < THEMES.length; i++) {
      var el = document.getElementById("aq-theme-" + THEMES[i]);
      if (el) el.disabled = (THEMES[i] !== name);
    }
    try { localStorage.setItem("aq-theme-" + STORY_KEY, name); }
    catch (e) {}
  }

  window.__aqlamnaCycleTheme = function () {
    var current = getTheme();
    var idx = THEMES.indexOf(current);
    var next = THEMES[(idx + 1) % THEMES.length];
    applyTheme(next);
  };

  // Apply saved theme on load
  applyTheme(getTheme());
})();
</script>`;

  return html;
}
