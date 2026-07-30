// ---------------------------------------------------------------------------
// Aqlamna standalone HTML exporter
//
// exportStandalone(storyJson) → complete HTML string ready to save as .html
// Output opens from file:// with zero network requests and zero imports.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { StoryJSON } from "./types.js";

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

/** Path to the built runtime JS bundle (relative to this compiled file in dist/). */
const RUNTIME_BUNDLE = join(_dirname, "aqlamna-runtime.js");

export type PlayerTheme = "dark" | "light" | "book";

/**
 * Read a theme CSS file from src/themes/.
 * Falls back to DARK_THEME_DEFAULT if the file is missing.
 */
function readThemeCss(theme: PlayerTheme): string {
  const themePath = join(_dirname, "..", "src", "themes", `${theme}.css`);
  try {
    return readFileSync(themePath, "utf-8");
  } catch {
    // In dist/, the path resolves differently — fall back to the inlined default
    if (theme === "dark") return DARK_THEME_DEFAULT;
    return readThemeCss("dark");
  }
}

// ---------------------------------------------------------------------------
// Dark theme CSS — inlined at build time as the default fallback.
// This is the same as src/themes/dark.css.
// ---------------------------------------------------------------------------
const DARK_THEME_DEFAULT = `
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

/**
 * Produce a standalone HTML file that plays the given compiled story.
 *
 * The output is a single self-contained .html file:
 *   - <!DOCTYPE html><html lang="ar" dir="rtl">
 *   - theme CSS inlined in <style>
 *   - story JSON inlined in <script id="qalam-story" type="application/json">
 *   - runtime engine inlined in a plain <script> (no type="module", no imports)
 *
 * @param storyJson  Compiled story JSON (the output of @aqlamna/core's compile())
 * @returns          Complete HTML document as a string.
 */
export function exportStandalone(storyJson: StoryJSON): string {
  const css = DARK_THEME_CSS.trim();
  const runtimeJs = readFileSync(RUNTIME_BUNDLE, "utf-8");
  // Encode so "</script>" in the story cannot break out of the tag
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
    css,
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

function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}
