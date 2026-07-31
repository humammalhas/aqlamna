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
// The path must be base-relative: the site build serves this app from
// /editor/, so a hardcoded "/sw.js" asked for a file at the site root that
// does not exist and logged a console error on every editor page load.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
}
