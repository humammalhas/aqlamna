// ---------------------------------------------------------------------------
// artifact-provenance.mjs — ONE provenance format, shared by every generator
// that reads a source-of-truth document and writes a generated artifact.
//
// The invariant this exists to serve is stated in scripts/artifacts.manifest.mjs.
// Read it there; it is written down once and nowhere else.
//
// Why this file exists: `packages/linter/dist/generated/rules.json` sat on disk
// for 27 hours after its producer stopped writing it. It parsed perfectly and
// answered every question with stale data, because an artifact that does not
// say where it came from cannot be caught lying. Two generators read
// ARABIC_MASTERY.md today and a third will tomorrow; all of them emit the same
// block, so scripts/check-artifacts.mjs needs to understand exactly one format.
//
// The md5 is the field that matters. mtimes lie across copies, checkouts and
// mounts — content does not. `sourceModified` is recorded for humans reading a
// diff; `sourceMd5` is what the gate compares.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repository root — the path every recorded path is relative to. */
export const REPO_ROOT = resolve(__dirname, "..");

export const PROVENANCE_BEGIN = "AQLAMNA-PROVENANCE";
export const PROVENANCE_END = "END AQLAMNA-PROVENANCE";

/** md5 of a buffer or string. The one field mtimes cannot fake. */
export function md5(data) {
  return createHash("md5").update(data).digest("hex");
}

/** md5 of a file's bytes. */
export function md5File(path) {
  return md5(readFileSync(path));
}

/** Repo-relative, forward-slashed, so the recorded path is stable on Windows. */
export function repoPath(absPath) {
  return relative(REPO_ROOT, absPath).split(sep).join("/");
}

/**
 * Build the provenance record for one generated artifact.
 *
 * @param {object} opts
 * @param {string} opts.generator  absolute path of the script doing the writing
 * @param {string} opts.artifact   absolute path of the file being written
 * @param {string} opts.source     absolute path of the source-of-truth document
 * @param {string} [opts.sourceText] source contents, if already read (avoids a
 *        second read AND guarantees the hash matches the bytes actually used)
 */
export function buildProvenance({ generator, artifact, source, sourceText }) {
  const bytes = sourceText === undefined ? readFileSync(source) : Buffer.from(sourceText, "utf-8");
  return {
    generator: repoPath(generator),
    generatedAt: new Date().toISOString(),
    artifact: repoPath(artifact),
    source: repoPath(source),
    sourceModified: statSync(source).mtime.toISOString(),
    sourceMd5: md5(bytes),
  };
}

/**
 * Render a provenance record as a comment block for a `.ts` / `.js` artifact.
 * Machine-readable: the body between the markers is JSON with `// ` stripped.
 */
export function provenanceComment(prov) {
  const json = JSON.stringify(prov, null, 2)
    .split("\n")
    .map((l) => `// ${l}`)
    .join("\n");
  return [
    `// ── ${PROVENANCE_BEGIN} ${"─".repeat(50)}`,
    "// Machine-readable. Verified by scripts/check-artifacts.mjs. Do not hand-edit.",
    json,
    `// ── ${PROVENANCE_END} ${"─".repeat(46)}`,
  ].join("\n");
}

/**
 * Read a provenance record back out of an artifact's text.
 * Returns null when the artifact carries no block — which the gate treats as a
 * failure, not as "fine". An artifact that cannot be audited is the bug.
 */
export function parseProvenance(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.includes(PROVENANCE_BEGIN) && !l.includes(PROVENANCE_END));
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && l.includes(PROVENANCE_END));
  if (end === -1) return null;

  const body = lines
    .slice(start + 1, end)
    .filter((l) => /^\s*\/\/\s*[{}"]/.test(l))
    .map((l) => l.replace(/^\s*\/\/ ?/, ""))
    .join("\n");

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** Convenience: read an artifact file and return its provenance record. */
export function readProvenance(artifactPath) {
  return parseProvenance(readFileSync(artifactPath, "utf-8"));
}

/**
 * Write a generated artifact, but only when something other than `generatedAt`
 * actually changed.
 *
 * `generatedAt` moves on every run by definition, so an unconditional write
 * leaves the artifact dirty in `git status` after every single build. That
 * makes "confirm every path you are about to commit is one you deliberately
 * changed" harder to obey — and the one time nobody obeyed it, a commit
 * silently reverted six of the reviewer's files. Churn is not free.
 *
 * Everything that carries meaning — the rules, the prompt, the source md5 — is
 * still compared. Only the clock is ignored.
 *
 * Returns true if the file was written.
 */
export function writeArtifactIfChanged(path, content) {
  // Every occurrence, not just the one in the provenance comment: rules.ts
  // also carries `_meta.generatedAt` inside the JSON body, and stripping only
  // the comment left the file rewriting itself on every build anyway.
  const stripClock = (s) => s.replace(/"generatedAt":\s*"[^"]*"/g, '"generatedAt":""');
  if (existsSync(path) && stripClock(readFileSync(path, "utf-8")) === stripClock(content)) {
    return false;
  }
  writeFileSync(path, content, "utf-8");
  return true;
}
