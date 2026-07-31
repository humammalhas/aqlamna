// ---------------------------------------------------------------------------
// check-artifacts.mjs — enforce the invariant in scripts/artifacts.manifest.mjs.
//
//   1. FRESHNESS  every provenanced artifact records the md5 of its source.
//                 Recompute it. Mismatch = the source moved and the artifact
//                 did not.
//   2. ORPHANS    every generator declares its outputs. Enumerate each build
//                 directory. Anything unclaimed has no producer.
//   3. STALENESS  a compiled output whose source is newer than it. mtime-based,
//                 because a compiled file does not contain its source's bytes.
//
// Runs BEFORE the linter steps in `npm test` — there is no point linting with
// rules you have not verified.
//
// Usage: node scripts/check-artifacts.mjs
// ---------------------------------------------------------------------------

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { resolve, join, relative, sep } from "node:path";
import { createRequire } from "node:module";

import { REPO_ROOT, md5, readProvenance } from "./artifact-provenance.mjs";
import {
  INVARIANT,
  PROVENANCED_ARTIFACTS,
  BUILD_DIRS,
  STALENESS,
  RETIRED,
} from "./artifacts.manifest.mjs";

const require = createRequire(import.meta.url);

const failures = [];
const notes = [];

const fail = (msg) => failures.push(msg);
const abs = (p) => resolve(REPO_ROOT, p);
const rel = (p) => relative(REPO_ROOT, p).split(sep).join("/");
const mtime = (p) => statSync(p).mtimeMs;
const iso = (p) => new Date(statSync(p).mtimeMs).toISOString();

