// scripts/build-site.mjs — copy build artifacts into site/
// Called from root `build:site` after the editor builds with base /editor/.

import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";
import { isolateAscii } from "./bidi-isolate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const site = resolve(root, "site");

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  ensureDir(dirname(dest));
  cpSync(src, dest, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(dirname(dest));
  cpSync(src, dest);
}

// 1. Editor dist → site/editor/
const editorDist = resolve(root, "packages", "editor", "dist");
if (!existsSync(editorDist)) {
  console.error("editor dist/ not found — run the editor build first");
  process.exit(1);
}
copyDir(editorDist, resolve(site, "editor"));
console.log("✓ site/editor/");

// Vite builds the editor with `--base /editor/` and rewrites every absolute
// href in index.html to sit under that base — including the manifest link, so
// `/manifest.webmanifest` came out as `/editor/manifest.webmanifest`. There is
// exactly one manifest and it lives at the site root, because its scope is the
// whole site. Point the tag back and fail loudly if the rewrite ever stops.
{
  const editorIndex = resolve(site, "editor", "index.html");
  let html = readFileSync(editorIndex, "utf-8");
  html = html.replace(
    /href="\/editor\/manifest\.webmanifest"/,
    'href="/manifest.webmanifest"',
  );
  if (!html.includes('href="/manifest.webmanifest"')) {
    console.error("editor index.html does not link /manifest.webmanifest");
    process.exit(1);
  }
  writeFileSync(editorIndex, html, "utf-8");
  console.log("✓ site/editor/index.html → /manifest.webmanifest");
}

// 2. Story → site/
const story = resolve(root, "stories", "العطر_المفقود.html");
if (!existsSync(story)) {
  console.error("story file not found:", story);
  process.exit(1);
}
copyFile(story, resolve(site, "العطر_المفقود.html"));
console.log("✓ site/العطر_المفقود.html");

// 3. Images
//
// These used to be copied here straight from brand/, at full master size: a
// 1,196,544-byte logo for a 132px slot, a 472,685-byte 512px icon, and a
// 185,557-byte favicon.ico. scripts/build-images.mjs now derives every one of
// them, and runs as step 1 of build:all because Vite copies its output out of
// packages/editor/public/ during the editor build.
//
// This script only checks they arrived. A missing icon is silent everywhere
// else: Chrome refuses to install a PWA whose manifest names a path that 404s
// and never says why.
const requiredImages = [
  "logo-132.webp",
  "logo-264.webp",
  "logo-132.png",
  "logo-264.png",
  "icon-512.png",
  "icon-192.png",
  "icon-32.png",
  "apple-touch-icon.png",
  "favicon.ico",
];
for (const name of requiredImages) {
  const p = resolve(site, "assets", name);
  if (!existsSync(p)) {
    console.error(
      `site/assets/${name} is missing — run \`node scripts/build-images.mjs\` ` +
        "(step 1 of npm run build:all).",
    );
    process.exit(1);
  }
}
console.log(`✓ site/assets/ — ${requiredImages.length} derived images present`);

