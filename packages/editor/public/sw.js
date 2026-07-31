// ---------------------------------------------------------------------------
// Aqlamna service worker — offline-capable PWA.
//
// Strategy:
//   - App shell (HTML, JS, CSS, icons): cache-first — opens with no network.
//   - AI provider API calls: NEVER cached — always network, no fallback.
//     A cached AI response would be a correctness bug (stale story text).
//
// PLAIN JAVASCRIPT ONLY. Everything in public/ is copied to the build verbatim
// and is never compiled, so this file is parsed by the browser exactly as
// written. It previously carried TypeScript annotations (`event as
// ExtendableEvent`, `url: string`), which made every registration fail with
// "ServiceWorker script evaluation failed" — silently, because the caller only
// console.warn()s. A registered service worker with a fetch handler is one of
// Chrome's install criteria, so this also meant `beforeinstallprompt` never
// fired and the app was never installable on Android.
//
// Bump CACHE_VERSION on every deploy to replace the old cache.
// ---------------------------------------------------------------------------

const CACHE_VERSION = "aqlamna-v5";
const CACHE_NAME = `aqlamna-app-${CACHE_VERSION}`;

// ---- Resources to precache on install --------------------------------------

// Paths relative to the SW scope (/editor/). These are precached at install.
const APP_SHELL = [
  "/editor/",
  "/editor/index.html",
  "/editor/favicon.ico",
  "/editor/icon-192.png",
  "/editor/icon-512.png",
  "/editor/apple-touch-icon.png",
  "/editor/manifest.webmanifest",
];

// ---- Install: precache the app shell ---------------------------------------

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll rejects the whole install if ANY entry 404s, which would leave
      // the app permanently uninstallable. Add them individually so one
      // missing icon cannot take the service worker down with it.
      return Promise.all(
        APP_SHELL.map((path) =>
          cache.add(path).catch((err) => {
            console.warn("[sw] could not precache " + path, err);
          }),
        ),
      );
    }),
  );
  // Activate immediately — don't wait for old tabs to close
  self.skipWaiting();
});

// ---- Activate: purge old caches --------------------------------------------

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      // Claim all clients so the new SW controls pages immediately
      .then(() => self.clients.claim()),
  );
});

// ---- Fetch: cache-first for app shell, network-only for AI -----------------

// URL patterns that MUST never be cached (AI provider API calls)
const AI_PROVIDER_PATTERNS = [
  "/v1/chat/completions",
  "/v1/messages",
  "generateContent",
];

function isAIProviderCall(url) {
  return AI_PROVIDER_PATTERNS.some((pattern) => url.includes(pattern));
}

// App-shell file extensions we precache
const PRECACHED_EXTENSIONS = [
  ".html",
  ".js",
  ".css",
  ".ico",
  ".png",
  ".webmanifest",
  ".woff2",
];

function isAppShellRequest(request) {
  const url = new URL(request.url);

  // Same-origin only
  if (url.origin !== self.location.origin) return false;

  // Exact paths we precached
  if (APP_SHELL.includes(url.pathname)) return true;

  // Any resource with a precached extension from our origin
  return PRECACHED_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== "GET") return;

  // NEVER cache AI provider API calls — always go to network
  if (isAIProviderCall(request.url)) {
    return; // let the browser handle it (network-only, no SW intervention)
  }

  if (!isAppShellRequest(request)) return;

  // App shell: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      // Not in cache — fetch from network and cache for next time.
      // Never cache if the response is HTML masquerading as JS/CSS
      // (SPA fallback serves index.html for missing assets).
      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;

        const ct = response.headers.get("Content-Type") || "";
        const path = new URL(request.url).pathname;
        const isJS = path.endsWith(".js");
        const isCSS = path.endsWith(".css");

        // If we asked for JS/CSS but got HTML, it's a fallback — don't cache
        if ((isJS || isCSS) && ct.includes("text/html")) {
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
