// ---------------------------------------------------------------------------
// PlayerPane — mounts the @aqlamna/runtime player when storyJson is available.
// Injects the dark theme CSS scoped to the player container so choices render
// as styled buttons.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { useStore } from "../store.js";
import { mount, type StoryJSON } from "@aqlamna/runtime";
import { DARK_THEME_CSS } from "../generated/runtime-bundle.js";

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

// ---- Component -------------------------------------------------------------

export default function PlayerPane() {
  const storyJson = useStore((s) => s.storyJson);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!storyJson || !containerRef.current) return;

    // Clear previous content
    containerRef.current.innerHTML = "";

    // Inject scoped theme CSS into the container
    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-aqlamna-theme", "dark");
    styleEl.textContent = scopeCss(DARK_THEME_CSS, ".player-pane");
    containerRef.current.appendChild(styleEl);

    // Mount the runtime player
    const unmount = mount(
      storyJson as unknown as StoryJSON,
      containerRef.current,
      { showToolbar: true },
    );

    return () => {
      unmount();
      // styleEl is already a child of the container, so innerHTML="" handles it
    };
  }, [storyJson]);

  if (!storyJson) {
    return (
      <div
        className="player-pane"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#5a5040",
          fontSize: "0.9375rem",
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
      style={{ flex: 1 }}
    />
  );
}