/** Every file under a directory, repo-relative, forward-slashed. */
function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(relative(base, full).split(sep).join("/"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Freshness — the md5 inside the artifact vs the source's bytes today
// ---------------------------------------------------------------------------

console.log("── freshness ────────────────────────────────────────────────");

for (const entry of PROVENANCED_ARTIFACTS) {
  const artifactPath = abs(entry.artifact);

  if (!existsSync(artifactPath)) {
    fail(`MISSING ARTIFACT  ${entry.artifact}\n    declared in the manifest, produced by ${entry.generator}, not on disk.\n    Rebuild:  ${entry.rebuild}`);
    continue;
  }

  const prov = readProvenance(artifactPath);
  if (!prov) {
    fail(`NO PROVENANCE  ${entry.artifact}\n    carries no AQLAMNA-PROVENANCE block, so it cannot be audited.\n    Rebuild:  ${entry.rebuild}`);
    continue;
  }

  if (prov.source !== entry.source) {
    fail(`WRONG SOURCE  ${entry.artifact}\n    manifest says its source is ${entry.source}\n    artifact says     ${prov.source}`);
    continue;
  }

  const sourcePath = abs(prov.source);
  if (!existsSync(sourcePath)) {
    fail(`MISSING SOURCE  ${entry.artifact} records source ${prov.source}, which does not exist.`);
    continue;
  }

  const actualMd5 = md5(readFileSync(sourcePath));
  if (actualMd5 !== prov.sourceMd5) {
    fail(
      `STALE  ${entry.artifact}\n` +
        `    source   ${prov.source}\n` +
        `    recorded md5  ${prov.sourceMd5}   (source as of ${prov.sourceModified})\n` +
        `    actual   md5  ${actualMd5}   (source as of ${iso(sourcePath)})\n` +
        `    ${prov.source} changed and ${entry.artifact} was not rebuilt.\n` +
        `    Rebuild:  ${entry.rebuild}`,
    );
    continue;
  }

  console.log(`  ok  ${entry.artifact}`);
  console.log(`        ← ${prov.source}  md5 ${prov.sourceMd5}  generated ${prov.generatedAt}`);
}

// Every provenanced artifact must use the SAME block shape. One auditable
// artifact and one unauditable one is how this went wrong the first time.
{
  const shapes = new Set();
  for (const entry of PROVENANCED_ARTIFACTS) {
    const p = abs(entry.artifact);
    if (!existsSync(p)) continue;
    const prov = readProvenance(p);
    if (prov) shapes.add(Object.keys(prov).sort().join(","));
  }
  if (shapes.size > 1) {
    fail(
      `PROVENANCE SHAPES DIFFER — every generator must emit identical fields:\n` +
        [...shapes].map((s) => `      ${s}`).join("\n"),
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Orphans — enumerate each build directory, subtract every claim
// ---------------------------------------------------------------------------

console.log("\n── orphans ──────────────────────────────────────────────────");

/**
 * The set of files a tsconfig's compilation produces, asked of TypeScript's own
 * config parser rather than a reimplemented glob. `exclude` is therefore exact.
 */
function tscOutputs(tsconfigRel) {
  const ts = require(resolve(REPO_ROOT, "node_modules", "typescript"));
  const configPath = abs(tsconfigRel);
  const pkgDir = resolve(configPath, "..");

  const { config, error } = ts.readConfigFile(configPath, (p) => readFileSync(p, "utf-8"));
  if (error) throw new Error(`cannot read ${tsconfigRel}: ${error.messageText}`);

  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, pkgDir);
  const { outDir, rootDir, declaration, declarationMap, sourceMap } = parsed.options;

  const outs = new Set();
  for (const file of parsed.fileNames) {
    if (file.endsWith(".d.ts")) continue; // declaration inputs emit nothing
    const stem = relative(rootDir, file).replace(/\.tsx?$/, "");
    const base = relative(outDir, resolve(outDir, stem)).split(sep).join("/");
    outs.add(`${base}.js`);
    if (sourceMap) outs.add(`${base}.js.map`);
    if (declaration) outs.add(`${base}.d.ts`);
    if (declarationMap) outs.add(`${base}.d.ts.map`);
  }
  return outs;
}

for (const spec of BUILD_DIRS) {
  const dirAbs = abs(spec.dir);
  if (!existsSync(dirAbs)) {
    console.log(`  --  ${spec.dir}  (absent — nothing to sweep)`);
    continue;
  }

  const present = walk(dirAbs);
  const claimed = new Map(); // path → claiming producer

  // A retired file is claimed only in the sense that the owner has been told
  // about it. It is reported by name below, every run, until he decides.
  for (const r of RETIRED) {
    if (r.path.startsWith(`${spec.dir}/`)) {
      claimed.set(r.path.slice(spec.dir.length + 1), "RETIRED — no producer, awaiting deletion");
    }
  }

  for (const claim of spec.claims) {
    if (claim.kind === "tsc") {
      const producer = `tsc (${claim.tsconfig})`;
      for (const p of tscOutputs(claim.tsconfig)) claimed.set(p, producer);
    } else if (claim.kind === "explicit" || claim.kind === "source") {
      const producer = claim.kind === "source" ? "hand-authored source (declared)" : claim.producer;
      for (const p of claim.paths) claimed.set(p, producer);
    } else if (claim.kind === "mirror") {
      // A mirror claims everything under it — but only while the wipe it
      // relies on is real. Verify the proof before honouring the claim.
      if (claim.assertFileLacks) {
        const [file, needle] = claim.assertFileLacks;
        const text = readFileSync(abs(file), "utf-8");
        if (text.includes(needle)) {
          fail(
            `MIRROR CLAIM UNPROVEN  ${spec.dir}\n` +
              `    claimed as self-cleaning by: ${claim.producer}\n` +
              `    but ${file} now mentions "${needle}" — the wipe may be disabled,\n` +
              `    which means fossils can survive there. Re-check the claim.`,
          );
        }
      }
      const prefix = claim.subdir ? `${claim.subdir}/` : "";
      for (const p of present) {
        if (p.startsWith(prefix)) claimed.set(p, `${claim.producer} (mirror, wiped each build)`);
      }
    } else {
      throw new Error(`unknown claim kind "${claim.kind}" in ${spec.dir}`);
    }
  }

  const orphans = present.filter((p) => !claimed.has(p));
  if (orphans.length === 0) {
    console.log(`  ok  ${spec.dir}  — ${present.length} file(s), all claimed`);
  } else {
    fail(
      `ORPHANS in ${spec.dir} — ${orphans.length} file(s) no producer claims:\n` +
        orphans
          .map((p) => `      ${spec.dir}/${p}   (${statSync(join(dirAbs, p)).size} bytes, ${iso(join(dirAbs, p))})`)
          .join("\n") +
        `\n    Either a generator stopped writing it, or a new output is undeclared.\n` +
        `    Declare it in scripts/artifacts.manifest.mjs, or delete it — but not neither.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Staleness — mtime, for outputs no hash can vouch for
// ---------------------------------------------------------------------------

console.log("\n── staleness (dist vs src) ──────────────────────────────────");

/** Newest mtime under a set of paths, or -Infinity if none exist. */
function newestUnder(paths) {
  let newest = -Infinity;
  let which = null;
  for (const p of paths) {
    const a = abs(p);
    if (!existsSync(a)) continue;
    const files = statSync(a).isDirectory() ? walk(a).map((f) => join(a, f)) : [a];
    for (const f of files) {
      const m = mtime(f);
      if (m > newest) {
        newest = m;
        which = rel(f);
      }
    }
  }
  return { newest, which };
}

for (const spec of STALENESS) {
  if (spec.kind === "tsc") {
    const dirAbs = abs(spec.dir);
    if (!existsSync(dirAbs)) {
      console.log(`  --  ${spec.dir}  (absent)`);
      continue;
    }
    const ts = require(resolve(REPO_ROOT, "node_modules", "typescript"));
    const configPath = abs(spec.tsconfig);
    const { config } = ts.readConfigFile(configPath, (p) => readFileSync(p, "utf-8"));
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, resolve(configPath, ".."));
    const { outDir, rootDir } = parsed.options;

    const stale = [];
    for (const src of parsed.fileNames) {
      if (src.endsWith(".d.ts")) continue;
      const outJs = resolve(outDir, relative(rootDir, src).replace(/\.tsx?$/, ".js"));
      if (!existsSync(outJs)) {
        stale.push(`${rel(outJs)} missing — ${rel(src)} was never compiled`);
        continue;
      }
      if (mtime(outJs) < mtime(src)) {
        stale.push(`${rel(outJs)} (${iso(outJs)}) is older than ${rel(src)} (${iso(src)})`);
      }
    }
    if (stale.length) {
      fail(`STALE BUILD  ${spec.dir}\n` + stale.map((s) => `      ${s}`).join("\n") + `\n    Run:  npm run build:all`);
    } else {
      console.log(`  ok  ${spec.dir}  — every output newer than its source`);
    }
  } else if (spec.kind === "newest") {
    const s = newestUnder(spec.src);
    const o = newestUnder(spec.out);
    if (s.which === null || o.which === null) {
      console.log(`  --  ${spec.label}  (one side absent)`);
      continue;
    }
    if (o.newest < s.newest) {
      fail(
        `STALE BUILD  ${spec.label}\n` +
          `      newest output ${o.which} (${new Date(o.newest).toISOString()})\n` +
          `      is older than ${s.which} (${new Date(s.newest).toISOString()})\n` +
          `    Run:  npm run build:all`,
      );
    } else {
      console.log(`  ok  ${spec.label}`);
    }
  } else if (spec.kind === "contains") {
    const needlePath = abs(spec.needle);
    if (!existsSync(needlePath)) {
      fail(`STALE BUILD  ${spec.label}\n      ${spec.needle} does not exist`);
      continue;
    }
    const needle = readFileSync(needlePath, "utf-8").trim();
    const bad = [];
    for (const h of spec.haystacks) {
      const hp = abs(h);
      if (!existsSync(hp)) {
        bad.push(`${h} does not exist`);
        continue;
      }
      if (!readFileSync(hp, "utf-8").includes(needle)) {
        bad.push(`${h} does not contain the current ${spec.needle} (md5 ${md5(needle)})`);
      }
    }
    if (bad.length) {
      fail(`NOT RE-EXPORTED  ${spec.label}\n` + bad.map((s) => `      ${s}`).join("\n") + `\n    Run:  npm run build:all`);
    } else {
      console.log(`  ok  ${spec.label}`);
    }
  } else if (spec.kind === "identical") {
    const bad = [];
    for (const [a, b] of spec.pairs) {
      const pa = abs(a);
      const pb = abs(b);
      if (!existsSync(pa) || !existsSync(pb)) {
        bad.push(`${!existsSync(pa) ? a : b} does not exist`);
        continue;
      }
      const ha = md5(readFileSync(pa));
      const hb = md5(readFileSync(pb));
      if (ha !== hb) bad.push(`${a} (md5 ${ha}) != ${b} (md5 ${hb})`);
    }
    if (bad.length) {
      fail(`COPIES DIVERGED  ${spec.label}\n` + bad.map((s) => `      ${s}`).join("\n") + `\n    Run:  npm run build:all`);
    } else {
      console.log(`  ok  ${spec.label}`);
    }
  } else if (spec.kind === "perFile") {
    const stale = [];
    for (const [src, out] of spec.pairs) {
      const a = abs(src);
      const b = abs(out);
      if (!existsSync(a) || !existsSync(b)) {
        stale.push(`${!existsSync(a) ? src : out} does not exist`);
        continue;
      }
      if (mtime(b) < mtime(a)) {
        stale.push(`${out} (${iso(b)}) is older than ${src} (${iso(a)})`);
      }
    }
    if (stale.length) {
      fail(`STALE BUILD  ${spec.label}\n` + stale.map((s) => `      ${s}`).join("\n") + `\n    Run:  npm run build:all`);
    } else {
      console.log(`  ok  ${spec.label}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Retired files — named every run so they cannot go quiet
// ---------------------------------------------------------------------------

const stillThere = RETIRED.filter((r) => existsSync(abs(r.path)));
if (stillThere.length) {
  console.log("\n── retired, awaiting the owner's decision (hard rule 8) ─────");
  for (const r of stillThere) {
    console.log(`  ??  ${r.path}`);
    console.log(`        no producer writes it any more; superseded by ${r.supersededBy}`);
  }
  notes.push(`${stillThere.length} retired file(s) still on disk — see above.`);
}

// ---------------------------------------------------------------------------
// Summary — the numbers this run actually used
// ---------------------------------------------------------------------------

console.log("\n── summary ──────────────────────────────────────────────────");
console.log(`  invariant: ${INVARIANT}`);

/** Read the rules object back out of the generated TypeScript module. */
function readRules() {
  const text = readFileSync(abs("packages/linter/src/generated/rules.ts"), "utf-8");
  const open = text.indexOf("{", text.indexOf("const rules"));
  const close = text.lastIndexOf(" as const;");
  if (open === -1 || close === -1) return null;
  try {
    return JSON.parse(text.slice(open, close));
  } catch {
    return null;
  }
}

const rules = readRules();
if (rules) {
  const c = rules._meta.counts;
  const empty = rules.rules.filter((r) => !r.messageAr || !String(r.messageAr).trim()).length;
  console.log(
    `  linter rules in use: ${c.total} total — ${c.pair} pair, ${c.pattern} pattern, ${c.advisory} advisory; ${empty} with no message`,
  );
} else {
  fail("Could not read the rules object out of packages/linter/src/generated/rules.ts.");
}

const promptPath = abs("packages/editor/src/generated/mastery-prompt.ts");
if (existsSync(promptPath)) {
  const promptText = readFileSync(promptPath, "utf-8");
  const promptPairs = (promptText.match(/❌ لا:/g) || []).length;
  console.log(`  correction pairs in the AI system prompt: ${promptPairs}`);
}

const corpus = abs("ARABIC_MASTERY.md");
if (existsSync(corpus)) {
  console.log(`  ARABIC_MASTERY.md md5: ${md5(readFileSync(corpus))}`);
}

for (const n of notes) console.log(`  note: ${n}`);

if (failures.length) {
  console.error(`\n✗ check-artifacts: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log("\n✓ check-artifacts: freshness, orphans and staleness all clean");
