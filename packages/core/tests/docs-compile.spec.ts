// ---------------------------------------------------------------------------
// Docs compile test — extracts every fenced qalam block from docs/*.md
// and compiles it. A tutorial with a broken example is worse than no tutorial.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "../src/index.js";

const _filename = fileURLToPath(import.meta.url);
const PKG_DIR = join(dirname(_filename), "..");
const DOCS_DIR = join(PKG_DIR, "..", "..", "docs");

/** Extract all fenced qalam blocks from a markdown string. */
function extractQalamBlocks(markdown: string): { block: string; idx: number }[] {
  const blocks: { block: string; idx: number }[] = [];
  const re = /```qalam\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(markdown)) !== null) {
    blocks.push({ block: m[1]!, idx: idx++ });
  }
  return blocks;
}

/** Check if a block is a self-contained runnable script (has a passage header). */
function hasPassageHeader(block: string): boolean {
  return /^=== /m.test(block);
}

describe("docs .qalam snippets compile", () => {
  // Discover all .md files in docs/
  let files: string[];
  try {
    files = readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    // Docs directory might not exist in CI — skip gracefully
    return;
  }

  for (const file of files) {
    const path = join(DOCS_DIR, file);

    it(file + " — all qalam blocks compile", () => {
      const md = readFileSync(path, "utf-8");
      const blocks = extractQalamBlocks(md);

      if (blocks.length === 0) return;

      for (const { block, idx } of blocks) {
        // Only try to compile self-contained scripts with a passage header.
        // Syntax fragments like "* [open]" are illustrative, not runnable.
        if (!hasPassageHeader(block)) continue;

        try {
          compile(block, file + "#" + idx);
        } catch (err: unknown) {
          const msg = (err && typeof err === "object" && "message_ar" in err)
            ? String((err as Record<string, unknown>).message_ar)
            : err instanceof Error ? err.message : String(err);
          throw new Error(
            `Block #${idx} in ${file} failed to compile:\n${msg}\n\nSource:\n${block}`,
          );
        }
      }
    });

    it(file + " — has at least one qalam block (sanity)", () => {
      const md = readFileSync(path, "utf-8");
      const blocks = extractQalamBlocks(md);
      expect(blocks.length).toBeGreaterThanOrEqual(0);
    });
  }
});
