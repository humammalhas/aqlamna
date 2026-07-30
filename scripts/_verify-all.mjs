import { chromium } from "playwright";

const b = await chromium.launch();
const p = await b.newPage();
await p.setViewportSize({ width: 1425, height: 900 });

// FIX 1: Docs colours
const docs = ["البداية.html", "المرجع.html", "الأخطاء.html"];
console.log("=== FIX 1 ===");
for (const d of docs) {
  await p.goto("https://aqlamna.org/docs/" + d, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  const m = await p.evaluate(() => {
    const h1 = document.querySelector("h1");
    const par = document.querySelector("p");
    const pre = document.querySelector("pre");
    const s = document.querySelector("style");
    return {
      h1: h1 ? getComputedStyle(h1).color : "none",
      p: par ? getComputedStyle(par).color : "none",
      preBg: pre ? getComputedStyle(pre).backgroundColor : "none",
      styleLen: s ? s.textContent.length : -1,
    };
  });
  console.log("  " + d + ": h1=" + m.h1 + " p=" + m.p + " preBg=" + m.preBg + " styleLen=" + m.styleLen);
}

// FIX 4: CTA button
console.log("\n=== FIX 4 ===");
await p.goto("https://aqlamna.org/", { waitUntil: "networkidle" });
const cta = await p.evaluate(() => {
  const btn = document.querySelector(".cta-button");
  if (!btn) return { bg: "NONE" };
  return { bg: getComputedStyle(btn).backgroundColor };
});
console.log("  CTA bg: " + cta.bg);

// FIX 5-6: Footer
console.log("\n=== FIX 6 ===");
const fi = await p.evaluate(() => {
  const links = document.querySelectorAll("footer a");
  const r = [];
  links.forEach(a => r.push(a.textContent.trim() + " | " + (a.getAttribute("target") || "no-target")));
  return r;
});
for (const l of fi) console.log("  " + l);

await b.close();
