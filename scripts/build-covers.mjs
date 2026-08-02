// scripts/build-covers.mjs — the showcase covers on the landing page.
//
// One cover per playable story, derived from that story's OWN illustration so
// the picture on the card cannot describe a scene the story does not contain.
// Two of them read the master webp in stories/images/; حرّاس الخزنة ships as a
// finished standalone export with its pictures inlined, so its cover is
// extracted from the data URI inside that file.
//
// Output: site/assets/cover-*.webp — declared in scripts/artifacts.manifest.mjs.
// Run by scripts/build-site.mjs, so `npm run build:site` refreshes them.
//
// Usage: node scripts/build-covers.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const assets = resolve(root, "site", "assets");

/** Displayed at ~320px on a phone and ~230px in the three-column grid; 640 is 2×. */
const COVER_WIDTH = 640;

const COVERS = [
  {
    out: "cover-guardians.webp",
    from: { html: "stories/حرّاس_الخزنة.html", image: "الوادي" },
  },
  { out: "cover-perfume.webp", from: { file: "stories/images/العطر_المفقود-الدكان.webp" } },
  { out: "cover-kite.webp", from: { file: "stories/images/طائرة_الورق-السطح.webp" } },
];

/** The bytes of one image, whether it lives as a file or inside an export. */
function sourceBytes(from) {
  if (from.file) {
    const p = resolve(root, from.file);
    if (!existsSync(p)) throw new Error(`cover source missing: ${from.file}`);
    return readFileSync(p);
  }

  const p = resolve(root, from.html);
  if (!existsSync(p)) throw new Error(`cover source missing: ${from.html}`);
  const html = readFileSync(p, "utf-8");
  const m = html.match(
    /<script id="qalam-story" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!m) throw new Error(`no story JSON in ${from.html}`);
  const story = JSON.parse(m[1]);
  const asset = story.images?.[from.image];
  if (!asset?.data) {
    throw new Error(`${from.html} has no drawn image named "${from.image}"`);
  }
  return Buffer.from(asset.data.replace(/^data:[^,]+,/, ""), "base64");
}

if (!existsSync(assets)) mkdirSync(assets, { recursive: true });

for (const cover of COVERS) {
  const input = sourceBytes(cover.from);
  const out = resolve(assets, cover.out);
  await sharp(input)
    .resize({ width: COVER_WIDTH, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(out);
  console.log(
    `  cover  site/assets/${cover.out}  ${input.length} → ${readFileSync(out).length} bytes`,
  );
}

console.log(`build-covers: ${COVERS.length} cover(s) written`);