// Every icon the manifest names must actually resolve, or Chrome silently
// refuses to install and never says why.
const manifestPath = resolve(site, "manifest.webmanifest");
if (!existsSync(manifestPath)) {
  console.error("manifest not found:", manifestPath);
  process.exit(1);
}
for (const icon of JSON.parse(readFileSync(manifestPath, "utf-8")).icons) {
  const iconPath = resolve(site, icon.src.replace(/^\//, ""));
  if (!existsSync(iconPath)) {
    console.error(`manifest names ${icon.src} but ${iconPath} does not exist`);
    process.exit(1);
  }
}
console.log("✓ manifest icons all resolve");

// 4. Demo blocks — generated from stories/العطر_المفقود.qalam
//
// Two injections, two marker pairs:
//
//   GLANCE  — the hero's compact تكتب هذا / يصير هذا pair. Both halves visible
//             at once, above the fold. This is the pitch.
//   PREVIEW — one box carrying the editor's own three tabs in the editor's own
//             order: قصتك · شغّل · مخطط. This is the proof.
//
// The page used to show the story TWICE: the side-by-side pair and then a full
// iframe of the same story underneath it, so a visitor read the identical
// opening paragraph twice with nothing saying why.
const qalamSrc = resolve(root, "stories", "العطر_المفقود.qalam");
if (!existsSync(qalamSrc)) {
  console.error("qalam source not found:", qalamSrc);
  process.exit(1);
}
const qalamText = readFileSync(qalamSrc, "utf-8");
const firstPassage = parseFirstPassage(qalamText);
if (!firstPassage) {
  console.error("could not parse the first passage of", qalamSrc);
  process.exit(1);
}

const glanceHtml = generateGlanceHtml(firstPassage);
const map = await generateMap(qalamText);
const previewHtml = generatePreviewHtml(firstPassage, map);

const indexHtml = resolve(site, "index.html");
let indexContent = readFileSync(indexHtml, "utf-8");
indexContent = injectBlock(indexContent, "GLANCE", glanceHtml);
indexContent = injectBlock(indexContent, "PREVIEW", previewHtml);
writeFileSync(indexHtml, indexContent, "utf-8");
console.log(
  `✓ site/index.html (glance + preview injected; map: ${map.cardCount} cards, ` +
    `${map.arrowCount} arrows, ${map.svgBytes} bytes of inline SVG)`,
);

console.log("\nSite is ready at site/");

// ── Injection ───────────────────────────────────────────────────────────

/** Replace everything between `<!-- NAME_START … -->` and `<!-- NAME_END -->`. */
function injectBlock(html, name, body) {
  const re = new RegExp(`<!-- ${name}_START[^]*?<!-- ${name}_END -->`);
  if (!re.test(html)) {
    console.error(`${name} markers not found in site/index.html`);
    process.exit(1);
  }
  // The markers are preserved around the generated content, so re-running this
  // script on its own output is a no-op rather than a second injection.
  return html.replace(
    re,
    `<!-- ${name}_START — generated from stories/العطر_المفقود.qalam by build-site.mjs -->\n` +
      body +
      `\n    <!-- ${name}_END -->`,
  );
}

// ── The first passage, split into source / prose / choices ──────────────

function parseFirstPassage(src) {
  const passageRe = /^(=== .+ ===[^\n]*)\n((?:(?!^=== ).*\n?)*)/m;
  const m = passageRe.exec(src);
  if (!m) return null;

  const header = m[1].replace(/#[^\n]*/, "").trim(); // strip tags
  const body = m[2].trim();

  const sourceLines = [];
  const proseLines = [];
  const choiceLabels = [];
  let beforeChoices = true;

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      sourceLines.push("");
      continue;
    }
    if (trimmed.startsWith("* [")) {
      beforeChoices = false;
      choiceLabels.push(trimmed.match(/\* \[([^\]]+)\]/)?.[1] ?? trimmed);
      sourceLines.push(trimmed);
    } else if (!beforeChoices) {
      sourceLines.push(line); // inside a choice body — source only
    } else {
      sourceLines.push(trimmed);
      proseLines.push(trimmed);
    }
  }

  return { header, sourceLines, proseLines, choiceLabels };
}

/** ASCII runs get an LTR isolate so `->` does not paint as `<-`. */
function sourcePre(className, lines) {
  return `<pre class="${className}">${isolateAscii(escHtml(lines.join("\n")))}</pre>`;
}

// ── GLANCE — the hero pair ──────────────────────────────────────────────

/**
 * Four lines of .qalam beside what they produce. Deliberately shorter than the
 * قصتك tab below: the pair only works while both halves are on screen at once,
 * and the full first passage does not fit above the fold on a phone.
 */
