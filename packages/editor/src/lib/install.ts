// ---------------------------------------------------------------------------
// PWA install offer — platform detection and the "do not nag" rules.
//
// Approach follows C:\askosta (index.html, "PWA install prompt"): capture
// `beforeinstallprompt`, preventDefault it, stash the event, and reveal our own
// Arabic control; on click call prompt() and await userChoice; hide on
// `appinstalled`. The label and glyph are Osta's, verbatim: 📲 ثبّت التطبيق.
//
// Osta stops there. It has no manifest and no service worker, so the event can
// never actually fire on it and the other four behaviours in this brief have no
// prior art to copy: iOS instructions, the already-installed check, remembered
// dismissal, and the engagement gate. Those are new here.
// ---------------------------------------------------------------------------

const DISMISSED_KEY = "aqlamna-install-dismissed";
const ENGAGED_KEY = "aqlamna-install-engaged";

/**
 * The event Chromium fires when the app meets the install criteria. It is not
 * in lib.dom, so it is declared here rather than cast to `any`.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/**
 * Already running as an installed app? Then there is nothing to offer.
 * `display-mode: standalone` covers Android and desktop; iOS never implemented
 * it for home-screen apps and exposes `navigator.standalone` instead.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true;
  return (navigator as { standalone?: boolean }).standalone === true;
}

/** iPhone, iPod, and iPadOS 13+ (which reports itself as a Mac with a touchscreen). */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/**
 * iOS Safari specifically. Add to Home Screen is a Safari feature — Chrome,
 * Firefox, Edge and Opera on iOS render with WebKit but do NOT offer it, so
 * showing them these instructions would send the user hunting for a menu item
 * that is not there.
 */
export function isIosSafari(): boolean {
  if (!isIos()) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(navigator.userAgent);
}

export function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // No localStorage (private mode): treat as not dismissed. The user can
    // still close it; it just will not be remembered, which is the honest
    // failure mode — better than hiding the offer entirely.
    return false;
  }
}

export function setDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    /* see isDismissed */
  }
}

/**
 * Has the writer actually done something yet — typed a line, or played their
 * story? An install offer on a page someone has looked at for two seconds is
 * a nag; after they have written, it is an answer to "can I keep this?".
 */
export function isEngaged(): boolean {
  try {
    return localStorage.getItem(ENGAGED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setEngaged(): void {
  try {
    localStorage.setItem(ENGAGED_KEY, "1");
  } catch {
    /* see isDismissed */
  }
}

/** Nothing to offer if it is installed, already refused, or unearned. */
export function canOfferInstall(engaged: boolean): boolean {
  return engaged && !isStandalone() && !isDismissed();
}
