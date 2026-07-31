// ---------------------------------------------------------------------------
// lint-docs-arabic.mjs — run the ARABIC_MASTERY linter over docs/*.md.
//
// Why this exists: `packages/linter` lints TEXT tokens from the .qalam
// tokenizer, so a two-line story fixture has full coverage while `docs/*.md`
// — the most-read Arabic in the project — had none. «» shipped in
// docs/البداية.md:165 in a repo that generates 126 tests to prevent «».
//
// There was already a `packages/linter/scripts/lint-docs.mjs`. It DID find
// that line. It printed it and exited 0, and nothing ran it. A check that
// cannot fail is not a gate — see `.codewhale/constitution`, "A green test
// that cannot fail on the bug is worse than no test." This one exits 1.
//
// It also covers two things that script skipped: ```qalam fences (the story
// examples readers copy) and table cells.
//
// Lint the MARKDOWN SOURCE, never the built HTML: scripts/bidi-isolate.mjs
// wraps every printable-ASCII run in <span dir="ltr"> at build time, so any
// rule whose text contains `_` or `:` would silently never match.
//
// Usage: node scripts/lint-docs-arabic.mjs
//   npm run lint:docs-arabic
//
// Exit 1 on any `warning`. `info` is printed and does not fail, matching how
// the linter already treats the §1b.5 verb-precision rules — a table row is
// an example, not a regex, so those over-match by design.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const docsDir = join(root, "docs");

const linterDist = join(root, "packages", "linter", "dist", "index.js");
if (!existsSync(linterDist)) {
  console.error("linter dist not found — run `npm run build -w @aqlamna/linter` first");
  process.exit(1);
}
const { lint } = await import(pathToFileURL(linterDist).href);

// ---- Arabic detection ------------------------------------------------------

/** Any Arabic letter. Blocks with none are English and are never linted. */
const ARABIC = /[ء-يٱ-ۓ]/;

// ---- Markdown → lintable prose --------------------------------------------

/**
 * Strip markdown markup from one line, leaving the prose a reader sees.
 *
 * Inline code spans go first and go entirely: `صورة: الاسم` is source code
 * quoted inside a sentence, and linting it would flag the language's own
 * keywords as prose.
 */
