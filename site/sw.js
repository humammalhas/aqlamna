// ---------------------------------------------------------------------------
// Aqlamna service worker — site-wide scope (/).
//
// PLAIN JAVASCRIPT ONLY. This file is served verbatim and is never compiled.
// An earlier version carried TypeScript annotations and threw "script
// evaluation failed" on every registration, which also meant Chrome would
// never fire `beforeinstallprompt`.
//
// Scope is `/` so the app can be installed from the home page — which is where
// people actually arrive. What it INTERCEPTS is deliberately much narrower
// than its scope:
//
//   cache-first   fingerprinted assets only (/editor/assets/*, /assets/*).
//                 Their filenames change with their bytes, so a hit is never
//                 stale.
//   network-first  the editor document AND the home page. Their URLs never
//                 change, so caching them first would pin a returning visitor
//                 to the build they first loaded. Cache is the OFFLINE
//                 fallback, not the default.
//   never         the rest of the content pages — /docs/*, /privacy, /terms,
//                 the exported stories. Those must always be fresh; privacy
//                 and terms are legal documents, and an exported story is
//                 someone's work, where a stale copy is a corruption.
//   never         AI provider API calls. A cached AI response is a bug.
//
// WHY "/" IS HERE. The editor's أقلامنا wordmark links to "/", and in the
// installed app (start_url "/editor/", display "standalone") there is no
// address bar and no back button. Without a cached copy, tapping it offline
// reached Chrome's error page, escapable only by the phone's back gesture.
// It is network-first like the editor document, so it is never a stale home
// page for anyone online — the cache only answers when the network does not.
//
// Bump CACHE_VERSION on every deploy to replace the old cache.
// ---------------------------------------------------------------------------

const CACHE_VERSION = "aqlamna-v8";
const CACHE_NAME = `aqlamna-app-${CACHE_VERSION}`;

// ---- Resources to precache on install --------------------------------------

const APP_SHELL = [
  "/",
  "/editor/",
  "/editor/index.html",
  "/manifest.webmanifest",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/assets/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Individually, not addAll: addAll rejects the whole install if any one
      // entry 404s, which would leave the app permanently uninstallable.
      Promise.all(
        APP_SHELL.map((path) =>
          cache.add(path).catch((err) => {
            console.warn("[sw] could not precache " + path, err);
          }),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---- Fetch ------------------------------------------------------------------

// URL patterns that MUST never be cached (AI provider API calls)
const AI_PROVIDER_PATTERNS = [
  "/v1/chat/completions",
  "/v1/messages",
  "generateContent",
];

function isAIProviderCall(url) {
  return AI_PROVIDER_PATTERNS.some((pattern) => url.includes(pattern));
}

/**
 * Fingerprinted assets: the filename changes whenever the bytes change, so a
 * cache hit can never be stale. These are safe to serve cache-first.
 */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/editor/assets/") || url.pathname.startsWith("/assets/");
}

/**
 * The two documents whose URLs never change: the editor and the home page.
 * Serving either cache-first would pin a returning visitor to whatever build
 * they first loaded — a second, worse copy of the four-hour edge cache this
 * project already got bitten by. Network-first, cache only as the offline
 * fallback.
 *
 * "/" MUST be listed here and not merely in APP_SHELL. The guard further down
 * lets any APP_SHELL path through to the CACHE-FIRST branch, so adding "/" to
 * that list alone would have frozen the landing page at whatever bytes the
 * visitor's install first fetched — the opposite of the reason it is cached.
 */
function isAppDocument(url) {
  return (
    url.pathname === "/" ||
    url.pathname === "/editor/" ||
    url.pathname === "/editor/index.html"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (isAIProviderCall(request.url)) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // ---- Documents: network first, cache as the offline fallback -------------
  if (isAppDocument(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((c) => c || Response.error())),
    );
    return;
  }

  // ---- Fingerprinted assets and precached icons: cache first ---------------
  if (!isImmutableAsset(url) && !APP_SHELL.includes(url.pathname)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;

        // If we asked for JS/CSS but got HTML, it is a fallback for a missing
        // asset — caching it would persist the 404 as a broken page.
        const ct = response.headers.get("Content-Type") || "";
        if (
          (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) &&
          ct.includes("text/html")
        ) {
          return response;
        }

        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    }),
  );
});
