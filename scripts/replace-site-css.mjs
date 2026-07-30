// scripts/replace-site-css.mjs
// Replace inline <style> blocks in site HTML pages with <link> to aqlamna.css
// plus minimal layout-only CSS.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const siteDir = resolve(root, "site");

const LAYOUT_CSS = `
.page{inline-size:100%;max-inline-size:48rem;padding-inline:1.5rem;padding-block:2rem}
.hero{text-align:center;padding-block:3rem 1.5rem}
.hero-logo{display:block;max-inline-size:180px;margin-inline:auto;margin-block-end:1.5rem}
.hero-title{font-size:2.25rem;font-weight:700}
.hero-subtitle{font-size:1.125rem;max-inline-size:32rem;margin-inline:auto}
.demo-section{margin-block:2rem}
.demo-heading{font-size:1.125rem;font-weight:700;margin-block-end:.75rem;text-align:center}
.demo-label{font-size:.875rem;margin-block-end:.75rem;text-align:center}
.demo-frame{inline-size:100%;block-size:520px;border-radius:8px;overflow:hidden}
@media(max-inline-size:480px){.demo-frame{block-size:480px}}
.cta-wrap{text-align:center;margin-block:2rem}
.cta-button{display:inline-block;font-size:1.125rem;font-weight:700;padding-inline:2.5rem;padding-block:.875rem;border-radius:8px;text-decoration:none;transition:background .2s}
.loop-section{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-block:2rem}
@media(max-inline-size:600px){.loop-section{grid-template-columns:1fr}}
.loop-card{border-radius:8px;overflow:hidden}
.loop-card h3{font-size:.8125rem;font-weight:700;padding:.625rem .875rem;margin:0}
.loop-source{padding:.75rem;margin:0;font-size:.8125rem;line-height:1.7;overflow-x:auto;direction:rtl;text-align:start;font-family:"Courier New",monospace;white-space:pre}
.loop-result{padding:.75rem}
.loop-prose{font-size:.9375rem;margin-block-end:.75rem;line-height:1.75}
.loop-choices button{display:block;inline-size:100%;padding:.5rem .75rem;margin-block-end:.375rem;font-size:.875rem;font-family:inherit;border-radius:6px;cursor:default}
.features{margin-block:3rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:2rem}
.feature h2{font-size:1.25rem;font-weight:700;margin-block-end:.5rem}
.feature p{font-size:1rem;line-height:1.75}
.privacy-line{margin-block:3rem 2rem;padding:1.5rem;border-radius:8px;text-align:center}
.privacy-line p{font-size:.9375rem;line-height:1.75}
.site-footer{margin-block-start:auto;padding-block:2rem;text-align:center;font-size:.8125rem}
.site-footer nav{display:flex;flex-wrap:wrap;justify-content:center;gap:1.5rem;margin-block-end:1rem}
.site-footer a{text-decoration:none}
.back-link{text-align:center;margin-block:3rem 2rem}
.back-link a{text-decoration:none;font-size:.9375rem}
.english-link{text-align:center;margin-block-start:3rem;font-size:.8125rem}
.prose{max-inline-size:40rem;margin-inline:auto}
.docs-section{margin-block:2rem;text-align:center}
.docs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(8rem,1fr));gap:.75rem;margin-block-start:1rem}
.docs-card{padding:1rem;border-radius:8px;text-decoration:none}
.docs-card h3{font-size:1rem;font-weight:700;margin-block-end:.25rem}
.docs-card-note{font-size:.75rem;margin:0}
`.trim();

const LINK = '<link rel="stylesheet" href="/assets/aqlamna.css">';

function replaceStyleBlock(filePath) {
  let html = readFileSync(filePath, "utf8");
  const start = html.indexOf("<style>");
  const end = html.indexOf("</style>") + 8;
  if (start === -1 || end === 7) {
    console.log(`  SKIP ${filePath} — no <style> block`);
    return;
  }
  html = html.substring(0, start) + LINK + "\n  <style>\n" + LAYOUT_CSS + "\n  " + html.substring(end);
  writeFileSync(filePath, html, "utf8");
  console.log(`  DONE ${filePath}`);
}

const files = ["index.html", "privacy.html", "terms.html"];
for (const f of files) {
  replaceStyleBlock(resolve(siteDir, f));
}
