// scripts/purge-zone.mjs — purge the aqlamna.org zone cache after a deploy.
//
// WHY THIS IS PART OF `npm run deploy` AND NOT A NOTE IN A DOCUMENT.
//
// Twice on 1 Aug 2026, a deploy left aqlamna.org/editor **blank** while
// aqlamna.pages.dev and the deployment URL were both fine. The custom domain
// served site/index.html for `/editor/assets/index-<hash>.js` — the SPA
// fallback — and only for browser-shaped requests. Plain `curl` got the
// JavaScript; `curl` with `Origin` + `Sec-Fetch-Mode: cors` + a Chrome UA got
// the landing page. A stale zone-cache variant, invisible to every check that
// is not a real browser.
//
// Purging four specific URLs did NOT clear it. `purge_everything` did, both
// times. Since the asset hash changes on every meaningful deploy, the exposure
// is every deploy, so the purge belongs in the deploy.
//
// Cost of purging: the zone re-fetches from Pages on the next request. There is
// no origin to overload — Pages IS the origin.
//
// Needs CLOUDFLARE_API_TOKEN, the same token wrangler already uses. Never
// prints it. Non-fatal by design: a failed purge must not fail a deploy that
// already succeeded, so it warns and exits 0 with instructions.

import { existsSync, readFileSync, statSync } from "node:fs";

const ZONE_NAME = "aqlamna.org";
const token = process.env.CLOUDFLARE_API_TOKEN;

if (!token) {
  console.warn(
    "[purge] CLOUDFLARE_API_TOKEN not set — skipping the cache purge.\n" +
      "  The deploy succeeded, but aqlamna.org may serve a stale asset.\n" +
      "  VERIFY THE EDITOR IN A REAL BROWSER, not with curl.",
  );
  process.exit(0);
}

const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function main() {
  const zoneRes = await fetch(
    `https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}`,
    { headers },
  );
  const zoneJson = await zoneRes.json();
  const zone = zoneJson?.result?.[0];
  if (!zone?.id) {
    console.warn(`[purge] could not resolve the zone for ${ZONE_NAME} — skipping.`);
    return;
  }

  await purge(zone.id);
  await verifyAssets(zone.id);
}

async function purge(zoneId) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
    { method: "POST", headers, body: JSON.stringify({ purge_everything: true }) },
  );
  const json = await res.json();
  if (json?.success) {
    console.log(`[purge] ${ZONE_NAME} cache purged.`);
    return true;
  }
  console.warn(
    `[purge] purge failed: ${JSON.stringify(json?.errors ?? json).slice(0, 300)}`,
  );
  return false;
}

// ---- Verify, because a successful purge is not a working site ---------------
//
// On 2 Aug 2026 this script purged, reported success, and the editor was still
// blank. The purge was not wrong — it ran before Pages had propagated the new
// bundle, and the very next request re-cached the SPA fallback under the
// asset's URL. The edge then served `text/html` for a `<script type="module">`,
// which the browser refuses, so `#root` stayed empty with nothing in the
// console.
//
// Worse, `_headers` marks `/editor/assets/*` `immutable, max-age=31536000` —
// correct for a content-hashed file, and a trap for a wrong one. Every browser
// that fetched during that window pinned the HTML for a year, and no
// server-side purge can reach it. So the window has to be closed here.
//
// The check must send browser-shaped headers: the failure only ever appeared
// for requests carrying Origin + Sec-Fetch-Mode + a Chrome UA. Plain curl saw
// the JavaScript and saw nothing wrong.

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Origin: `https://${ZONE_NAME}`,
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "script",
  Accept: "*/*",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ASSET_RE = /(?:src|href)="(\/editor\/assets\/[^"]+\.(?:js|css))"/g;

/**
 * The assets THIS deploy just uploaded, read off the local build.
 *
 * Not off the deployed document, which is what this script used to do and why
 * it passed while the editor was blank: during propagation the edge still
 * serves the PREVIOUS build's `/editor/`, whose assets are long since cached
 * and perfectly healthy. The verifier checked those, found nothing wrong, and
 * reported success for a build whose own bundle was answering with HTML.
 *
 * `site/editor/index.html` is the file wrangler uploaded moments ago. It names
 * the hashes that have to work.
 */
