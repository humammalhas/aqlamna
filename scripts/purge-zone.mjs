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

/** The hashed asset URLs the deployed editor document actually asks for. */
async function assetUrlsFromDocument() {
  const res = await fetch(`https://${ZONE_NAME}/editor/`, {
    headers: { "User-Agent": BROWSER_HEADERS["User-Agent"], "Cache-Control": "no-cache" },
  });
  const html = await res.text();
  return [...html.matchAll(/(?:src|href)="(\/editor\/assets\/[^"]+\.(?:js|css))"/g)].map(
    (m) => m[1],
  );
}

async function verifyAssets(zoneId) {
  let urls;
  try {
    urls = await assetUrlsFromDocument();
  } catch (err) {
    console.warn(`[purge] could not read the editor document: ${err.message}`);
    return;
  }
  if (urls.length === 0) {
    console.warn("[purge] no hashed assets found in /editor/ — skipping verification.");
    return;
  }

  for (let attempt = 1; attempt <= 4; attempt++) {
    const bad = [];
    for (const url of urls) {
      try {
        const res = await fetch(`https://${ZONE_NAME}${url}`, { headers: BROWSER_HEADERS });
        const type = res.headers.get("content-type") ?? "";
        const wantJs = url.endsWith(".js");
        const ok = wantJs ? type.includes("javascript") : type.includes("css");
        if (!ok) bad.push(`${url} → ${res.status} ${type}`);
      } catch (err) {
        bad.push(`${url} → ${err.message}`);
      }
    }

    if (bad.length === 0) {
      console.log(`[purge] verified ${urls.length} asset(s) served with the right type.`);
      return;
    }

    console.warn(
      `[purge] attempt ${attempt}: the zone is serving the wrong type for:\n` +
        bad.map((b) => `    ${b}`).join("\n"),
    );
    if (attempt === 4) break;
    await sleep(6000);
    await purge(zoneId);
    await sleep(4000);
  }

  console.warn(
    "[purge] ⚠️  THE DEPLOYED EDITOR WILL BE BLANK.\n" +
      "  The zone is returning HTML for a JavaScript module, which the browser\n" +
      "  refuses silently. Re-run `npm run purge:zone` in a minute; if it does not\n" +
      "  clear, purge the zone from the Cloudflare dashboard.\n" +
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
