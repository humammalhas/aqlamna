// Live probe of the two-call image bridge, outside the browser.
//
// Call 1 (Arabic → English) uses the text provider's key.
// Call 2 (English → image) uses TOGETHER_API_KEY.
//
// This exists because IMAGES_SPEC.md's central claim — that Arabic sent
// straight to an image model returns the WRONG SUBJECT, not a worse picture —
// was measured once by hand and never since. Run it whenever the bridge or a
// provider changes. It never prints a key.
//
//   . C:\Users\asus\load_env.ps1
//   node scripts/probe-together.mjs <output-dir>

import { writeFileSync } from "node:fs";

const TOG = process.env.TOGETHER_API_KEY;
const DS = process.env.DEEPSEEK_API_KEY;
const outDir = process.argv[2] ?? ".";

console.log(TOG ? `together key: present (${TOG.length} chars)` : "together key: MISSING — call 1 only");
if (!DS) { console.error("DEEPSEEK_API_KEY missing — cannot run the bridge at all"); process.exit(1); }

const ARABIC = "سطح بيت حجري في عمّان عند العصر، صبيّ يمسك طائرة ورق زرقاء، والوادي خلفه";
const STYLE = "رسم كتب أطفال، ألوان ترابية";

const BRIDGE_SYSTEM =
  "Translate this Arabic description faithfully into English. " +
  "Output ONLY the English translation — no style, no lighting, no mood, " +
  "no composition, no camera direction, no atmosphere words. " +
  "Just the subject. No explanation, no prefix, no quotation marks.";

// ---- Call 1 — the text model -----------------------------------------------

const t0 = Date.now();
const r1 = await fetch("https://api.deepseek.com/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${DS}` },
  body: JSON.stringify({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: BRIDGE_SYSTEM },
      { role: "user", content: ARABIC },
    ],
    temperature: 0.7,
    max_tokens: 200,
  }),
});
if (!r1.ok) {
  console.error("translate failed:", r1.status, (await r1.text()).slice(0, 300));
  process.exit(1);
}
const english = (await r1.json()).choices[0].message.content.replace(/^["']|["']$/g, "").trim();
const translateMs = Date.now() - t0;

console.log("");
console.log("call 1 - translate:", translateMs + "ms");
console.log("  arabic :", ARABIC);
console.log("  english:", english);

// The claim under test: the bridge must translate the SUBJECT ONLY. Left to
// itself the model volunteers "cinematic composition, rich amber and deep
// violet sky, soft rim lighting" — and ten images come back looking like ten
// illustrators. Style must arrive only from أسلوب_الصور.
const invented = /cinematic|lighting|atmospher|mood|rim.light|golden hour|dramatic|vibrant|soft light/i;
console.log("  invented style words:", invented.test(english) ? "YES - bridge leaking" : "no");

// ---- Call 2 — the image model ----------------------------------------------

if (!TOG) {
  console.log("");
  console.log("[call 2 skipped - no TOGETHER_API_KEY]");
  process.exit(0);
}

const prompt = english + ", " + STYLE;
const t1 = Date.now();
const r2 = await fetch("https://api.together.xyz/v1/images/generations", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOG}` },
  body: JSON.stringify({
    model: "black-forest-labs/FLUX.1-schnell",
    prompt,
    width: 1024,
    height: 768,
    steps: 4,
    n: 1,
    response_format: "b64_json",
  }),
});
const drawMs = Date.now() - t1;

if (!r2.ok) {
  console.error("");
  console.error("call 2 FAILED:", r2.status, (await r2.text()).slice(0, 400));
  process.exit(1);
}

const b64 = (await r2.json()).data?.[0]?.b64_json;
console.log("");
console.log("call 2 - draw:", drawMs + "ms");
console.log("  prompt sent:", prompt);
if (!b64) { console.error("  no image returned"); process.exit(1); }

const bytes = Buffer.from(b64, "base64");
writeFileSync(outDir + "/probe.png", bytes);
console.log("  raw png bytes:", bytes.length.toLocaleString());
console.log("  written:", outDir + "/probe.png");
console.log("");
console.log("total:", (translateMs + drawMs) + "ms   (recorded baseline ~5,500ms)");
