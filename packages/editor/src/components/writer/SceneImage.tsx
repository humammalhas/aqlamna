// ---------------------------------------------------------------------------
// The image row on a scene card — and the only place in the product from which
// an illustration can be generated.
//
// `image-gen.ts` and the write half of `image-db.ts` shipped on 31 Jul with a
// full two-call bridge, a 768px WebP downscaler and a byte budget, and **no
// caller anywhere**. Measured in the deployed bundle before this file existed:
// 0 occurrences of `generateImage`, 0 of `saveImage` — the bundler dropped both
// because nothing imported them. The settings panel let an author choose an
// image provider and paste a key that nothing could spend. This is the button.
//
// Two rules from IMAGES_SPEC.md are enforced here rather than explained:
//   - the description is the SUBJECT only; style belongs to أسلوب_الصور, one
//     line for the whole story, or ten pictures look like ten illustrators;
//   - image models cannot draw Arabic script, so the hint says describe a
//     scene, never a sign.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import type { StoryImage } from "../../lib/writer-model.js";
import { generateImage, suggestImageDescription, type GenStep } from "../../lib/image-gen.js";
import { imageIdentifiers } from "../../lib/generate-qalam.js";
import { loadImage, saveImage, putImage, deleteImage, formatBytes, DEFAULT_PROJECT_ID } from "../../lib/image-db.js";
import { hasImageApiKey, hasApiKey } from "../../lib/ai-keys.js";
import AutoTextarea from "./AutoTextarea.js";
import {
  accentButton,
  dangerButton,
  ghostButton,
  label as labelStyle,
  noteText,
  row,
  select,
  subCard,
} from "./writer-ui.js";

const NEW = "__جديد__";

interface Props {
  sceneIndex: number;
  /** Name of the image this scene shows, or null. */
  value: string | null;
  images: StoryImage[];
  imageStyle: string;
  /** The story's `أوصاف_الشخصيات` — keeps one character one person across scenes. */
  characters: string;
  /** The scene's own prose — what the suggestion is derived from. */
  sceneTitle: string;
  sceneProse: string;
  onChange: (name: string | null) => void;
  onCreate: () => string | null;
  onDescription: (name: string, description: string) => void;
}

