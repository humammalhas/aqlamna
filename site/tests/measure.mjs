// ---------------------------------------------------------------------------
// site/tests/measure.mjs — CLI wrapper around measure-lib.mjs.
//
//   node site/tests/measure.mjs https://aqlamna.org
//   node site/tests/measure.mjs http://localhost:8765 --widths=390,1440
//
// Deployment day taught this project that a change is not done until the
// artifact that ships has been measured. This is that measurement.
// ---------------------------------------------------------------------------

import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { PAGES, BEACON, measurePage, measureArrow, measureEditorPanes } from "./measure-lib.mjs";

const BASE = (process.argv[2] || "http://localhost:8765").replace(/\/$/, "");
const widthArg = process.argv.find((a) => a.startsWith("--widths"));
const WIDTHS = widthArg
  ? widthArg.split("=")[1].split(",").map(Number)
  : [390, 768, 1024, 1440];

// ---- CLI -------------------------------------------------------------------

// pathToFileURL, not string concatenation: on Windows the drive letter makes
// `file://C:/...` and `file:///C:/...` differ and the CLI silently never runs.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await chromium.launch();
  const results = [];

  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    for (const { path, label } of PAGES) {
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (m) => {
        if (m.type() === "error" && !m.text().includes(BEACON)) {
          consoleErrors.push(m.text().slice(0, 160));
        }
      });
      page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 160)));

      let data, arrow = null, panes = null, beacon = false;
      page.on("request", (r) => {
        if (r.url().includes(BEACON)) beacon = true;
      });
      try {
        await page.goto(BASE + path, {
          waitUntil: "networkidle",
          timeout: 45000,
        });
        await page.waitForTimeout(600);
        data = await measurePage(page);
        arrow = await measureArrow(page);
        if (label === "editor") panes = await measureEditorPanes(page);
      } catch (e) {
        data = { error: String(e).slice(0, 200) };
      }
      results.push({ width, label, path, beacon, consoleErrors, arrow, panes, ...data });
      await page.close();
    }
    await context.close();
  }

  await browser.close();
  console.log(JSON.stringify({ base: BASE, results }, null, 2));
}
