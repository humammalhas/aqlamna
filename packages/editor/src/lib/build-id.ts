// ---------------------------------------------------------------------------
// Which build is this?
//
// Read off the module's own URL — Vite names it `index-<hash>.js`, and that
// hash changes exactly when the bytes do. Nothing to inject, nothing to keep in
// sync, and no timestamp that would give every rebuild a new identity whether
// or not anything changed.
//
// It exists because "the editor is running an old build" was invisible from
// inside the editor. An author pasted a valid API key into a bundle whose model
// IDs had been retired, saw the AI fail, and had no way to tell that what they
// were looking at was not what the site had shipped. Now the settings panel can
// show them, and a bug report can carry it.
// ---------------------------------------------------------------------------

/**
 * e.g. "C7p7TcCW", or "dev" when running unbundled.
 *
 * Read from the `<script src>` the document actually loaded, not from
 * `import.meta.url` — that was the first attempt and it produced "dev" in a
 * real build, which is exactly the wrong answer for a value whose whole job is
 * to tell you which build you are looking at. The document names one module
 * script and its name is the build.
 */
function readBuildId(): string {
  try {
    for (const el of document.querySelectorAll("script[src]")) {
      const m = (el.getAttribute("src") ?? "").match(/index-([A-Za-z0-9_-]+)\.js/);
      if (m) return m[1]!;
    }
  } catch {
    /* no DOM (a test importing this module directly) */
  }
  return "dev";
}

export const BUILD_ID: string = readBuildId();

/**
 * Throw away every cached copy of the app and reload from the network.
 *
 * A hard refresh does NOT do this: it bypasses the browser's own HTTP cache and
 * then hands the request to the service worker, which answers from the Cache
 * Storage it controls. That is why this project shipped fixes that two
 * different browsers could not see for days while incognito was fine — and why
 * a button that does the real thing has to exist somewhere a person can find
 * it.
 *
 * Order matters: unregister first, so the reload is not intercepted by the
 * worker being torn down.
 */
export async function forceFreshCopy(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    /* private mode, or a browser with no worker support — the reload still helps */
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    /* nothing cached, or storage denied */
  }

  // A query string the browser has never seen defeats any copy still held for
  // the bare URL — belt and braces after the two deletions above.
  const url = new URL(window.location.href);
  url.searchParams.set("_", String(Math.floor(performance.now())));
  window.location.replace(url.toString());
}
