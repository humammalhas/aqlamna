// ---------------------------------------------------------------------------
// Browser-compatible standalone HTML export.
// Uses runtime bundle + ALL THREE theme CSS files inlined at build time via
// copy-runtime.  The exported HTML always contains every theme; the player
// can switch at runtime and the choice persists in localStorage.
// ---------------------------------------------------------------------------

import { RUNTIME_BUNDLE, DARK_THEME_CSS, LIGHT_THEME_CSS, BOOK_THEME_CSS } from "../generated/runtime-bundle.js";
import type { StoryJSON } from "@aqlamna/runtime";
import { loadImage, formatBudget, getBudgetStatus, formatBytes } from "./image-db.js";

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

/**
 * Return <style> blocks for all three themes plus the theme-switching <script>.
 * Light is enabled by default; the player can cycle and persist the choice.
 */
function buildThemeBlocks(storyKey: string): string {
  const safeKey = JSON.stringify(storyKey);
  let html = "";

  for (const name of ["light", "dark", "book"]) {
    const css = THEME_CSS[name as PlayerTheme] ?? DARK_THEME_CSS;
    const disabled = name === "light" ? "" : " disabled";
    html += `<style id="aq-theme-${name}"${disabled}>\n${css.trim()}\n</style>\n`;
  }

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

export function buildStandaloneHtml(storyJson: StoryJSON): string {
  const runtimeJs = RUNTIME_BUNDLE;

  // Prevent "</script>" in story data from breaking out of the tag
  const storyJsonText = JSON.stringify(storyJson);
  const safeJson = storyJsonText.replace(/</g, "\\u003c");

  const title = escapeHtml(storyJson.title ?? "قصة تفاعلية");
  const lang = storyJson.language === "en" ? "en" : "ar";
  const dir = storyJson.direction === "ltr" ? "ltr" : "rtl";

  // Inline all three themes with theme-switching JS
  const themeHtml = buildThemeBlocks(storyJson.title ?? "قصة");

  return [
    "<!DOCTYPE html>",
    `<html lang="${lang}" dir="${dir}">`,
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${title}</title>`,
    themeHtml,
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

// ---- Budget-aware export ---------------------------------------------------

export interface ExportResult {
  html: string | null;
  blocked: boolean;
  blockedMessage: string | null;
}

/** Inlines stored images into the story JSON and exports, checking the budget. */
export async function exportStoryForDownload(
  storyJson: StoryJSON,
  projectId: string,
): Promise<ExportResult> {
  // If the story has declared images, inline them from IndexedDB
  const images: Record<string, { alt: string; data?: string }> = {};
  const storyImages = (storyJson as unknown as Record<string, unknown>).images as
    | Record<string, { alt: string; data?: string }>
    | undefined;

  if (storyImages) {
    for (const [name, decl] of Object.entries(storyImages)) {
      const stored = await loadImage(projectId, name);
      if (stored) {
        images[name] = { alt: decl.alt, data: stored.dataUrl };
      } else {
        images[name] = { alt: decl.alt };
      }
    }
  }

  // Budget check
  const status = await getBudgetStatus(projectId);
  if (status.isBlocked) {
    const top = status.largest.slice(0, 3);
    const topNames = top.map((i) => `${i.name} (${formatBytes(i.bytes)})`).join("، ");
    return {
      html: null,
      blocked: true,
      blockedMessage:
        `لا يمكن التصدير: حجم الصور (${formatBudget(status.totalBytes)}) تجاوز الحد الأقصى (${formatBudget(2_000_000)}).\n` +
        `أكبر الصور: ${topNames}\n` +
        `احذف صورة أو أكثر من IndexedDB ثم حاول مجددًا.`,
    };
  }

  // Build story JSON with inlined images
  const exported: Record<string, unknown> = { ...storyJson };
  exported.images = images;

  const html = buildStandaloneHtml(exported as unknown as StoryJSON);
  return { html, blocked: false, blockedMessage: null };
}
