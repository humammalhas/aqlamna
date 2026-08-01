// ---------------------------------------------------------------------------
// A textarea that grows with its content.
//
// A scene card is a document, not a form field: a scrollbar inside a 3-line box
// inside a scrolling pane is two scrollbars fighting over one gesture. The
// height is recomputed on every value change, including changes that did not
// come from typing (an AI insertion, a story loaded from IndexedDB).
// ---------------------------------------------------------------------------

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { textarea as textareaStyle } from "./writer-ui.js";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  minRows?: number;
  style?: CSSProperties;
}

export default function AutoTextarea({
  value,
  onChange,
  placeholder,
  ariaLabel,
  minRows = 2,
  style,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.blockSize = "auto";
    el.style.blockSize = `${el.scrollHeight}px`;
  };

  useLayoutEffect(resize, [value]);

  // The pane can be hidden when the value first lands (a phone shows one pane
  // at a time), and `scrollHeight` is 0 on a display:none element. Re-measure
  // once the element is actually laid out.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined" || !ref.current) return;
    const ro = new ResizeObserver(resize);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      dir="rtl"
      rows={minRows}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...textareaStyle, ...style }}
    />
  );
}
