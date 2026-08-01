// scripts/check-doc-examples.mjs — compile every ```qalam block in docs/*.md.
//
// The docs print code a reader copies. A block that does not compile teaches a
// mistake, and nothing was checking: `lint-docs-arabic.mjs` reads these fences
// for Arabic quality but never asks the compiler whether they are valid.
//
// Some blocks are fragments on purpose (a passage body with no header, a single
// `~` line). Those are wrapped in a minimal passage before compiling — the same
// trick `packages/editor/src/lib/ai.ts` uses to validate an AI fragment.
//
// Blocks that demonstrate an ERROR are skipped: `docs/الأخطاء.md` prints broken
// code deliberately, and its fences are plain ``` for exactly that reason —
// only ```qalam blocks are checked, which in that file are the fixed versions.
//
// Usage: node scripts/check-doc-examples.mjs   (npm run check:doc-examples)

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const corePath = join(root, "packages", "core", "dist", "index.js");
const { compile } = await import(pathToFileURL(corePath).href);

/**
 * Compile one fence, allowing the two things a REFERENCE fragment may fairly
 * leave out, and nothing else:
 *
 *   - a variable it uses but does not declare — `{نقاط > ٥: …}` is a complete
 *     illustration of a condition and an incomplete story;
 *   - a divert target defined in a different fence — `-> اسم_المقطع`.
 *
 * Both are supplied here rather than relaxed away, so every OTHER mistake still
 * fails. That distinction is the point: it is what caught `* افتح الباب`, a
 * bracket-less choice this reference documented and the parser has never
 * accepted.
 *
 * Returns the error object, or null when the fence is fine.
 */
function compileFragment(body, file) {
  let source = body;
  if (!/^===\s/m.test(source)) {
    // Wrap a bodyless fragment in a passage — but AFTER its own declarations,
    // which the language requires before the first `===`.
    const lines = source.split("\n");
    let i = 0;
    while (
      i < lines.length &&
      (lines[i].trim() === "" ||
        // NOT `\b` after the keyword. `\b` is an ASCII word boundary and `\w`
        // is [A-Za-z0-9_], so there is no boundary between an Arabic letter and
        // a space and this matched nothing — the same bug that once stopped
        // `-> نهاية` being recognised as an ending on the landing-page map.
        /^\s*(?:متغير|VAR|قائمة|LIST|صورة|image|أسلوب_الصور|image_style|عنوان|TITLE|مؤلف|AUTHOR|لغة|LANGUAGE)(?=\s|$)/.test(lines[i]))
    ) i++;
    source = [...lines.slice(0, i), "=== مقطع_تجريبي ===", ...lines.slice(i)].join("\n");
  }

  // Declare anything assigned or tested, typed from how it is used.
  const declared = new Set([...source.matchAll(/^\s*(?:متغير|قائمة)\s+(\S+)/gm)].map((m) => m[1]));
  const decls = [];
  const seen = new Set();
  const note = (name, init) => {
    if (declared.has(name) || seen.has(name)) return;
    seen.add(name);
    decls.push(`متغير ${name} = ${init}`);
  };
  for (const m of source.matchAll(/^\s*~\s*(\S+)\s*=\s*(.+)$/gm)) {
    const rhs = m[2].trim();
    note(m[1], /^(صح|خطأ)$/.test(rhs) ? "خطأ" : /^"/.test(rhs) ? '""' : "٠");
  }
  for (const m of source.matchAll(/\{\s*(?:لا\s+)?([^\s:}<>=!]+)/g)) note(m[1], "٠");
  if (decls.length > 0) source = `${decls.join("\n")}\n\n${source}`;

  // Stub any divert target the fence does not define.
  const defined = new Set([...source.matchAll(/^===\s+(.+?)\s+===/gm)].map((m) => m[1].trim()));
  const stubs = new Set();
  // `->->` (tunnel return) and the second arrow of `-> نفق ->` are not targets.
  // Requiring an identifier START character is what tells them apart.
  for (const m of source.matchAll(/->\s*([ؠ-ۿA-Za-z_][^\s>]*)/g)) {
    const t = m[1].trim();
    if (!defined.has(t) && !["نهاية", "END", "تابع", "DONE"].includes(t)) stubs.add(t);
  }
  for (const t of stubs) source += `\n\n=== ${t} ===\nنصّ.\n`;

  try {
    compile(source, file);
    return null;
  } catch (err) {
    return err;
  }
}

const files = readdirSync(join(root, "docs")).filter((f) => f.endsWith(".md"));

let checked = 0;
const failures = [];

for (const file of files) {
  const src = readFileSync(join(root, "docs", file), "utf-8");
  const lines = src.split("\n");

  let open = null;
  let buf = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (open === null) {
      if (line.trim() === "```qalam") { open = i + 1; buf = []; }
      continue;
    }
    if (line.trim() === "```") {
      checked++;
      const err = compileFragment(buf.join("\n"), file);
      if (err) {
        failures.push({
          file,
          line: open,
          code: err.code ?? "?",
          message: err.message_ar ?? String(err.message ?? err),
        });
      }
      open = null;
      continue;
    }
    buf.push(line);
  }
}

// A checker that checks nothing passes trivially — the same failure mode
// lint-colors.mjs guards against with its zero-files check.
if (checked === 0) {
  console.error("check-doc-examples: found 0 ```qalam blocks — nothing was checked.");
  process.exit(1);
}

if (failures.length > 0) {
  console.error(`${failures.length} of ${checked} qalam example(s) do not compile:\n`);
  for (const f of failures) {
    console.error(`  ${f.file}:${f.line}  [${f.code}] ${f.message}`);
  }
  process.exit(1);
}

console.log(`check-doc-examples: ${checked} qalam example(s) in ${files.length} file(s), all compile`);
