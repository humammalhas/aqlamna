import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import "./aqlamna-theme.css";
import "./index.css";

// Apply saved editor theme BEFORE first paint
(function () {
  const t = (function () { try { return localStorage.getItem("aqlamna-editor-theme"); } catch { return null; } })();
  if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
})();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register service worker in production only — it breaks HMR in dev.
//
// The worker lives at the SITE ROOT with scope "/", not under /editor/. An
// /editor/-scoped worker could only ever make the editor installable, and the
// page people actually open on a phone is the home page — where there was no
// manifest and no worker at all, so Chrome had nothing to offer and no install
// prompt ever appeared.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // Devices that visited before this change still carry the old /editor/
  // registration. Two workers on overlapping paths is a confusing state to
  // debug, so retire it explicitly rather than waiting for it to age out.
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) {
      if (reg.scope.endsWith("/editor/")) void reg.unregister();
    }
  });

  // The editor is the surface a stale worker hurts most: its bundle carries the
  // provider registry, so an author stuck on an old worker pastes a valid API
  // key into a build whose model IDs were retired, and the AI simply never
  // works. Reported twice, from two browsers, "no matter how much I hard
  // refresh" — a hard refresh does not reach past a service worker.
  //
  //   updateViaCache: "none"  fetch sw.js past the HTTP cache. The zone was
  //                           serving it with a four-hour TTL.
  //   reg.update()            ask on every load, not only on navigation.
  //   controllerchange        a NEW worker just replaced an OLD one, so the
  //                           JavaScript running right now is the previous
  //                           build. Reload once and be the new one.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Not on first install: nothing stale was replaced.
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((reg) => { void reg.update().catch(() => {}); })
    .catch((err) => {
      // console.error, not warn: a failed registration means no offline mode
      // AND no install prompt, because Chrome requires a live service worker
      // before it will fire `beforeinstallprompt`. This was a warning for
      // weeks while sw.js failed to parse and nobody noticed. The test suite
      // asserts zero console errors, so this now fails the build.
      console.error("Service worker registration failed:", err);
    });
}
