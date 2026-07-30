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
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((err) => {
    console.warn("Service worker registration failed:", err);
  });
}
