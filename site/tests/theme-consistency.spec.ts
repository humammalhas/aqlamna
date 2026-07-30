// site/tests/theme-consistency.spec.ts
// Verify the site CSS and runtime light theme use the same colour values.
// A change in one without the other fails this test.

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readHexValues(filePath: string) {
  const content = readFileSync(filePath, "utf8");
  const pairs: Record<string, string> = {};
  const re = /^\s*(#[0-9a-fA-F]{6})\b/gm;
  let m: RegExpExecArray | null;
  // Just collect unique hex values for comparison
  const hexes = new Set<string>();
  while ((m = re.exec(content)) !== null) {
    hexes.add(m[1].toUpperCase());
  }
  return hexes;
}

const siteCss = resolve(__dirname, "..", "..", "assets", "aqlamna.css");
const runtimeLight = resolve(__dirname, "..", "..", "..", "packages", "runtime", "src", "themes", "light.css");

test("site stylesheet exists", () => {
  const hexes = readHexValues(siteCss);
  expect(hexes.size).toBeGreaterThan(0);
});

test("runtime light theme exists", () => {
  const hexes = readHexValues(runtimeLight);
  expect(hexes.size).toBeGreaterThan(0);
});

test("colour values match between site CSS and runtime light theme", () => {
  const siteValues = readHexValues(siteCss);
  const runtimeValues = readHexValues(runtimeLight);

  // The key colours must match
  const keys = ["#F6F1E7", "#EFE8DA", "#D8CEBB", "#2B2721", "#5A5346", "#1F3A5F"];
  for (const k of keys) {
    expect(siteValues.has(k), `site CSS missing ${k}`).toBe(true);
    expect(runtimeValues.has(k), `runtime light theme missing ${k}`).toBe(true);
  }
});
