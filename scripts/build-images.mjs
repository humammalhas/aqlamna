// ---------------------------------------------------------------------------
// build-images.mjs — every image the site serves, derived from brand/.
//
// WHY THIS EXISTS
//
// The hero logo was `brand/logo-transparent.png` shipped verbatim: 823×823,
// 8-bit RGBA, 1,196,544 bytes, displayed at 132 CSS px. It was 99% of the
// landing page's first-paint bytes — 4.3× the brotli cost of the entire editor
// bundle — to draw a 132px picture. The icons were the same story: hand-copied
// masters at 472KB (512px), 76KB (192px), 67KB (180px), and a 185KB favicon.ico
// whose 256×256 entry alone was 129KB.
//
// COMPRESSION IS NOT THE ANSWER, AND IT NEVER WAS
//
// site/_headers contains no rule about images. Cloudflare compresses text/css
// and even image/vnd.microsoft.icon, and does NOT compress image/png — by
// default, deliberately, because PNG is already a DEFLATE container. Measured
// on these exact files: gzip saves 0.0% and brotli makes them 5 bytes LARGER.
// No header could have helped. The bytes were in the pixels.
//
// brand/ IS THE MASTER AND IS NEVER WRITTEN TO. Humam owns it.
//
// QUALITY: NOTHING HERE IS ALLOWED TO LOOK WORSE
//
// The first draft of this script quantised everything to a 256-colour palette,
// because that is where the big PNG wins are: 66% off icon-512, 65% off
// icon-192. Measured in the browser, that collapses the distinct colours of
// icon-512 from 56,824 to 253 — 99.6% — and of the logo's PNG from 9,444 to
// 255. On a medallion built out of gradients that is contouring, and PSNR
// hides it: the same encode reads as a comfortable 43.4 dB.
//
// So: every PNG here is losslessly encoded, and every one that is not resized
// is pixel-identical to its master. The saving on those is ~0.5%, which is the
// honest answer — the masters were already well packed and there was never a
// PNG win to be had without giving something up.
//
// The wins that are real:
//   - the logo, because it was 823px for a 132px slot;
//   - favicon.ico, because it carried 64/128/256px entries for a 16px tab.
// Both are size problems, not encoding problems.
//
// The one lossy encoder is the logo's WebP, and it was checked rather than
// assumed. Rendered in Chrome at 132 and 264 device px against the browser's
// own downscale of the master: detail (mean |Laplacian|) +2.5% / -0.4%,
// distinct colours 9,242 vs 9,444 and 27,967 vs 25,633, max ringing overshoot
// 27.7 luma levels on 3.3% of pixels. Parity, not degradation.
//
// A TRAP WORTH KNOWING: sharp's png() turns on palette quantisation IMPLICITLY
// as soon as you pass quality, effort, colours or dither. `png({
// compressionLevel: 9, effort: 10 })` reads as "lossless, try hard" and is not
// lossless at all — it changed 193,088 visible pixels of icon-512 with a max
// channel delta of 251. Truly lossless is compressionLevel + adaptiveFiltering
// and NOTHING else. Every "lossless" claim in this file was verified by
// decoding the output and comparing pixels, not by reading the option names.
//
// Every encoder here is deterministic: the same master and the same options
// produce byte-identical output across runs, so build:all never dirties the
// tree. Verified over three runs per encoding.
//
// Usage: node scripts/build-images.mjs   (step 1 of npm run build:all)
// ---------------------------------------------------------------------------

import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const brand = resolve(root, "brand");
const siteAssets = resolve(root, "site", "assets");
const editorPublic = resolve(root, "packages", "editor", "public");

// ---- Encoder settings ------------------------------------------------------

/**
 * Lossless PNG. compressionLevel and adaptiveFiltering only — see the trap
 * above. Anything else silently quantises.
 */
const PNG_LOSSLESS = { compressionLevel: 9, adaptiveFiltering: true };

/**
 * Near-lossless WebP. The smallest WebP setting that still clears the logo's
 * quality bar; plain lossy WebP does not (q95 lands at 36.9 dB against an ideal
 * downscale, below the 40.4 dB the browser's own scaling already achieves, and
 * it is the alpha edges that pay for it).
 */
const WEBP = { nearLossless: true, quality: 40, effort: 6 };

/** Downscaling filter. Sharper than the cubic-class filter a browser uses. */
const RESIZE = { kernel: "lanczos3", fit: "contain" };

// ---- Helpers ---------------------------------------------------------------

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Write only when the bytes change.
 *
 * build-runtime.mjs learned this the hard way: it rewrote identical bytes on
 * every call, four times per test run, and the artifact freshness gate went red
 * on every second run because outputs kept becoming newer than their sources.
 */
function writeIfChanged(path, buf) {
  ensureDir(dirname(path));
  if (existsSync(path) && Buffer.compare(readFileSync(path), buf) === 0) return false;
  writeFileSync(path, buf);
  return true;
}

function master(name) {
  const p = resolve(brand, name);
  if (!existsSync(p)) {
    console.error(`brand master not found: ${p}`);
    process.exit(1);
  }
  return p;
}

const written = [];
function record(rel, buf, note) {
  written.push({ rel, bytes: buf.length, note });
}

// ---- The hero logo ---------------------------------------------------------
//
// Displayed at 132 CSS px (120 on a phone, so 132 covers both). 1× and 2×, WebP
// with a PNG fallback. Nothing on the site references the 823px master any
// more.

const LOGO = master("logo-transparent.png");
const LOGO_SIZES = [132, 264];

