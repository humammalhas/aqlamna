// site/tests/theme-consistency.spec.ts
// Verify the site CSS, runtime light theme, and editor theme all use the same
// colour values. A change in one without the others fails this test.

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readHexValues(filePath: string): Set<string> {
  const content = readFileSync(filePath, "utf8");
  const hexes = new Set<string>();
  const re = /(#[0-9a-fA-F]{6})\b/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    hexes.add(m[1].toUpperCase());
  }
  return hexes;
}

const siteCss = resolve(__dirname, "..", "..", "assets", "aqlamna.css");
const runtimeLight = resolve(__dirname, "..", "..", "..", "packages", "runtime", "src", "themes", "light.css");
const editorTheme = resolve(__dirname, "..", "..", "..", "packages", "editor", "src", "aqlamna-theme.css");

// The key palette colours shared across all three.
const KEY_COLORS = ["#F6F1E7", "#EFE8DA", "#D8CEBB", "#2B2721", "#5A5346", "#1F3A5F"];

test("site stylesheet exists and has colours", () => {
  const hexes = readHexValues(siteCss);
  expect(hexes.size).toBeGreaterThan(0);
});

test("runtime light theme exists and has colours", () => {
  const hexes = readHexValues(runtimeLight);
  expect(hexes.size).toBeGreaterThan(0);
});

test("editor theme exists and has colours", () => {
  const hexes = readHexValues(editorTheme);
  expect(hexes.size).toBeGreaterThan(0);
});

test("key colours match across site, runtime, and editor theme", () => {
  const siteValues = readHexValues(siteCss);
  const runtimeValues = readHexValues(runtimeLight);
  const editorValues = readHexValues(editorTheme);

  for (const k of KEY_COLORS) {
    expect(siteValues.has(k), `site CSS missing ${k}`).toBe(true);
    expect(runtimeValues.has(k), `runtime light theme missing ${k}`).toBe(true);
    expect(editorValues.has(k), `editor theme missing ${k}`).toBe(true);
  }
});
