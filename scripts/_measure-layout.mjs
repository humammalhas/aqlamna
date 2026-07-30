// Measure pane positions on deployed editor across all three views.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1425, height: 900 });

// Set onboarding flag so overlay never appears
await page.goto("https://aqlamna.org/editor/");
await page.evaluate(() => {
  localStorage.clear();
  indexedDB.deleteDatabase("aqlamna-editor");
  localStorage.setItem("aqlamna-onboarding-done", "1");
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// Click شغّل
await page.locator("button", { hasText: "▶ شغّل" }).first().click({ force: true });
await page.waitForTimeout(1500);

const views = [
  { name: "\u0646\u0635", selector: "\u0646\u0635" },
  { name: "\u0645\u062E\u0637\u0637", selector: "\u0645\u062E\u0637\u0637" },
  { name: "\u0627\u0644\u0627\u062B\u0646\u0627\u0646", selector: "\u0627\u0644\u0627\u062B\u0646\u0627\u0646" },
];

for (const view of views) {
  await page.locator("button", { hasText: view.selector }).click({ force: true });
  await page.waitForTimeout(1000);
  console.log("\n=== " + view.name + " ===");

  const m = await page.evaluate(() => {
    var r = {};
    var p = document.querySelector(".player-pane");
    var c = document.querySelector(".cm-editor");
    var f = document.querySelector(".react-flow");

    if (p) {
      var b = p.getBoundingClientRect();
      r.player = { x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height), pos: getComputedStyle(p).position };
    }
    if (c) {
      var b2 = c.getBoundingClientRect();
      r.cm = { x: Math.round(b2.x), w: Math.round(b2.width), h: Math.round(b2.height), pos: getComputedStyle(c).position };
      var cont = c.closest("[style*=flex]") || c.parentElement;
      if (cont) r.cmContH = Math.round(cont.getBoundingClientRect().height);
    }
    if (f) {
      var b3 = f.getBoundingClientRect();
      r.rf = { x: Math.round(b3.x), w: Math.round(b3.width), pos: getComputedStyle(f).position };
    }
    return r;
  });

  if (m.player && m.cm) {
    console.log("  player: x=" + m.player.x + " w=" + m.player.w + " pos=" + m.player.pos);
    console.log("  editor: x=" + m.cm.x + " w=" + m.cm.w + " pos=" + m.cm.pos);
    console.log("  player.right=" + (m.player.x + m.player.w) + " vs editor.left=" + m.cm.x);
    console.log("  sum w: " + (m.player.w + m.cm.w));
    if (m.cmContH) console.log("  cm h=" + m.cm.h + " container=" + m.cmContH);
  }
  if (m.player && m.rf) {
    console.log("  player: x=" + m.player.x + " w=" + m.player.w + " pos=" + m.player.pos);
    console.log("  canvas: x=" + m.rf.x + " w=" + m.rf.w + " pos=" + m.rf.pos);
    console.log("  player.right=" + (m.player.x + m.player.w) + " vs canvas.left=" + m.rf.x);
    console.log("  sum w: " + (m.player.w + m.rf.w));
  }
}

await browser.close();
