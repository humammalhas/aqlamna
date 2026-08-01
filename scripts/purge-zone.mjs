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

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zone.id}/purge_cache`,
    { method: "POST", headers, body: JSON.stringify({ purge_everything: true }) },
  );
  const json = await res.json();
  if (json?.success) {
    console.log(`[purge] ${ZONE_NAME} cache purged.`);
  } else {
    console.warn(
      `[purge] purge failed: ${JSON.stringify(json?.errors ?? json).slice(0, 300)}`,
    );
  }
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
