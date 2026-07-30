// scripts/_strip-colors.mjs — replace the STYLE block in build-docs.mjs
// with layout-only rules. Colours come from aqlamna.css.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = resolve(__dirname, "build-docs.mjs");
let content = readFileSync(file, "utf8");

const newStyle = `// STYLE contains ONLY layout rules (fonts, sizing, spacing, flex, grid).
// All colours come from the linked /assets/aqlamna.css stylesheet.
// If you add a hex/rgb/named colour here, lint-colors will fail the build.
const STYLE = \`
 *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
 html{font-family:"IBM Plex Sans Arabic","Noto Sans Arabic","Amiri","Tajawal",system-ui,sans-serif;
   font-size:1.0625rem;line-height:1.9;scroll-behavior:smooth}
 body{direction:rtl;min-block-size:100dvb}
 .wrap{max-inline-size:46rem;margin-inline:auto;padding-inline:1.25rem;padding-block:1.5rem 4rem}
 nav.top{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;
   padding-block:1rem;border-block-end:1px solid;margin-block-end:2rem}
 nav.top a{text-decoration:none;font-size:.9375rem;
   padding:.35rem .85rem;border:1px solid;border-radius:.5rem}
 nav.top .home{margin-inline-end:auto;font-weight:700;border:0;padding-inline:0}
 h1{font-size:1.875rem;margin-block:1.5rem 1rem;line-height:1.4}
 h2{font-size:1.375rem;margin-block:2.25rem .75rem;line-height:1.5;
   padding-block-end:.4rem;border-block-end:1px solid}
 h3{font-size:1.125rem;margin-block:1.75rem .5rem}
 h4{font-size:1rem;margin-block:1.25rem .5rem}
 p{margin-block:.85rem}
 ul,ol{margin-block:.85rem;padding-inline-start:1.5rem}
 li{margin-block:.35rem}
 strong{font-weight:700}
 hr{border:0;border-block-start:1px solid;margin-block:2.5rem}
 code{font-family:"Courier New",monospace;font-size:.9em;
   padding:.1em .35em;border-radius:.25rem;unicode-bidi:isolate}
 pre{border:1px solid;border-radius:.5rem;
   padding:1rem 1.15rem;margin-block:1rem;overflow-x:auto;direction:rtl;text-align:start}
 pre code{background:none;padding:0;font-size:.9375rem;line-height:1.8;
   white-space:pre-wrap;unicode-bidi:plaintext;display:block}
 blockquote{border-inline-start:3px solid;
   padding:.75rem 1rem;margin-block:1rem;border-radius:0 .35rem .35rem 0}
 table{inline-size:100%;border-collapse:collapse;margin-block:1.25rem;font-size:.9375rem}
 th,td{padding:.55rem .75rem;text-align:start;vertical-align:top}
 th{font-weight:700}
 footer{margin-block-start:3.5rem;padding-block-start:1.25rem;border-block-start:1px solid;
   font-size:.875rem;display:flex;flex-wrap:wrap;gap:.75rem 1.25rem}
 @media(max-width:34rem){html{font-size:1rem}nav.top .home{inline-size:100%;margin-block-end:.5rem}}
\`.trim();`;

// Replace from the STYLE comment to .trim();
content = content.replace(
  /\/\/ STYLE contains ONLY layout[\s\S]*?\.trim\(\);/,
  newStyle
);

writeFileSync(file, content, "utf8");
console.log("build-docs.mjs STYLE replaced with layout-only rules");