for (const size of LOGO_SIZES) {
  const webp = await sharp(LOGO).resize(size, size, RESIZE).webp(WEBP).toBuffer();
  const png = await sharp(LOGO).resize(size, size, RESIZE).png(PNG_LOSSLESS).toBuffer();
  writeIfChanged(resolve(siteAssets, `logo-${size}.webp`), webp);
  writeIfChanged(resolve(siteAssets, `logo-${size}.png`), png);
  record(`site/assets/logo-${size}.webp`, webp, "webp near-lossless");
  // Three times the WebP, and served only to a browser that cannot read WebP —
  // old Safari, essentially. Quantising it would make it competitive on bytes
  // and would band the gradients for exactly the users with no alternative.
  record(`site/assets/logo-${size}.png`, png, "png lossless (fallback)");
}

// ---- App icons -------------------------------------------------------------
//
// PNG, not WebP: the manifest and apple-touch-icon are consumed by installers
// and launchers, not only by browsers, and PNG is the format every one of them
// is guaranteed to read. The win here is quantisation, not format.
//
// Both destinations get the same bytes. packages/editor/public/ is what Vite
// copies into the editor build, so /editor/ served its own 185KB favicon and
// 472KB icon independently of the landing page.

const ICONS = [
  { from: "icon-512.png", to: "icon-512.png", size: 512 },
  { from: "icon-192.png", to: "icon-192.png", size: 192 },
  { from: "icon-180.png", to: "apple-touch-icon.png", size: 180 },
  { from: "icon-32.png", to: "icon-32.png", size: 32 },
];

for (const icon of ICONS) {
  const src = master(icon.from);
  const buf = await sharp(src).png(PNG_LOSSLESS).toBuffer();

  // Same size in, same size out, lossless encoder: these must decode to the
  // master's exact pixels. Assert it rather than trust the option names — that
  // is precisely the assumption that made `effort: 10` look lossless.
  const [a, b] = await Promise.all([
    sharp(src).ensureAlpha().raw().toBuffer(),
    sharp(buf).ensureAlpha().raw().toBuffer(),
  ]);
  if (Buffer.compare(a, b) !== 0) {
    console.error(`${icon.to} is not pixel-identical to brand/${icon.from} — refusing to ship it`);
    process.exit(1);
  }

  writeIfChanged(resolve(siteAssets, icon.to), buf);
  // The editor's index.html links favicon.ico, icon-192 and apple-touch-icon.
  if (icon.to !== "icon-32.png") writeIfChanged(resolve(editorPublic, icon.to), buf);
  record(`assets/${icon.to}`, buf, "png lossless, pixel-identical");
}

// ---- favicon.ico -----------------------------------------------------------
//
// 185,557 bytes, of which the 256×256 entry alone was 129,170 — for an image
// drawn at 16 CSS px in a tab strip, on every page view. The entries above 48
// exist for the Windows shell, which is not a surface this site has; the
// install surfaces are the manifest icons and apple-touch-icon, and those are
// untouched and full size.
//
// 16 and 32 come from their own masters and are pixel-identical to them. 48 has
// no master, so it is a lanczos3 downscale of the 192, losslessly encoded.
//
// PNG-in-ICO, supported by every browser since IE11.

const ICO_ENTRIES = [
  { size: 16, from: "icon-16.png" },
  { size: 32, from: "icon-32.png" },
  { size: 48, from: "icon-192.png" },
];

const icoImages = [];
for (const e of ICO_ENTRIES) {
  const data = await sharp(master(e.from))
    .resize(e.size, e.size, RESIZE)
    .png(PNG_LOSSLESS)
    .toBuffer();
  icoImages.push({ size: e.size, data });
}

const ico = buildIco(icoImages);
writeIfChanged(resolve(siteAssets, "favicon.ico"), ico);
writeIfChanged(resolve(editorPublic, "favicon.ico"), ico);
record("assets/favicon.ico", ico, `${icoImages.map((i) => i.size).join("/")} px, png-in-ico`);

/**
 * ICONDIR + one ICONDIRENTRY per image + the PNG payloads.
 * A width or height byte of 0 means 256; nothing here is that large.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;
  images.forEach((img, i) => {
    const o = i * 16;
    dir[o] = img.size === 256 ? 0 : img.size;
    dir[o + 1] = img.size === 256 ? 0 : img.size;
    dir[o + 2] = 0; // palette size — 0 for truecolour
    dir[o + 3] = 0; // reserved
    dir.writeUInt16LE(1, o + 4); // colour planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(img.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += img.data.length;
  });

  return Buffer.concat([header, dir, ...images.map((i) => i.data)]);
}

// ---- Report ----------------------------------------------------------------

const BEFORE = {
  "site/assets/logo-transparent.png": 1196544,
  "assets/icon-512.png": 472685,
  "assets/icon-192.png": 75849,
  "assets/apple-touch-icon.png": 67405,
  "assets/favicon.ico": 185557,
};

console.log("build-images: derived from brand/ (never written to)\n");
let total = 0;
for (const w of written) {
  const before = BEFORE[w.rel];
  const delta = before ? `  (was ${before}, ${(100 * (1 - w.bytes / before)).toFixed(1)}% smaller)` : "";
  console.log(`  ${w.rel.padEnd(30)} ${String(w.bytes).padStart(8)}  ${w.note}${delta}`);
  total += w.bytes;
}
console.log(`\n  ${written.length} files, ${total} bytes total`);

// The master must still be exactly where it was. If a future edit ever points
// an output at brand/, this is the line that stops it.
const masterSize = statSync(LOGO).size;
if (masterSize !== 1196544) {
  console.error(
    `\nbrand/logo-transparent.png is ${masterSize} bytes, expected 1196544 — ` +
      "the master was modified. Nothing here may write to brand/.",
  );
  process.exit(1);
}
console.log("  brand/logo-transparent.png untouched at 1196544 bytes");
