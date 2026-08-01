// ---------------------------------------------------------------------------
// artifacts.manifest.mjs — the one place the build-output invariant is written
// down, and the one place every generator declares what it writes.
//
// Everything else references this file. scripts/check-artifacts.mjs enforces
// it; packages/linter/README.md points at it; the generators import the
// provenance helper that serves it.
// ---------------------------------------------------------------------------

/**
 * THE INVARIANT.
 *
 * Stated once. Do not restate it elsewhere — link here instead.
 */
export const INVARIANT =
  "A copy must never be older than the thing it was copied from, and a build " +
  "directory must contain nothing that no producer claims.";

/**
 * Why it has two halves, and why one check cannot cover both:
 *
 *   FRESHNESS — an artifact IS older than its source. Caught by comparing the
 *   md5 recorded inside the artifact against the source's current content.
 *
 *   ORPHANS — an artifact has NO source. A freshness check compares an artifact
 *   to the thing that produced it, so it is structurally blind here: there is
 *   nothing to compare against. `packages/linter/dist/generated/rules.json`
 *   lived 27 hours past its producer and fooled a full review session, because
 *   it still parsed and nothing ever asked who wrote it.
 */

// ---------------------------------------------------------------------------
// Generated artifacts that carry a provenance block
// ---------------------------------------------------------------------------

/**
 * Every artifact generated from a source-of-truth document. Each one embeds a
 * provenance block (see scripts/artifact-provenance.mjs) recording the
 * generator, the source path, the source mtime and the source md5.
 *
 * Adding a third consumer of ARABIC_MASTERY.md means adding one entry here and
 * two lines to the generator. Nothing else.
 */
export const PROVENANCED_ARTIFACTS = [
  {
    artifact: "packages/linter/src/generated/rules.ts",
    generator: "packages/linter/scripts/build-rules.mjs",
    source: "ARABIC_MASTERY.md",
    rebuild: "npm run build:rules -w @aqlamna/linter",
  },
  {
    artifact: "packages/editor/src/generated/mastery-prompt.ts",
    generator: "packages/editor/scripts/build-mastery-prompt.mjs",
    source: "ARABIC_MASTERY.md",
    rebuild: "node packages/editor/scripts/build-mastery-prompt.mjs",
  },
];

// ---------------------------------------------------------------------------
// Build directories, and who claims what inside them
// ---------------------------------------------------------------------------

/**
 * Claim kinds:
 *
 *   tsc      — outputs derived from a tsconfig. The file list comes from the
 *              TypeScript compiler's own config parser, so `exclude` is honoured
 *              exactly. That is what makes `src/export.ts` — excluded since
 *              commit 6c99553 — show its four dist files as unclaimed.
 *   explicit — a literal list of paths a named script writes.
 *   mirror   — the directory is wiped and rewritten wholesale on every build,
 *              so nothing can survive in it. The `proof` field names the code
 *              that does the wiping; a mirror claim is only honest while that
 *              is true.
 *   source   — hand-authored files that live inside a build directory. Declared
 *              deliberately: an undeclared file here is an orphan, which is the
 *              whole point.
 */
