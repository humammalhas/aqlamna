import { chromium } from "playwright";

const b = await chromium.launch();
const p = await b.newPage();
p.setViewportSize({ width: 1440, height: 900 });

await p.goto("https://aqlamna.org/editor/");
await p.evaluate(() => {
  localStorage.setItem("aqlamna-onboarding-done", "1");
});
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(2000);

// Load the example story so text and canvas have content
await p.locator("button", { hasText: "افتح مثالًا" }).click({ force: true });
await p.waitForTimeout(1000);

const combos = [
  ["text"],
  ["canvas"],
  ["text", "canvas"],
  ["player", "text"],
  ["player", "canvas"],
  ["player", "text", "canvas"],
];

for (const combo of combos) {
  await p.evaluate((c) => {
    localStorage.setItem("aqlamna-pane-player", c.includes("player") ? "1" : "0");
    localStorage.setItem("aqlamna-pane-text", c.includes("text") ? "1" : "0");
    localStorage.setItem("aqlamna-pane-canvas", c.includes("canvas") ? "1" : "0");
  }, combo);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2000);

  const m = await p.evaluate(() => {
    var results = [];
    // Text pane
    var cm = document.querySelector(".cm-editor");
    var cmContent = document.querySelector(".cm-content");
    results.push({
      type: "text",
      cmWidth: cm ? cm.clientWidth : 0,
      cmHeight: cm ? cm.clientHeight : 0,
      contentLen: cmContent ? cmContent.textContent.length : 0,
    });
    // Canvas pane
    var rf = document.querySelector(".react-flow");
    var nodes = document.querySelectorAll(".react-flow__node");
    var inView = 0;
    if (rf) {
      var rfRect = rf.getBoundingClientRect();
      nodes.forEach(function(n) {
        var nr = n.getBoundingClientRect();
        if (nr.right > rfRect.left && nr.left < rfRect.right &&
            nr.bottom > rfRect.top && nr.top < rfRect.bottom) inView++;
      });
    }
    results.push({
      type: "canvas",
      rfWidth: rf ? rf.clientWidth : 0,
      rfHeight: rf ? rf.clientHeight : 0,
      nodes: nodes.length,
      nodesInView: inView,
    });
    // Player pane
    var player = document.querySelector(".player-pane");
    results.push({
      type: "player",
      width: player ? player.clientWidth : 0,
      height: player ? player.clientHeight : 0,
      hasText: player ? player.textContent.trim().length > 0 : false,
    });
    return results;
  });

  console.log("\n" + combo.join("+"));
  for (var j = 0; j < m.length; j++) {
    var pa = m[j];
    if (pa.type === "text") console.log("  text: " + pa.cmWidth + "x" + pa.cmHeight + " content=" + pa.contentLen + " chars");
    if (pa.type === "canvas") console.log("  canvas: " + pa.rfWidth + "x" + pa.rfHeight + " nodes=" + pa.nodes + " inView=" + pa.nodesInView);
    if (pa.type === "player") console.log("  player: " + pa.width + "x" + pa.height + " hasText=" + pa.hasText);
  }
}

await b.close();
