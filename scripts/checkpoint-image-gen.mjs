// ---------------------------------------------------------------------------
// Image generation checkpoint — end-to-end test of the two-call pipeline.
//
// Usage:  node scripts/checkpoint-image-gen.mjs
//
// Prerequisites:
//   DEEPSEEK_API_KEY  — for the Arabic→English bridge call
//   TOGETHER_API_KEY  — for the image generation (FLUX.1 schnell, free)
//
// If either is missing the script tells you and exits.
// ---------------------------------------------------------------------------

const ARABIC_DESC = "بوابة حجرية قديمة عند غروب الشمس، وحارس واقف تحتها";

async function main() {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const togetherKey = process.env.TOGETHER_API_KEY;

  if (!deepseekKey || !togetherKey) {
    console.log("API keys missing. Set both DEEPSEEK_API_KEY and TOGETHER_API_KEY.");
    console.log(`  DEEPSEEK_API_KEY: ${deepseekKey ? "SET" : "MISSING"}`);
    console.log(`  TOGETHER_API_KEY: ${togetherKey ? "SET" : "MISSING"}`);
    process.exit(1);
  }

  // ---- Call 1: Arabic → English prompt (DeepSeek) -----------------------------
  console.log("=== Call 1: أترجم الوصف… ===");
  console.log(`Arabic description: "${ARABIC_DESC}"`);
  const t0 = Date.now();

  const bridgeRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${deepseekKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "You are an image-generation prompt engineer. " +
            "Given an Arabic description for a story illustration, write a concise " +
            "English prompt suitable for an image generation model. " +
            "Include style, lighting, composition, and mood. " +
            "The illustration style should be painterly and atmospheric — " +
            "think storybook art, not photorealistic. " +
            "Output ONLY the English prompt. No explanation, no prefix, no quotation marks.",
        },
        { role: "user", content: ARABIC_DESC },
      ],
      temperature: 0.7,
      max_tokens: 200,
    }),
  });

  if (!bridgeRes.ok) {
    const err = await bridgeRes.text();
    console.error(`Bridge call failed (${bridgeRes.status}): ${err.slice(0, 500)}`);
    process.exit(1);
  }

  const bridgeJson = await bridgeRes.json();
  const englishPrompt = bridgeJson.choices?.[0]?.message?.content?.trim();
  if (!englishPrompt) {
    console.error("Bridge call returned no text.");
    process.exit(1);
  }

  const translateMs = Date.now() - t0;
  console.log(`English prompt: "${englishPrompt}"`);
  console.log(`Translation took ${translateMs}ms`);
  console.log();

  // ---- Call 2: English prompt → image (Together FLUX.1 schnell) ---------------
  console.log("=== Call 2: أرسم الصورة… ===");
  const t1 = Date.now();

  const imageRes = await fetch("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${togetherKey}`,
    },
    body: JSON.stringify({
      model: "black-forest-labs/FLUX.1-schnell",
      prompt: englishPrompt,
      width: 1024,
      height: 768,
      steps: 4,
      n: 1,
      response_format: "b64_json",
    }),
  });

  if (!imageRes.ok) {
    const err = await imageRes.text();
    console.error(`Image call failed (${imageRes.status}): ${err.slice(0, 500)}`);
    process.exit(1);
  }

  const imageJson = await imageRes.json();
  const b64 = imageJson.data?.[0]?.b64_json;
  if (!b64) {
    console.error("Image call returned no data.");
    console.error("Response:", JSON.stringify(imageJson, null, 2).slice(0, 500));
    process.exit(1);
  }

  const drawMs = Date.now() - t1;
  const totalSec = ((translateMs + drawMs) / 1000).toFixed(1);
  const pngBytes = Buffer.from(b64, "base64").length;
  const dataUrl = `data:image/png;base64,${b64}`;

  console.log(`Raw PNG bytes from provider: ${pngBytes.toLocaleString()}`);
  console.log(`Translation: ${translateMs}ms | Draw: ${drawMs}ms | Total: ${totalSec}s`);

  // ---- Verify: the English prompt is NOT in the image data --------------------
  const hasPrompt = dataUrl.includes(englishPrompt);
  console.log(`English prompt persisted in image data: ${hasPrompt ? "⚠️ YES" : "✅ NO"}`);

  // ---- Summary ----------------------------------------------------------------
  console.log();
  console.log("=== CHECKPOINT SUMMARY ===");
  console.log(`Provider used:        Together AI (FLUX.1 schnell, free)`);
  console.log(`English prompt:       "${englishPrompt}"`);
  console.log(`Raw PNG bytes:        ${pngBytes.toLocaleString()}`);
  console.log(`Translation:           ${translateMs}ms`);
  console.log(`Draw:                  ${drawMs}ms`);
  console.log(`Total seconds:         ${totalSec}s`);
  console.log(`Prompt persisted:     ${hasPrompt ? "YES (unexpected)" : "NO (correct)"}`);

  // Write the raw PNG to disk so it can be inspected
  const fs = await import("fs");
  fs.writeFileSync("checkpoint-image.png", Buffer.from(b64, "base64"));
  console.log(`Wrote checkpoint-image.png for visual inspection.`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
