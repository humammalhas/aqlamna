// ---------------------------------------------------------------------------
// Browser-compatible standalone HTML export.
// Uses runtime bundle + theme CSS inlined at build time via copy-runtime.
// Theme is chosen at export time — only the selected theme is inlined.
// ---------------------------------------------------------------------------

import { RUNTIME_BUNDLE, DARK_THEME_CSS, LIGHT_THEME_CSS, BOOK_THEME_CSS } from "../generated/runtime-bundle.js";
import type { StoryJSON } from "@aqlamna/runtime";

export type PlayerTheme = "dark" | "light" | "book";

const THEME_CSS: Record<PlayerTheme, string> = {
  dark: DARK_THEME_CSS,
  light: LIGHT_THEME_CSS,
  book: BOOK_THEME_CSS,
};

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

export function buildStandaloneHtml(storyJson: StoryJSON, theme: PlayerTheme = "dark"): string {
  const css = THEME_CSS[theme] ?? DARK_THEME_CSS;
  const runtimeJs = RUNTIME_BUNDLE;

  // Prevent "</script>" in story data from breaking out of the tag
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

export function downloadHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
