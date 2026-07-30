// ---------------------------------------------------------------------------
// Aqlamna service worker — offline-capable PWA.
//
// Strategy:
//   - App shell (HTML, JS, CSS, icons): cache-first — opens with no network.
//   - AI provider API calls: NEVER cached — always network, no fallback.
//     A cached AI response would be a correctness bug (stale story text).
//
// Bump CACHE_VERSION on every deploy to replace the old cache.
// ---------------------------------------------------------------------------

const CACHE_VERSION = "aqlamna-v1";
const CACHE_NAME = `aqlamna-app-${CACHE_VERSION}`;

// ---- Resources to precache on install --------------------------------------

const APP_SHELL = [
  "/",
  "/index.html",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
];

// ---- Install: precache the app shell ---------------------------------------

self.addEventListener("install", (event) => {
  const evt = event as ExtendableEvent;
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    }),
  );
  // Activate immediately — don't wait for old tabs to close
  (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
});

// ---- Activate: purge old caches --------------------------------------------

self.addEventListener("activate", (event) => {
  const evt = event as ExtendableEvent;
  evt.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
    }),
  );
  // Claim all clients so the new SW controls pages immediately
  (self as unknown as ServiceWorkerGlobalScope).clients.claim();
});

// ---- Fetch: cache-first for app shell, network-only for AI -----------------

// URL patterns that MUST never be cached (AI provider API calls)
const AI_PROVIDER_PATTERNS = [
  "/v1/chat/completions",
  "/v1/messages",
  "generateContent",
];

function isAIProviderCall(url: string): boolean {
  return AI_PROVIDER_PATTERNS.some((pattern) => url.includes(pattern));
}

// App-shell file extensions we precache
const PRECACHED_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".css",
  ".ico",
  ".png",
  ".webmanifest",
  ".woff2",
]);

function isAppShellRequest(request: Request): boolean {
  const url = new URL(request.url);

  // Root or same-origin only
  if (url.origin !== self.location.origin) return false;

  // Exact paths we precached
  if (APP_SHELL.includes(url.pathname)) return true;

  // Any resource with a precached extension from our origin
  const path = url.pathname;
  for (const ext of PRECACHED_EXTENSIONS) {
    if (path.endsWith(ext)) return true;
  }

  return false;
}

self.addEventListener("fetch", (event) => {
  const evt = event as FetchEvent;
  const request = evt.request;

  // Only handle GET requests
  if (request.method !== "GET") return;

  const url = request.url;

  // NEVER cache AI provider API calls — always go to network
  if (isAIProviderCall(url)) {
    return; // let the browser handle it (network-only, no SW intervention)
  }

  // App shell: cache-first
  if (isAppShellRequest(request)) {
    evt.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        // Not in cache — fetch from network and cache for next time
        return fetch(request).then((response) => {
          if (!response || response.status !== 200) return response;

          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
          return response;
        });
      }),
    );
  }
});