function stripMarkdown(line) {
  let t = line;

  t = t.replace(/`[^`]*`/g, " ");           // inline code spans — drop content
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " "); // images
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // links — keep the label
  t = t.replace(/https?:\/\/\S+/g, " ");    // bare URLs
  t = t.replace(/<[^>]+>/g, " ");           // inline HTML
  t = t.replace(/^\s{0,3}#{1,6}\s+/, "");   // heading marker
  t = t.replace(/^\s*>\s?/, "");            // blockquote marker
  t = t.replace(/^\s*[-*+]\s+/, "");        // list bullet
  t = t.replace(/^\s*\d+\.\s+/, "");        // ordered list marker
  t = t.replace(/^\s*\|/, " ").replace(/\|\s*$/, " ").replace(/\|/g, " . "); // table cells → separate sentences
  t = t.replace(/\*\*([^*]*)\*\*/g, "$1");  // bold
  t = t.replace(/__([^_]*)__/g, "$1");      // bold
  t = t.replace(/\*([^*]*)\*/g, "$1");      // italic
  t = t.replace(/~~([^~]*)~~/g, "$1");      // strikethrough

  // Characters the .qalam tokenizer reads as syntax. Left in place they turn
  // a prose line into a choice, a divert or an unterminated conditional, and
  // `lint()` swallows the tokenizer error and returns zero diagnostics — the
  // line would go silently unlinted, which is the failure mode this whole
  // script exists to remove.
  t = t.replace(/[{}[\]=<>~|#]/g, " ");
  t = t.replace(/->|→|←/g, " ");

  return t.trim();
}

/**
 * Split a markdown file into lintable blocks.
 *
 * - a ```qalam fence is already .qalam and is linted verbatim, so choice text
 *   and passage prose are checked exactly as a reader would copy them
 * - every other line is stripped to prose and linted on its own, so a line
 *   the tokenizer chokes on can never blind the rest of the file
 */
function collectBlocks(content) {
  const lines = content.split(/\r?\n/);
  const blocks = [];

  let inFence = false;
  let fenceLang = "";
  let fenceBuf = [];
  let fenceFirstContentLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const fence = raw.match(/^\s*```(\w*)\s*$/);

    if (fence && !inFence) {
      inFence = true;
      fenceLang = fence[1];
      fenceBuf = [];
      fenceFirstContentLine = lineNo + 1;
      continue;
    }
    if (fence && inFence) {
      inFence = false;
      const code = fenceBuf.join("\n");
      // Only .qalam fences are real source. Untagged fences in these docs are
      // deliberate counter-examples and fragments — see the last docs pass.
      if (fenceLang === "qalam" && ARABIC.test(code)) {
        blocks.push({ kind: "qalam", source: code, baseLine: fenceFirstContentLine });
      }
      continue;
    }
    if (inFence) { fenceBuf.push(raw); continue; }

    const prose = stripMarkdown(raw);
    if (prose.length === 0 || !ARABIC.test(prose)) continue;
    blocks.push({ kind: "prose", source: `=== د ===\n${prose}`, baseLine: lineNo, offset: 2 });
  }

  return blocks;
}

// ---- Hand-written HTML -----------------------------------------------------

/**
 * The landing page is hand-written Arabic and ships to more readers than any
 * doc. It was outside the first version of this gate and it was carrying its
 * own «» — the iOS install step — which is how it earned a place here.
 *
 * Only hand-written sources belong in this list. `site/docs/*.html` is
 * generated from `docs/*.md` and is already covered at the source; adding it
 * would report every finding twice.
 */
const HTML_SOURCES = ["site/index.html"];

/**
 * Recover the text a reader sees from built HTML.
 *
 * Note the tag strip runs per line, so `<script>` bodies are NOT excluded —
 * that is deliberate. The Arabic in there is UI strings the visitor reads
 * ("لم يُثبَّت التطبيق."), and one of them was carrying a §2.4 `تمّ + مصدر`.
 *
 * The isolate spans must be UNWRAPPED, not stripped as tags: build-site.mjs
 * runs isolateAscii over injected prose, so `أسلوب_الصور` is stored as
 * `أسلوب<span dir="ltr">_</span>الصور`. Dropping the tags without rejoining
 * the runs would leave the text intact here, but splitting on the tags would
 * not — and a rule whose `bad` string spans an isolate would silently never
 * match. Same trap as the last artifact check.
 */
function htmlToBlocks(html) {
  const unwrapped = html.replace(/<span dir="ltr">([^<]*)<\/span>/g, "$1");
  const lines = unwrapped.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    let t = lines[i]
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;|&#\d+;/gi, " ")
      .replace(/[{}[\]=<>~|#]/g, " ")
      .trim();
    if (t.length === 0 || !ARABIC.test(t)) continue;
    blocks.push({ kind: "prose", source: `=== د ===\n${t}`, baseLine: i + 1, offset: 2 });
  }
  return blocks;
}

// ---- Run -------------------------------------------------------------------

const files = readdirSync(docsDir).filter((f) => f.endsWith(".md")).sort();
let warnings = 0;
let infos = 0;
let filesWithFindings = 0;

const targets = [
  ...files.map((f) => ({ label: `docs/${f}`, path: join(docsDir, f), html: false })),
  ...HTML_SOURCES.map((p) => ({ label: p, path: join(root, p), html: true })),
];

for (const target of targets) {
  const { label: file, path, html } = target;
  if (!existsSync(path)) continue;
  const content = readFileSync(path, "utf-8");
  const found = [];

  for (const block of html ? htmlToBlocks(content) : collectBlocks(content)) {
    let diags;
    try {
      diags = lint(block.source);
    } catch {
      continue;
    }
    for (const d of diags) {
      // qalam fences: block.baseLine is the fence's first content line and
      // d.line is 1-based within the fence.
      // prose: the synthetic `=== د ===` header occupies line 1, so the prose
      // itself is line 2 and maps straight back to block.baseLine.
      const line =
        block.kind === "qalam"
          ? block.baseLine + d.line - 1
          : block.baseLine + (d.line - block.offset);
      // `...d` first: the diagnostic carries its own `line`, relative to the
      // block, and it must not win over the file line computed above.
      found.push({ ...d, line, where: block.kind });
    }
  }

  if (found.length === 0) continue;
  filesWithFindings++;

  found.sort((a, b) => a.line - b.line || a.column - b.column);
  console.log(`\n${file}`);
  for (const d of found) {
    const mark = d.severity === "info" ? "info " : "WARN ";
    const sug = d.suggestion ? `  ← "${d.suggestion}"` : "";
    const where = d.where === "qalam" ? " (in a qalam fence)" : "";
    console.log(`  ${mark} ${file}:${d.line}  [${d.ruleId}]  ${d.messageAr}${sug}${where}`);
    if (d.severity === "info") infos++;
    else warnings++;
  }
}

console.log(
  `\nlint-docs-arabic: ${targets.length} file(s) checked, ` +
    `${filesWithFindings} with findings — ${warnings} warning(s), ${infos} info.`,
);

if (warnings > 0) {
  console.error(
    `\n${warnings} warning(s). Fix them, or if a rule over-matches, say so — ` +
      `do not edit ARABIC_MASTERY.md to silence it.`,
  );
  process.exit(1);
}
console.log("✓ no warnings");
