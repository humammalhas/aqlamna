// ---------------------------------------------------------------------------
// The author's name — on the page and in the document.
//
// `مؤلف:` has been in the language since Phase 1 and the visual writer has a
// field for it, but nothing ever rendered it: the compiler put `author` in the
// JSON and the renderer drew the title and nothing else. An author typed their
// name, exported, and their name was nowhere in the file they were about to
// send to somebody.
//
// Driven through the SHIPPED bundle, extracted from an exported .html.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeStubEnv, collectText, type FakeNode } from "./dom-stub.js";

const _filename = fileURLToPath(import.meta.url);
const PKG_DIR = join(dirname(_filename), "..");
const ROOT = join(PKG_DIR, "..", "..");
const PERFUME = join(ROOT, "stories", "العطر_المفقود.qalam");
const NO_AUTHOR = join(ROOT, "packages", "core", "tests", "fixtures", "03_variables.qalam");
const TMP_HTML = join(PKG_DIR, "examples", "_byline.tmp.html");

beforeAll(() => {
  execSync("node scripts/build-runtime.mjs", { cwd: PKG_DIR, stdio: "pipe" });
}, 60000);

function exportQalam(source: string): string {
  execSync(`node scripts/cli.mjs "${source}" -o "${TMP_HTML}"`, {
    cwd: PKG_DIR,
    stdio: "pipe",
  });
  const html = readFileSync(TMP_HTML, "utf-8");
  unlinkSync(TMP_HTML);
  return html;
}

function runBundle(html: string): FakeNode {
  const scripts = html.match(/<script>\n([\s\S]*?)\n<\/script>/g);
  if (!scripts) throw new Error("no runtime <script> in export");
  const js = scripts[scripts.length - 1]!.replace(/<\/?script>/g, "").trim();
  const story = JSON.parse(
    html.match(/<script id="qalam-story" type="application\/json">([\s\S]*?)<\/script>/)![1]!,
  );
  const env = makeStubEnv(story);
  new Function("document", "localStorage", js)(env.document, env.localStorage);
  return env.player;
}

/** The `.aq-story` wrapper's direct children, as "tag.class". */
function header(player: FakeNode): FakeNode[] {
  return player.children[0]!.children;
}

describe("byline", () => {
  it("a story with مؤلف shows بقلم under its title", () => {
    const player = runBundle(exportQalam(PERFUME));
    const kids = header(player);

    const title = kids.find((c) => c._tag === "h1");
    const byline = kids.find((c) => c.className === "aq-byline");

    expect(title, `header: ${kids.map((c) => c._tag + "." + c.className).join(" · ")}`)
      .toBeDefined();
    expect(byline, `header: ${kids.map((c) => c._tag + "." + c.className).join(" · ")}`)
      .toBeDefined();

    expect(collectText(title!)).toBe("العطر المفقود");
    expect(collectText(byline!)).toBe("بقلم أقلامنا");

    // Directly under the title, and outside the prose.
    expect(kids.indexOf(byline!)).toBe(kids.indexOf(title!) + 1);
    expect(byline!._tag).toBe("p");

    // The title gives up its rule so the two read as one header block.
    expect(title!.className).toBe("aq-title aq-title-bylined");
  });

  it("it survives moving to another passage", () => {
    const player = runBundle(exportQalam(PERFUME));
    const btn = header(player)
      .flatMap((c) => c.children)
      .find((c) => c._tag === "button" && c.textContent.includes("اسأليه عن الثلاثة"));
    expect(btn).toBeDefined();
    btn!.click();

    const byline = header(player).find((c) => c.className === "aq-byline");
    expect(collectText(byline!)).toBe("بقلم أقلامنا");
  });

  it("a story with no author gets no byline and no changed title", () => {
    const player = runBundle(exportQalam(NO_AUTHOR));
    const kids = header(player);

    expect(kids.some((c) => c.className === "aq-byline")).toBe(false);
    expect(kids.find((c) => c._tag === "h1")!.className).toBe("aq-title");
  });

  it("the exported document carries the author in its head, and the CSS in every theme", () => {
    const html = exportQalam(PERFUME);
    expect(html).toContain('<meta name="author" content="أقلامنا">');
    expect((html.match(/\.aq-byline\s*\{/g) ?? []).length).toBe(3);
    expect((html.match(/\.aq-title-bylined\s*\{/g) ?? []).length).toBe(3);

    // …and a story with no author does not get an empty tag.
    expect(exportQalam(NO_AUTHOR)).not.toContain('name="author"');
  });
});
