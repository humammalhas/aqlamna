// ---------------------------------------------------------------------------
// Breakpoints — three, and only three.
//
//   phone    < 40rem   (640px)
//   tablet   40rem – 64rem
//   desktop  >= 64rem  (1024px)
//
// The old code read `window.innerWidth <= 768` once during render with no
// resize listener, so the layout never changed after load and 768px sat in the
// wrong bucket. matchMedia + a subscription is the fix.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from "react";

export type Breakpoint = "phone" | "tablet" | "desktop";

const PHONE = "(max-width: 39.999rem)";
const DESKTOP = "(min-width: 64rem)";

/** How many panes may be visible at once at each size. */
export const MAX_PANES: Record<Breakpoint, number> = {
  phone: 1,
  tablet: 2,
  desktop: 3,
};

export function currentBreakpoint(): Breakpoint {
  if (typeof window === "undefined" || !window.matchMedia) return "desktop";
  if (window.matchMedia(PHONE).matches) return "phone";
  if (window.matchMedia(DESKTOP).matches) return "desktop";
  return "tablet";
}

function subscribe(onChange: () => void): () => void {
  const queries = [window.matchMedia(PHONE), window.matchMedia(DESKTOP)];
  for (const q of queries) q.addEventListener("change", onChange);
  return () => {
    for (const q of queries) q.removeEventListener("change", onChange);
  };
}

export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, currentBreakpoint, () => "desktop");
}
