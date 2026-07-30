// ---------------------------------------------------------------------------
// Export tests — standalone HTML export
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const _filename = fileURLToPath(import.meta.url);
const PKG_DIR = join(dirname(_filename), "..");
const FIXTURE_QALAM = join(PKG_DIR, "..", "core", "tests", "fixtures", "03_variables.qalam");
const OUT_HTML = join(PKG_DIR, "examples", "الرحيق.html");

// Ensure runtime is built before tests
beforeAll(() => {
  execSync("node scripts/build-runtime.mjs", { cwd: PKG_DIR, stdio: "pipe" });
}, 30000);

describe("exportStandalone", () => {
  it("produces a standalone HTML file under 100 KB", async () => {
    // Build via CLI
    execSync(
      `node scripts/cli.mjs "${FIXTURE_QALAM}" -o "${OUT_HTML}"`,
      { cwd: PKG_DIR, stdio: "pipe" },
    );

    const html = readFileSync(OUT_HTML, "utf-8");

    // Size check
    const bytes = Buffer.byteLength(html, "utf-8");
    expect(bytes).toBeLessThan(100000);

    // No import statements (type="module" or bare import/export)
    expect(html).not.toMatch(/\bimport\s/);
    expect(html).not.toMatch(/\bexport\s/);

    // No network requests (no https:// references)
    expect(html).not.toMatch(/https:\/\//);

    // Structural checks
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('<script id="qalam-story" type="application/json">');
    expect(html).toContain("الرحيق");
    expect(html).toContain("اجمع الرحيق");

    // The story JSON should be valid and parseable
    const jsonMatch = html.match(
      /<script id="qalam-story" type="application\/json">([\s\S]*?)<\/script>/,
    );
    expect(jsonMatch).not.toBeNull();
    const jsonText = jsonMatch![1]!.trim();
    const parsed = JSON.parse(jsonText);
    expect(parsed.title).toBe("الرحيق");
    expect(parsed.start).toBe("البداية");
  });

  it("embed contains no type=module scripts", () => {
    const html = readFileSync(OUT_HTML, "utf-8");
    expect(html).not.toContain('type="module"');
    expect(html).not.toContain("type='module'");
  });

  it("CSS is inlined (no external stylesheet links)", () => {
    const html = readFileSync(OUT_HTML, "utf-8");
    expect(html).not.toContain('<link rel="stylesheet"');
    expect(html).toContain("<style>");
    expect(html).toContain(".aq-story");
  });
});
