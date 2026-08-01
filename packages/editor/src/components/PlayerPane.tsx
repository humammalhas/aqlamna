// ---------------------------------------------------------------------------
// PlayerPane — mounts the @aqlamna/runtime player when storyJson is available.
// Injects the chosen theme CSS scoped to the player container so choices
// render as styled buttons. Theme is read from the Zustand store.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { useStore, type PlayerTheme } from "../store.js";
import { mount, type StoryJSON } from "@aqlamna/runtime";
import { loadImage, DEFAULT_PROJECT_ID } from "../lib/image-db.js";
import { DARK_THEME_CSS, LIGHT_THEME_CSS, BOOK_THEME_CSS } from "../generated/runtime-bundle.js";

const THEME_CSS: Record<string, string> = {
  dark: DARK_THEME_CSS,
  light: LIGHT_THEME_CSS,
  book: BOOK_THEME_CSS,
};

// ---- CSS scoping -----------------------------------------------------------

/**
 * Prefix every CSS selector in `css` with `scope` so the rules only apply
 * inside a scoped container. Handles comma-separated selectors, @media
 * queries, and replaces html/body with the scope itself.
 */
function scopeCss(css: string, scope: string): string {
  const rules: string[] = [];
  let depth = 0;
  let current = "";

  for (const ch of css) {
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        current += ch;
        rules.push(current.trim());
        current = "";
        continue;
      }
    }
    current += ch;
  }

  return rules
    .map((rule) => {
      const braceIdx = rule.indexOf("{");
      if (braceIdx === -1) return rule; // non-rule text (comments, etc.)

      const selector = rule.slice(0, braceIdx).trim();
      const body = rule.slice(braceIdx);

      // Recurse into @media blocks
      if (selector.startsWith("@media")) {
        const inner = body.slice(1, -1).trim(); // strip outer { }
        return `${selector} { ${scopeCss(inner, scope)} }`;
      }

      // Prefix each selector in a comma-separated list
      const prefixed = selector
        .split(",")
        .map((s) => {
          s = s.trim();
          if (s === "html" || s === "body") return scope;
          return `${scope} ${s}`;
        })
        .join(",\n");

      return `${prefixed} ${body}`;
    })
    .join("\n");
}

/** Cycle the player theme: dark → light → book → dark */
function cycleTheme(t: PlayerTheme): PlayerTheme {
  if (t === "dark") return "light";
  if (t === "light") return "book";
  return "dark";
}

// ---- Component -------------------------------------------------------------

export default function PlayerPane() {
  const storyJson = useStore((s) => s.storyJson);
  const playerTheme = useStore((s) => s.playerTheme);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * The story with its drawn images inlined, or null while they load.
   *
   * The compiled JSON carries only the DECLARATION of each image — name and
   * Arabic description. The bytes live in IndexedDB, because a story with ten
   * pictures would otherwise be megabytes of source re-serialised on every
   * keystroke. `export-html.ts` already inlines them on the way out; without
   * the same step here, ▶ شغّل showed the placeholder frame for a picture the
   * author had just watched appear on the card two inches away.
   */
  const [readyStory, setReadyStory] = useState<StoryJSON | null>(null);

  useEffect(() => {
    let alive = true;
    if (!storyJson) { setReadyStory(null); return; }

    const declared = (storyJson as unknown as {
      images?: Record<string, { alt: string; data?: string }>;
    }).images;

    if (!declared || Object.keys(declared).length === 0) {
      setReadyStory(storyJson as unknown as StoryJSON);
      return;
    }

    (async () => {
      const images: Record<string, { alt: string; data?: string }> = {};
      for (const [name, decl] of Object.entries(declared)) {
        try {
          const stored = await loadImage(DEFAULT_PROJECT_ID, name);
          images[name] = stored ? { alt: decl.alt, data: stored.dataUrl } : { alt: decl.alt };
        } catch {
          // A picture that will not load is a placeholder, never a dead player.
          images[name] = { alt: decl.alt };
        }
      }
      if (alive) setReadyStory({ ...(storyJson as unknown as StoryJSON), images });
    })();

    return () => { alive = false; };
  }, [storyJson]);

  useEffect(() => {
    if (!readyStory || !containerRef.current) return;

    // Clear previous content
    containerRef.current.innerHTML = "";

    // Inject scoped theme CSS into document.head, replacing any previous theme
    const STYLE_ID = "aqlamna-player-theme";
    let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      document.head.appendChild(styleEl);
    }
    const css = THEME_CSS[playerTheme] ?? DARK_THEME_CSS;
    styleEl.textContent = scopeCss(css, ".player-pane");

    // Mount the runtime player
    const unmount = mount(
      readyStory,
      containerRef.current,
      {
        showToolbar: true,
        onThemeToggle: () => {
          const current = useStore.getState().playerTheme;
          useStore.getState().setPlayerTheme(cycleTheme(current));
        },
      },
    );

    return () => {
      unmount();
    };
  }, [readyStory, playerTheme]);

  if (!storyJson) {
    return (
      <div
        className="player-pane"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--aq-dim)",
          fontSize: "0.9375rem",
          position: "relative",
        }}
      >
        <p>اضغط ▶ شغّل لتشغيل القصة</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="player-pane"
      style={{ flex: 1, minBlockSize: 0, overflow: "auto", position: "relative" }}
    />
  );
}
