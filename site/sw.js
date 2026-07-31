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
//   cached   the editor app shell and static assets (/editor/*, /assets/*)
//   never    every content page — /, /docs/*, /privacy, /terms, the exported
//            stories. Those must always be fresh. Privacy and terms are legal
//            documents; serving a stale copy from a cache is not acceptable,
//            and this project has already lost an evening to stale artifacts.
//   never    AI provider API calls. A cached AI response is a correctness bug.
//
// Bump CACHE_VERSION on every deploy to replace the old cache.
// ---------------------------------------------------------------------------

const CACHE_VERSION = "aqlamna-v6";
const CACHE_NAME = `aqlamna-app-${CACHE_VERSION}`;

// ---- Resources to precache on install --------------------------------------

const APP_SHELL = [
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
 * Only the editor application and the shared static assets are cached.
 * Everything else — content pages, docs, legal pages, exported stories — goes
 * straight to the network every time.
 */
function isCacheable(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;

  const path = url.pathname;
  if (APP_SHELL.includes(path)) return true;
  if (path.startsWith("/editor/")) return true;
  if (path.startsWith("/assets/")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;
  if (isAIProviderCall(request.url)) return;
  if (!isCacheable(request)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;

        // If we asked for JS/CSS but got HTML, it is an SPA fallback for a
        // missing asset — caching it would persist the 404 as a broken page.
        const ct = response.headers.get("Content-Type") || "";
        const path = new URL(request.url).pathname;
        if ((path.endsWith(".js") || path.endsWith(".css")) && ct.includes("text/html")) {
          return response;
        }

        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clone);
        });
        return response;
      });
    }),
  );
});
