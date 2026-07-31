// ---------------------------------------------------------------------------
// InstallPrompt — a dismissible bar offering to install أقلامنا.
//
// Two paths, because the platforms differ:
//   Chromium  `beforeinstallprompt` fires once. If nothing calls
//             preventDefault() on it the moment passes and the browser decides
//             for itself whether to show its own mini-infobar — which on
//             Android is often never. Capture it, stash it, offer our own
//             button, and call prompt() when the user asks for it.
//   iOS       Safari has no such API at all. The only route is Share → Add to
//             Home Screen, so all we can do is say so.
//
// A bar at the bottom of the editor column, never a modal: the writer can keep
// typing straight through it.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store.js";
import {
  canOfferInstall,
  isIosSafari,
  isStandalone,
  isDismissed,
  setDismissed,
  type BeforeInstallPromptEvent,
} from "../lib/install.js";

type Outcome = "accepted" | "dismissed" | null;

export default function InstallPrompt() {
  const engaged = useStore((s) => s.engaged);

  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [closed, setClosed] = useState(() => isDismissed());
  const [installed, setInstalled] = useState(() => isStandalone());
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [iosSheet, setIosSheet] = useState(false);

  // Capture the event as early as possible. It fires once per page load and
  // there is no way to ask for it again.
  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setOutcome(choice.outcome);
    // The event is single-use: once prompt() has been called it cannot be
    // reused, so drop it either way. `installed` is NOT set here — the browser
    // fires `appinstalled` for that, and setting it here unmounted the bar
    // before it could report the outcome the caller asked for.
    setDeferred(null);
  }, [deferred]);

  const handleClose = useCallback(() => {
    setClosed(true);
    setDismissed();
  }, []);

  // Closing always wins. Being installed hides the OFFER but not the result of
  // an install the user just completed — otherwise clicking the button makes
  // the bar vanish with no confirmation at all.
  if (closed) return null;
  if (outcome === null && (installed || !canOfferInstall(engaged))) return null;

  const ios = isIosSafari();
  // Chromium that never fired the event is a browser that has decided the app
  // is not installable (or has it already). Say nothing rather than offer a
  // button that cannot work.
  if (!ios && !deferred && outcome === null) return null;

  return (
    <div
      role="region"
      aria-label="تثبيت التطبيق"
      data-install-prompt={ios ? "ios" : "chromium"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        flexWrap: "wrap",
        flexShrink: 0,
        paddingBlock: "0.625rem",
        paddingInline: "1rem",
        background: "var(--aq-surface-hi)",
        borderBlockStart: "1px solid var(--aq-border)",
        color: "var(--aq-text)",
        fontSize: "0.875rem",
      }}
    >
      {outcome !== null ? (
        <span style={{ flex: 1, minInlineSize: 0 }}>
          {outcome === "accepted" ? "تم تثبيت أقلامنا." : "لم يتم التثبيت."}
        </span>
      ) : ios ? (
        <>
          <span style={{ flex: 1, minInlineSize: 0 }}>
            ثبّت أقلامنا على شاشتك الرئيسية.
          </span>
          <button
            onClick={() => setIosSheet((v) => !v)}
            aria-expanded={iosSheet}
            data-install-button="ios"
            style={buttonStyle}
          >
            <span aria-hidden="true">📲</span> ثبّت التطبيق
          </button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, minInlineSize: 0 }}>
            ثبّت أقلامنا ليعمل دون اتصال.
          </span>
          <button onClick={handleInstall} data-install-button="chromium" style={buttonStyle}>
            <span aria-hidden="true">📲</span> ثبّت التطبيق
          </button>
        </>
      )}

      <button
        onClick={handleClose}
        aria-label="أغلق"
        title="أغلق"
        style={{
          minBlockSize: "44px",
          minInlineSize: "44px",
          fontSize: "1rem",
          fontFamily: "inherit",
          color: "var(--aq-muted)",
          background: "transparent",
          border: "1px solid var(--aq-border)",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        ✕
      </button>

      {ios && iosSheet && (
        <div
          data-install-sheet="ios"
          style={{
            inlineSize: "100%",
            marginBlockStart: "0.5rem",
            padding: "0.875rem 1rem",
            background: "var(--aq-surface)",
            border: "1px solid var(--aq-border)",
            borderRadius: "8px",
            lineHeight: 2,
          }}
        >
          <div style={{ fontWeight: 700, marginBlockEnd: "0.25rem" }}>
            لتثبيت أقلامنا على جهازك:
          </div>
          <div>
            ١. اضغط زر المشاركة <span aria-hidden="true">⬆️</span>
          </div>
          <div>٢. اختر «إضافة إلى الشاشة الرئيسية»</div>
        </div>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  minBlockSize: "44px",
  paddingBlock: "0.5rem",
  paddingInline: "1rem",
  fontSize: "0.875rem",
  fontWeight: 600,
  fontFamily: "inherit",
  color: "var(--aq-accent-text)",
  background: "var(--aq-accent)",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