export const BUILD_DIRS = [
  {
    dir: "packages/core/dist",
    claims: [{ kind: "tsc", tsconfig: "packages/core/tsconfig.json" }],
  },
  {
    dir: "packages/linter/dist",
    claims: [{ kind: "tsc", tsconfig: "packages/linter/tsconfig.json" }],
  },
  {
    dir: "packages/runtime/dist",
    claims: [
      { kind: "tsc", tsconfig: "packages/runtime/tsconfig.json" },
      {
        kind: "explicit",
        producer: "packages/runtime/scripts/build-runtime.mjs",
        paths: ["aqlamna-runtime.js"],
      },
    ],
  },
  {
    dir: "packages/editor/dist",
    claims: [
      {
        kind: "mirror",
        producer: "vite build (packages/editor/vite.config.ts)",
        proof: "vite empties outDir on every build; vite.config.ts must not set emptyOutDir:false",
        assertFileLacks: ["packages/editor/vite.config.ts", "emptyOutDir"],
      },
    ],
  },
  {
    dir: "packages/editor/public",
    claims: [
      {
        // These were hand-copied masters — the same 472KB icon and 185KB
        // favicon the landing page served, shipped a second time under
        // /editor/. They are now derived, so there is one producer and the two
        // copies cannot drift.
        kind: "explicit",
        producer: "scripts/build-images.mjs",
        paths: ["apple-touch-icon.png", "favicon.ico", "icon-192.png", "icon-512.png"],
      },
    ],
  },
  {
    dir: "site",
    claims: [
      {
        kind: "mirror",
        producer: "scripts/build-site.mjs",
        proof: "copyDir() rmSync's site/editor before cpSync from packages/editor/dist",
        subdir: "editor",
      },
      {
        kind: "explicit",
        producer: "scripts/build-site.mjs",
        paths: ["العطر_المفقود.html", "طائرة_الورق.html"],
      },
      {
        // Derived from brand/ at the size they are actually displayed. The
        // logo used to be the 823px master served verbatim for a 132px slot.
        kind: "explicit",
        producer: "scripts/build-images.mjs",
        paths: [
          "assets/logo-132.webp",
          "assets/logo-264.webp",
          "assets/logo-132.png",
          "assets/logo-264.png",
          "assets/icon-512.png",
          "assets/icon-192.png",
          "assets/icon-32.png",
          "assets/apple-touch-icon.png",
          "assets/favicon.ico",
        ],
      },
      {
        kind: "explicit",
        producer: "scripts/build-docs.mjs",
        paths: [
          "docs/البداية.html",
          "docs/المرجع.html",
          "docs/الأخطاء.html",
          "docs/الخصوصية.html",
          "docs/الشروط.html",
          "privacy.html",
          "terms.html",
        ],
      },
      {
        kind: "source",
        note:
          "hand-authored; index.html additionally has its GLANCE and PREVIEW blocks " +
          "injected by build-site.mjs",
        paths: [
          "index.html",
          "_headers",
          "sw.js",
          "manifest.webmanifest",
          "assets/aqlamna.css",
          "playwright.config.ts",
          "tests/install.spec.ts",
          "tests/measure-lib.mjs",
          "tests/measure.mjs",
          "tests/responsive.spec.ts",
          "tests/server.mjs",
          "tests/site.spec.ts",
          "tests/theme-consistency.spec.ts",
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Staleness pairs — "a copy must never be older than the thing it was copied
// from", for outputs whose freshness cannot be proved by content hash.
// ---------------------------------------------------------------------------

/**
 * A compiled or rendered output does not contain its source's bytes, so md5
 * cannot decide whether it is current — only mtime can. mtime is weaker
 * evidence (it lies across copies, checkouts and mounts) and is used ONLY here,
 * never for the provenanced artifacts above.
 *
 *   perFile — every `src` file must be older than the `out` file derived from it
 *   newest  — the newest mtime under `out` must not predate the newest under `src`
 */
export const STALENESS = [
  { kind: "tsc", tsconfig: "packages/core/tsconfig.json", dir: "packages/core/dist" },
  { kind: "tsc", tsconfig: "packages/linter/tsconfig.json", dir: "packages/linter/dist" },
  { kind: "tsc", tsconfig: "packages/runtime/tsconfig.json", dir: "packages/runtime/dist" },
  {
    kind: "newest",
    label: "editor bundle vs editor sources",
    src: ["packages/editor/src"],
    out: ["packages/editor/dist/assets"],
  },
  {
    kind: "newest",
    label: "site/editor vs packages/editor/dist",
    src: ["packages/editor/dist/assets"],
    out: ["site/editor/assets"],
  },
  {
    kind: "perFile",
    label: "docs → site",
    pairs: [
      ["docs/البداية.md", "site/docs/البداية.html"],
      ["docs/المرجع.md", "site/docs/المرجع.html"],
      ["docs/الأخطاء.md", "site/docs/الأخطاء.html"],
      ["docs/الخصوصية.md", "site/privacy.html"],
      ["docs/الشروط.md", "site/terms.html"],
    ],
  },
  {
    kind: "perFile",
    label: "story export chain (mtime)",
    pairs: [["stories/العطر_المفقود.qalam", "stories/العطر_المفقود.html"]],
  },
  {
    // The exported stories INLINE the runtime bundle — hard rule 4 — so their
    // freshness is a content question, not a timestamp question, and mtime is
    // the wrong tool twice over here. build-runtime.mjs runs inside
    // `npm run test:site`, so the bundle's mtime moves on every test run while
    // its bytes do not; an mtime pair would have gone red on every second
    // `npm test`. And a story exported against an OLD bundle is exactly the
    // deployment-day bug — the paragraph fix that landed in the source and
    // never reached site/العطر_المفقود.html. This catches that; mtime only
    // ever hinted at it.
    kind: "contains",
    label: "exported stories inline the current runtime bundle",
    needle: "packages/runtime/dist/aqlamna-runtime.js",
    haystacks: [
      "stories/العطر_المفقود.html",
      "site/العطر_المفقود.html",
      "packages/runtime/examples/الرحيق.html",
    ],
  },
  {
    kind: "identical",
    label: "site copy of the demo story",
    pairs: [["stories/العطر_المفقود.html", "site/العطر_المفقود.html"]],
  },
];

// ---------------------------------------------------------------------------
// Files that used to be produced here and are not any more.
// ---------------------------------------------------------------------------

/**
 * Superseding a file is not deleting it. Anything listed here has no producer
 * and is waiting on the owner's yes/no (hard rule 8).
 *
 * A retired entry counts as a claim, so the orphan sweep does not fail on it —
 * but the gate prints every one of them, every run, under a heading that says
 * they have no producer. That is the difference between a file that is known
 * dead and a file that is quietly dead. rules.json was the second kind.
 *
 * Empty this list as the owner approves each deletion. Do not add to it to
 * silence a sweep: a new build output belongs in BUILD_DIRS as a real claim.
 */
export const RETIRED = [
  // Empty, and it should stay that way.
  //
  // site/assets/logo-transparent.png passed through here on 31 Jul 2026 — the
  // 823px, 1,196,544-byte master that build-site.mjs used to copy in and
  // index.html served into a 132px slot. scripts/build-images.mjs replaced it
  // with logo-{132,264}.{webp,png} and the owner approved the deletion in the
  // same session, which is how long an entry here is supposed to live.
  //
  // Six other entries lived here for exactly one
  // session — the four packages/runtime/dist/export.* files orphaned when
  // 6c99553 excluded src/export.ts from the tsconfig, and the rules.md5 /
  // mastery-prompt.md5 sidecars that the in-artifact provenance replaced. All
  // six were deleted on 31 Jul 2026 with the owner's approval.
  //
  // This list is a waiting room, not a filing cabinet. An entry here means a
  // dead file is still on disk and the owner has not yet said "delete it".
  // Every entry that outlives that answer is one more thing the manifest is
  // wrong about, which is the same defect the manifest exists to prevent.
];
