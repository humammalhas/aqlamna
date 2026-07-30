// ---------------------------------------------------------------------------
// PlayerPane — mounts the @aqlamna/runtime player when storyJson is available.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { useStore } from "../store.js";
import { mount, type StoryJSON } from "@aqlamna/runtime";

export default function PlayerPane() {
  const storyJson = useStore((s) => s.storyJson);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!storyJson || !containerRef.current) return;

    // Clear previous content
    containerRef.current.innerHTML = "";

    const unmount = mount(storyJson as unknown as StoryJSON, containerRef.current, {
      showToolbar: true,
    });

    return () => {
      unmount();
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