function expectedAssets() {
  const doc = new URL("../site/editor/index.html", import.meta.url);
  if (!existsSync(doc)) return { assets: [], sizes: new Map() };

  const html = readFileSync(doc, "utf-8");
  const assets = [...html.matchAll(ASSET_RE)].map((m) => m[1]);

  // The local byte count, so "served with the right content-type" cannot be
  // satisfied by a 37KB landing page wearing a JavaScript label.
  const sizes = new Map();
  for (const path of assets) {
    const file = new URL(`../site${path}`, import.meta.url);
    if (existsSync(file)) sizes.set(path, statSync(file).size);
  }
  return { assets, sizes };
}

/** The hashed asset URLs the DEPLOYED editor document currently asks for. */
async function deployedAssets() {
  const res = await fetch(`https://${ZONE_NAME}/editor/?purgecheck=${process.pid}`, {
    headers: { "User-Agent": BROWSER_HEADERS["User-Agent"], "Cache-Control": "no-cache" },
  });
  const html = await res.text();
  return [...html.matchAll(ASSET_RE)].map((m) => m[1]);
}

async function verifyAssets(zoneId) {
  const { assets: urls, sizes } = expectedAssets();
  if (urls.length === 0) {
    console.warn(
      "[purge] site/editor/index.html names no hashed assets — skipping verification.\n" +
        "  Run `npm run build:site` before deploying, or this check is blind.",
    );
    return;
  }

  const build = (urls.find((u) => u.endsWith(".js")) ?? "").replace(/.*index-|\.js$/g, "");
  console.log(`[purge] verifying build ${build || "?"} — ${urls.length} asset(s) from the local build.`);

  for (let attempt = 1; attempt <= 4; attempt++) {
    const bad = [];

    // 1. The document must name THIS build. A stale document is the failure
    //    that hid the other one, and it is the thing a browser reads first.
    try {
      const live = await deployedAssets();
      for (const url of urls) {
        if (!live.includes(url)) {
          bad.push(`/editor/ does not name ${url} yet (it names ${live.join(", ") || "nothing"})`);
        }
      }
    } catch (err) {
      bad.push(`/editor/ could not be read: ${err.message}`);
    }

    // 2. Each expected asset must come back as itself: right type, right size.
    for (const url of urls) {
      try {
        const res = await fetch(`https://${ZONE_NAME}${url}`, { headers: BROWSER_HEADERS });
        const type = res.headers.get("content-type") ?? "";
        const wantJs = url.endsWith(".js");
        const typeOk = wantJs ? type.includes("javascript") : type.includes("css");
        if (!typeOk) {
          bad.push(`${url} → ${res.status} ${type}`);
          continue;
        }
        const bytes = (await res.arrayBuffer()).byteLength;
        const expected = sizes.get(url);
        if (expected && bytes < expected * 0.5) {
          bad.push(`${url} → ${bytes} bytes, expected about ${expected}`);
        }
      } catch (err) {
        bad.push(`${url} → ${err.message}`);
      }
    }

    if (bad.length === 0) {
      console.log(
        `[purge] verified ${urls.length} asset(s): the document names build ${build || "?"} ` +
          "and every file comes back with the right type and size.",
      );
      return;
    }

    console.warn(
      `[purge] attempt ${attempt} — the zone is not serving this build yet:\n` +
        bad.map((b) => `    ${b}`).join("\n"),
    );
    if (attempt === 4) break;
    await sleep(6000);
    await purge(zoneId);
    await sleep(4000);
  }

  console.warn(
    "[purge] ⚠️  THE DEPLOYED EDITOR IS BLANK OR ON THE PREVIOUS BUILD.\n" +
      "  Either the zone is returning HTML for a JavaScript module — which the\n" +
      "  browser refuses silently — or /editor/ still names the build before this\n" +
      "  one. Re-run `npm run purge:zone` in a minute; if it does not clear, purge\n" +
      "  the zone from the Cloudflare dashboard.\n" +
      "  Anyone who loaded the editor meanwhile has it pinned for a year and needs\n" +
      "  a hard reload (Ctrl+Shift+R).",
  );
}

try {
  await main();
} catch (err) {
  console.warn(`[purge] purge threw: ${err instanceof Error ? err.message : String(err)}`);
}

console.log(
  "[purge] Now OPEN https://aqlamna.org/editor/ IN A BROWSER and confirm it renders.\n" +
    "  A curl check cannot see the failure this purge exists to prevent.",
);