export default function SceneImage({
  sceneIndex,
  value,
  images,
  imageStyle,
  characters,
  sceneTitle,
  sceneProse,
  onChange,
  onCreate,
  onDescription,
}: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [bytes, setBytes] = useState<number | null>(null);
  const [step, setStep] = useState<GenStep | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const declared = images.find((i) => i.name === value) ?? null;

  /**
   * The key the bytes live under — the image's identifier in the generated
   * `.qalam`, NOT its display name.
   *
   * `بوابة المدينة` compiles to `بوابة_المدينة`, and the player and the exporter
   * both look the bytes up by the compiled name. Saving them under the display
   * name put the picture on this card and nowhere else. See `imageIdentifiers`.
   */
  const storageKey = value ? (imageIdentifiers(images).get(value) ?? value) : null;

  // Load whatever has already been drawn for this image.
  useEffect(() => {
    let alive = true;
    if (!value || !storageKey) { setPreview(null); setBytes(null); return; }

    (async () => {
      try {
        let stored = await loadImage(DEFAULT_PROJECT_ID, storageKey);

        // Heal a picture drawn before the key was the identifier: it is sitting
        // under the display name, invisible to the player and to the export.
        // Move it rather than reading it from both places forever — one key.
        if (!stored && storageKey !== value) {
          const legacy = await loadImage(DEFAULT_PROJECT_ID, value);
          if (legacy) {
            await putImage(DEFAULT_PROJECT_ID, storageKey, legacy.dataUrl);
            await deleteImage(DEFAULT_PROJECT_ID, value).catch(() => {});
            stored = await loadImage(DEFAULT_PROJECT_ID, storageKey);
          }
        }

        if (!alive) return;
        setPreview(stored?.dataUrl ?? null);
        setBytes(stored?.bytes ?? null);
      } catch {
        if (alive) { setPreview(null); setBytes(null); }
      }
    })();

    return () => { alive = false; };
  }, [value, storageKey]);

  const draw = useCallback(async () => {
    if (!declared || !storageKey) return;
    const description = declared.description.trim();
    if (description.length === 0) {
      setError("اكتب وصف الصورة أولًا.");
      return;
    }
    setError(null);
    setStep("translate");
    try {
      const result = await generateImage(
        description,
        imageStyle.trim() || null,
        characters,
        (s) => setStep(s),
      );
      const stored = await saveImage(DEFAULT_PROJECT_ID, storageKey, result.dataUrl);
      setPreview(stored.dataUrl);
      setBytes(stored.bytes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر توليد الصورة.");
    } finally {
      setStep(null);
    }
  }, [declared, storageKey, imageStyle, characters]);

  const keyReady = hasImageApiKey();
  const textKeyReady = hasApiKey();

  /**
   * Propose the description from the prose the author already wrote.
   *
   * It fills the field rather than drawing straight away: the author reads it,
   * edits it, and presses ارسم الصورة when it says what they meant. An AI that
   * both writes the prompt and spends the money on it gives nobody a place to
   * disagree.
   */
  const suggest = useCallback(async () => {
    if (!declared) return;
    setError(null);
    setSuggesting(true);
    try {
      const text = await suggestImageDescription(sceneTitle, sceneProse, characters);
      if (text) onDescription(declared.name, text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر اقتراح وصف.");
    } finally {
      setSuggesting(false);
    }
  }, [declared, sceneTitle, sceneProse, characters, onDescription]);

  return (
    <div style={{ ...subCard, borderStyle: "dashed" }} data-writer-image={value ?? ""}>
      <div style={{ ...row, marginBlockStart: 0 }}>
        <span style={{ ...labelStyle, marginBlockEnd: 0 }}>صورة المقطع</span>
        <select
          aria-label={`صورة المقطع ${sceneIndex + 1}`}
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === NEW) { const made = onCreate(); if (made) onChange(made); return; }
            onChange(v === "" ? null : v);
          }}
          style={select}
        >
          <option value="">دون صورة</option>
          {images.map((i) => <option key={i.name} value={i.name}>{i.name}</option>)}
          <option value={NEW}>＋ صورة جديدة</option>
        </select>
      </div>

      {declared && (
        <>
          <div style={{ marginBlockStart: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBlockEnd: "0.25rem" }}>
              <span style={{ ...labelStyle, marginBlockEnd: 0 }}>وصف ما في الصورة</span>
              <button
                type="button"
                onClick={suggest}
                disabled={suggesting || !textKeyReady || sceneProse.trim().length === 0}
                title={
                  sceneProse.trim().length === 0
                    ? "اكتب نصّ المقطع أولًا"
                    : "اقرأ نصّ المقطع واقترح وصفًا"
                }
                style={{
                  ...ghostButton,
                  minBlockSize: "28px",
                  paddingBlock: "0.125rem",
                  fontSize: "0.75rem",
                  opacity: suggesting || !textKeyReady || sceneProse.trim().length === 0 ? 0.5 : 1,
                }}
              >
                {suggesting ? "✨ يقترح…" : "✨ اقترح من النصّ"}
              </button>
            </div>
            <AutoTextarea
              ariaLabel={`وصف صورة المقطع ${sceneIndex + 1}`}
              placeholder="من في الصورة، وأين، ومتى — الموضوع وحده"
              value={declared.description}
              onChange={(d) => onDescription(declared.name, d)}
            />
            <p style={{ ...noteText, marginBlockStart: "0.25rem" }}>
              اكتب الموضوع فقط. الإضاءة واللون والمزاج تأتي من أسلوب الصور، سطر واحد للقصة
              كلّها. ولا تطلب لافتة ولا كتابًا مفتوحًا — نماذج الرسم لا تكتب العربية.
            </p>
          </div>

          <div style={row}>
            <button
              type="button"
              onClick={draw}
              disabled={step !== null || !keyReady}
              style={{ ...accentButton, opacity: step !== null || !keyReady ? 0.6 : 1 }}
            >
              {step === "translate"
                ? "يترجم الوصف…"
                : step === "draw"
                  ? "يرسم…"
                  : preview
                    ? "أعد الرسم"
                    : "ارسم الصورة"}
            </button>
            {preview && (
              <button
                type="button"
                onClick={async () => {
                  await deleteImage(DEFAULT_PROJECT_ID, storageKey ?? declared.name).catch(() => {});
                  setPreview(null);
                  setBytes(null);
                }}
                style={dangerButton}
              >
                احذف الرسم
              </button>
            )}
            {bytes !== null && (
              <span style={{ ...noteText, whiteSpace: "nowrap" }}>{formatBytes(bytes)}</span>
            )}
          </div>

          {!keyReady && (
            <p style={{ ...noteText, color: "var(--aq-warning)" }}>
              أضف مفتاح مزوّد الصور من الإعدادات ⚙️ قبل الرسم. الصور ليست مجّانية عند أيّ
              مزوّد، والكتابة بمساعدة الذكاء الاصطناعي تعمل دونها.
            </p>
          )}

          {error && (
            <p style={{ ...noteText, color: "var(--aq-danger)" }}>{error}</p>
          )}

          {preview ? (
            <img
              src={preview}
              alt={declared.description || declared.name}
              style={{
                display: "block",
                inlineSize: "100%",
                maxInlineSize: "18rem",
                blockSize: "auto",
                marginBlockStart: "0.625rem",
                borderRadius: "8px",
                border: "1px solid var(--aq-border)",
              }}
            />
          ) : (
            // The same promise the exported story makes: an image that was never
            // drawn is a frame carrying its Arabic description, not a gap.
            <p
              style={{
                ...noteText,
                marginBlockStart: "0.625rem",
                padding: "0.75rem",
                border: "1px dashed var(--aq-border)",
                borderRadius: "8px",
              }}
            >
              {declared.description || "لم تُرسم بعد."}
            </p>
          )}
        </>
      )}

      {!declared && (
        <p style={{ ...noteText, marginBlockStart: "0.375rem" }}>
          الصور اختيارية تمامًا، والقصة تُصدَّر وتُقرأ دونها.
        </p>
      )}

    </div>
  );
}
