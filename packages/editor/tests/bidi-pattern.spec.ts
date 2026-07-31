// ---------------------------------------------------------------------------
// The ASCII-run pattern exists twice: once for CodeMirror (a TypeScript module
// bundled into the editor) and once for the static site generators (a plain
// .mjs imported by build-docs and build-site). Neither can import the other.
//
// Duplication is allowed here; drift is not. If the two ever disagree, `->`
// renders correctly in one surface and backwards in the other — which is
// exactly the bug this pair was written to kill.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";

import { ASCII_RUN_SOURCE as EDITOR_PATTERN } from "../src/qalam/qalam-bidi.js";
import {
  ASCII_RUN_SOURCE as SITE_PATTERN,
  isolateAscii,
} from "../../../scripts/bidi-isolate.mjs";

describe("bidi isolation pattern", () => {
  it("is identical in the editor and in the site generators", () => {
    expect(EDITOR_PATTERN).toBe(SITE_PATTERN);
  });

  it("keeps a whole operator run in ONE isolate", () => {
    // The old plugin isolated per character, so `->` became two isolates and
    // the RTL paragraph swapped them. One span per run is the whole fix.
    expect(isolateAscii("-&gt;")).toBe('<span dir="ltr">-&gt;</span>');
    expect(isolateAscii("&gt;=")).toBe('<span dir="ltr">&gt;=</span>');
    expect(isolateAscii("-&gt;-&gt;")).toBe('<span dir="ltr">-&gt;-&gt;</span>');
    expect(isolateAscii(".qalam")).toBe('<span dir="ltr">.qalam</span>');
    expect(isolateAscii("TITLE:")).toBe('<span dir="ltr">TITLE:</span>');
  });

  it("never splits an HTML entity across two isolates", () => {
    const out = isolateAscii("&amp;&lt;&gt;&quot;");
    expect(out.match(/<span/g)?.length).toBe(1);
  });

  it("leaves Arabic alone", () => {
    expect(isolateAscii("البداية")).toBe("البداية");
    expect(isolateAscii("=== البداية ===")).toBe(
      '<span dir="ltr">===</span> البداية <span dir="ltr">===</span>',
    );
  });

});