function generateGlanceHtml({ header, proseLines, choiceLabels }) {
  const firstSentence = (proseLines[0] ?? "").split(/(?<=\.)\s+/)[0] ?? "";
  const src = [header, "", firstSentence, "", ...choiceLabels.map((l) => `* [${l}]`)];

  const buttons = choiceLabels
    .map((l) => `          <button type="button" disabled>${escHtml(l)}</button>`)
    .join("\n");

  return `    <section class="glance" aria-label="مثال قصير">
      <div class="glance-card">
        <h2>تكتب هذا</h2>
        ${sourcePre("glance-source", src)}
      </div>
      <div class="glance-card">
        <h2>يصير هذا</h2>
        <div class="glance-result">
          <p>${escHtml(firstSentence)}</p>
${buttons}
        </div>
      </div>
    </section>`;
}

// ── PREVIEW — the three tabs ────────────────────────────────────────────

function generatePreviewHtml({ header, sourceLines }, map) {
  return `    <section class="preview" aria-labelledby="preview-title">
      <h2 class="preview-title" id="preview-title">القصة نفسها من ثلاث زوايا</h2>

      <div class="tabs" role="tablist" aria-label="الأقسام">
        <button type="button" class="tab" role="tab" id="tab-source"
                aria-controls="panel-source" aria-selected="true" tabindex="0">قصتك</button>
        <button type="button" class="tab" role="tab" id="tab-play"
                aria-controls="panel-play" aria-selected="false" tabindex="-1">شغّل</button>
        <button type="button" class="tab" role="tab" id="tab-map"
                aria-controls="panel-map" aria-selected="false" tabindex="-1">مخطط</button>
      </div>

      <div class="panel" role="tabpanel" id="panel-source" aria-labelledby="tab-source" tabindex="0">
        <p class="panel-note">هذا ما تكتبه — أوّل مقطع من قصة "العطر المفقود".</p>
        ${sourcePre("panel-source-code", [header, "", ...sourceLines])}
      </div>

      <div class="panel" role="tabpanel" id="panel-play" aria-labelledby="tab-play" tabindex="0" hidden>
        <p class="panel-note">وهذا ما يقرؤه من يفتح الملفّ.</p>
        <div class="panel-frame">
          <p class="frame-status" id="playStatus">جاري تحميل القصة...</p>
          <iframe
            id="playFrame"
            data-src="/العطر_المفقود.html"
            title="العطر المفقود — قصة تفاعلية تجريبية"
            hidden
          ></iframe>
        </div>
      </div>

      <div class="panel" role="tabpanel" id="panel-map" aria-labelledby="tab-map" tabindex="0" hidden>
        <p class="panel-note">وهذا شكل القصة كلّها: كلّ مقطع بطاقة، وكلّ تحويلة سهم.</p>
        <div class="panel-map">
${map.svg}
        </div>
      </div>
    </section>`;
}

// ── The map ─────────────────────────────────────────────────────────────

/**
 * The graph comes from the EDITOR'S OWN parser — packages/editor/src/lib/
 * canvas-parser.ts — transformed to JS by esbuild and imported here. There is
 * one implementation of "what are the passages and what points at what", and
 * the landing page and the canvas cannot drift from each other because they
 * are the same function.
 *
 * What is NOT reused is React Flow. Rendering these eleven boxes in the browser
 * would cost every first-time visitor the editor bundle — 875,886 decoded bytes
 * of JS, ~230KB brotli — for a picture that never changes, plus the editor's
 * own stylesheet, because the node colours (`--aq-node-green` and friends) are
 * declared in packages/editor/src/aqlamna-theme.css and do not exist in
 * site/assets/aqlamna.css. An undefined custom property does not warn; it
 * inherits, which is exactly how the install button once shipped at 1.29:1.
 * So the map is drawn at BUILD time into inline SVG, in the site's palette,
 * and costs a first-time visitor nothing beyond the bytes of the SVG itself.
 */
async function generateMap(source) {
  const parserPath = resolve(root, "packages", "editor", "src", "lib", "canvas-parser.ts");
  const { code } = await transform(readFileSync(parserPath, "utf-8"), {
    loader: "ts",
    format: "esm",
  });
  const { parseCanvas, autoLayout } = await import(
    "data:text/javascript;base64," + Buffer.from(code, "utf-8").toString("base64")
  );

  const parsed = parseCanvas(source);
  if (parsed.nodes.length === 0) {
    console.error("the story parsed to zero passages — refusing to emit an empty map");
    process.exit(1);
  }
  const laid = autoLayout(parsed.nodes, parsed.edges, parsed.nodes[0].id);
  return renderMapSvg(laid, parsed.edges);
}

function renderMapSvg(nodes, edges) {
  // Geometry, in viewBox units. The SVG scales to its container, so these are
  // chosen for the ratio between them, not for pixels: at the site's content
  // column the whole map fits with the passage titles around 12px.
  const CARD_W = 186;
  const CARD_H = 80;
  const H_SPACING = 226;
  const V_SPACING = 104;
  const PAD_X = 12;
  const PAD_TOP = 30;
  const PAD_BOTTOM = 14;

  // autoLayout() spaces its columns 280 apart and its rows 140 apart. Divide
  // back out to recover the depth and row it assigned, then re-space for this
  // render — the graph shape is the parser's, the pixels are ours.
  const LAYOUT_H = 280;
  const LAYOUT_V = 140;

  const cells = nodes.map((n) => ({
    id: n.id,
    depth: Math.round(n.position.x / LAYOUT_H),
    row: Math.round(n.position.y / LAYOUT_V),
    data: n.data,
  }));

  const maxDepth = Math.max(...cells.map((c) => c.depth));
  const maxRow = Math.max(...cells.map((c) => c.row));
  const vbW = PAD_X * 2 + maxDepth * H_SPACING + CARD_W;
  const vbH = PAD_TOP + maxRow * V_SPACING + CARD_H + PAD_BOTTOM;

  // RTL: depth 0 sits on the RIGHT and the story runs leftwards, the direction
  // an Arabic reader's eye already travels.
  const box = new Map();
  for (const c of cells) {
    box.set(c.id, {
      x: PAD_X + (maxDepth - c.depth) * H_SPACING,
      y: PAD_TOP + c.row * V_SPACING,
      w: CARD_W,
      h: CARD_H,
    });
  }

  // One arrow per ordered pair. The story diverts to الجرار twice from the same
  // passage and the canvas draws both, one exactly on top of the other; a still
  // picture gains nothing from the overdraw.
  //
  // NUL joins the two names because a passage name may contain a space, so a
  // space separator would let "أ ب" -> "ج" and "أ" -> "ب ج" collide. It must be
  // written as a six-character escape and never as a literal 0x00 byte: this
  // file shipped with four raw NULs in it for one commit, which made git,
  // grep and every diff tool treat a JavaScript source file as binary.
  const seen = new Set();
  const pairs = [];
  for (const e of edges) {
    if (!box.has(e.source) || !box.has(e.target)) continue;
    const key = `${e.source}\u0000${e.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ source: e.source, target: e.target });
  }
  const both = new Set(
    pairs
      .filter((p) => seen.has(`${p.target}\u0000${p.source}`))
      .map((p) => `${p.source}\u0000${p.target}`),
  );

  const arrows = pairs.map((p) => {
    const s = box.get(p.source);
    const t = box.get(p.target);
    // A two-way pair (المهمّة ⇄ السوق) would otherwise trace one line twice.
    // Bow the two apart by sign of the name comparison, so the choice is
    // deterministic and each direction always takes the same side.
    const bow = both.has(`${p.source}\u0000${p.target}`) ? (p.source < p.target ? 11 : -11) : 0;
    const goingLeft = t.x + t.w / 2 < s.x + s.w / 2;
    const sx = goingLeft ? s.x : s.x + s.w;
    const tx = goingLeft ? t.x + t.w : t.x;
    const sy = s.y + s.h / 2 + bow;
    const ty = t.y + t.h / 2 + bow;
    const reach = Math.max(30, Math.min(90, Math.abs(tx - sx) / 2));
    const c1 = goingLeft ? sx - reach : sx + reach;
    const c2 = goingLeft ? tx + reach : tx - reach;
    return `<path d="M${r(sx)} ${r(sy)} C${r(c1)} ${r(sy)}, ${r(c2)} ${r(ty)}, ${r(tx)} ${r(ty)}" />`;
  });

  const cards = cells.map((c) => {
    const b = box.get(c.id);
    const d = c.data;
    const ghost = d.preview === "⚠️ مقطع غير موجود";
    const cls = ["card", d.isStart ? "is-start" : "", d.hasEndDivert ? "is-end" : "", ghost ? "is-ghost" : ""]
      .filter(Boolean)
      .join(" ");
    const cx = b.x + b.w / 2;

    const tag = d.isStart
      ? `<text class="tag tag-start" x="${r(cx)}" y="${r(b.y - 9)}">البداية</text>`
      : d.hasEndDivert
        ? `<text class="tag" x="${r(cx)}" y="${r(b.y - 9)}">نهاية</text>`
        : "";

    const badge =
      d.choiceCount > 0
        ? `<g class="badge"><rect x="${r(b.x + 8)}" y="${r(b.y + b.h - 24)}" width="42" height="17" rx="8"/>` +
          `<text x="${r(b.x + 29)}" y="${r(b.y + b.h - 11)}">${arabicDigits(d.choiceCount)} ↯</text></g>`
        : "";

    return (
      `<g class="${cls}">${tag}` +
      `<rect x="${r(b.x)}" y="${r(b.y)}" width="${b.w}" height="${b.h}" rx="9"/>` +
      `<text class="t" x="${r(cx)}" y="${r(b.y + 28)}">${escHtml(clip(d.title, 16))}</text>` +
      `<text class="p" x="${r(cx)}" y="${r(b.y + 50)}">${escHtml(clip(d.preview, 21))}</text>` +
      `${badge}</g>`
    );
  });

  const label =
    `مخطط قصة "العطر المفقود": ${countNoun(cells.length, "passage")} ` +
    `و${countNoun(pairs.length, "divert")} بينها.`;

  const svg =
    `<svg class="map" viewBox="0 0 ${r(vbW)} ${r(vbH)}" role="img" aria-label="${escHtml(label)}"` +
    ` xmlns="http://www.w3.org/2000/svg">` +
    // The marker inherits from <defs>, NOT from the path that references it, so
    // a CSS rule on `.edges path` cannot reach it. `currentColor` can: `.map`
    // sets `color`, which cascades down to the marker.
    `<defs><marker id="mapArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6"` +
    ` orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>` +
    `<g class="edges">${arrows.join("")}</g>` +
    `<g class="cards">${cards.join("")}</g>` +
    `</svg>`;

  return {
    svg: "          " + svg,
    cardCount: cells.length,
    arrowCount: pairs.length,
    rawEdgeCount: edges.length,
    svgBytes: Buffer.byteLength(svg, "utf-8"),
  };
}

/** Trim a coordinate to at most one decimal without trailing noise. */
function r(n) {
  return Math.round(n * 10) / 10;
}

/** SVG <text> does not wrap. Truncate on characters; the card is 186 units. */
function clip(s, max) {
  const t = String(s).trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/** The page already counts in Arabic-Indic digits (the iOS install steps). */
function arabicDigits(n) {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/**
 * Count + noun, agreeing the way Arabic actually agrees.
 *
 * Arabic does not put a bare plural after every number, and the first draft of
 * the map's label read `١١ مقاطع` — the mistake an English-shaped template
 * makes. 1 and 2 have their own forms, 3-10 take the plural, 11-99 take a
 * singular accusative, 100+ a singular.
 *
 * `kind` picks the noun; the forms are ordered [1, 2, 3-10, 11-99, 100+].
 */
function countNoun(n, kind) {
  const FORMS = {
    passage: ["مقطع واحد", "مقطعان", "مقاطع", "مقطعًا", "مقطع"],
    divert: ["تحويلة واحدة", "تحويلتان", "تحويلات", "تحويلةً", "تحويلة"],
  };
  const forms = FORMS[kind];
  if (n === 1) return forms[0];
  if (n === 2) return forms[1];
  const d = arabicDigits(n);
  if (n <= 10) return `${d} ${forms[2]}`;
  if (n <= 99) return `${d} ${forms[3]}`;
  return `${d} ${forms[4]}`;
}

function escHtml(s) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}
