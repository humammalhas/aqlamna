// scripts/build-docs.mjs — render the Arabic markdown docs into styled HTML pages.
//
// Input:  docs/*.md          (the source of truth, edited by hand)
// Output: site/docs/*.html   (what Cloudflare Pages serves)
//
// Zero dependencies on purpose — the docs use a small, known subset of
// markdown and a 200-line renderer we control beats a dependency we don't.
// If you add a markdown construct to docs/, add it here too or it renders
// as literal text — which is loud and obvious, not silent corruption.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const srcDir = resolve(root, "docs");
const outDir = resolve(root, "site", "docs");

/** Pages that get a nav entry, in order. Any other .md is rendered but not linked. */
const NAV = [
  { file: "البداية.md", label: "البداية", note: "الدليل التعليمي" },
  { file: "المرجع.md", label: "المرجع", note: "دليل اللغة" },
  { file: "الأخطاء.md", label: "الأخطاء", note: "رموز الخطأ" },
];

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inline markdown: code, bold, italic, links. Order matters — code first. */
function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    let h = href;
    if (/^\.\/.+\.md$/.test(h)) h = h.replace(/\.md$/, ".html");
    const ext = /^https?:/.test(h) ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${esc(h)}"${ext}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
  return s;
}

function renderTable(rows) {
  const cells = (line) =>
    line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  const th = head.map((c) => `<th>${inline(c)}</th>`).join("");
  const tb = body
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
    .join("\n");
  return `<table><thead><tr>${th}</tr></thead><tbody>\n${tb}\n</tbody></table>`;
}

function toHtml(md) {
  // Normalise CRLF first. Without this, a Windows-authored file silently
  // loses every heading: `$` in the heading regex will not match before a
  // trailing \r, so `# عنوان` falls through and renders as literal prose.
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      const cls = lang ? ` class="lang-${esc(lang)}"` : "";
      // code is LTR-neutral but contains Arabic — keep it RTL-readable, isolate operators
      out.push(`<pre${cls}><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const id = h[2].trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      out.push(`<h${lvl} id="${esc(id)}">${inline(h[2])}</h${lvl}>`);
      i++;
      continue;
    }

    // horizontal rule
    if (/^\s*---+\s*$/.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // table
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const buf = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) buf.push(lines[i++].trim());
      out.push(renderTable(buf));
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]))
        buf.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      out.push(`<ul>${buf.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`);
      continue;
    }

    // ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]))
        buf.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      out.push(`<ol>${buf.map((b) => `<li>${inline(b)}</li>`).join("")}</ol>`);
      continue;
    }

    // paragraph
    if (line.trim() === "") {
      i++;
      continue;
    }
    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(```|#{1,6}\s|>|\s*[-*]\s|\s*\d+[.)]\s|\s*\|)/.test(lines[i])
    )
      buf.push(lines[i++]);
    // A line that looks like a block opener but did not match any block rule
    // (e.g. a lone `|` with no separator row) leaves buf empty. Consume it as
    // prose — otherwise `i` never advances and the build hangs forever.
    if (buf.length === 0) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }

  return out.join("\n");
}

const STYLE = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-family:"IBM Plex Sans Arabic","Noto Sans Arabic","Amiri","Tajawal",system-ui,sans-serif;
  font-size:1.0625rem;line-height:1.9;color:#e0d6c2;background:#1a1713;scroll-behavior:smooth}
body{direction:rtl;min-block-size:100dvb}
.wrap{max-inline-size:46rem;margin-inline:auto;padding-inline:1.25rem;padding-block:1.5rem 4rem}
nav.top{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;
  padding-block:1rem;border-block-end:1px solid #34302a;margin-block-end:2rem}
nav.top a{color:#b8a88a;text-decoration:none;font-size:.9375rem;
  padding:.35rem .85rem;border:1px solid #34302a;border-radius:.5rem}
nav.top a:hover{color:#e0d6c2;border-color:#4a443c}
nav.top a.here{color:#1a1713;background:#d4a843;border-color:#d4a843}
nav.top .home{margin-inline-end:auto;color:#d4a843;font-weight:700;border:0;padding-inline:0}
h1{font-size:1.875rem;color:#d4a843;margin-block:1.5rem 1rem;line-height:1.4}
h2{font-size:1.375rem;color:#d4a843;margin-block:2.25rem .75rem;line-height:1.5;
  padding-block-end:.4rem;border-block-end:1px solid #2a2621}
h3{font-size:1.125rem;color:#e0d6c2;margin-block:1.75rem .5rem}
h4{font-size:1rem;color:#b8a88a;margin-block:1.25rem .5rem}
p{margin-block:.85rem}
ul,ol{margin-block:.85rem;padding-inline-start:1.5rem}
li{margin-block:.35rem}
a{color:#d4a843}
strong{color:#f0e6d2}
hr{border:0;border-block-start:1px solid #2a2621;margin-block:2.5rem}
code{font-family:"Courier New",monospace;font-size:.9em;background:#242019;
  color:#e8c877;padding:.1em .35em;border-radius:.25rem;unicode-bidi:isolate}
pre{background:#141210;border:1px solid #2a2621;border-radius:.5rem;
  padding:1rem 1.15rem;margin-block:1rem;overflow-x:auto;direction:rtl;text-align:start}
pre code{background:none;color:#d8cdb6;padding:0;font-size:.9375rem;line-height:1.8;
  white-space:pre-wrap;unicode-bidi:plaintext;display:block}
blockquote{border-inline-start:3px solid #d4a843;background:#211d18;
  padding:.75rem 1rem;margin-block:1rem;border-radius:0 .35rem .35rem 0;color:#cfc3aa}
blockquote code{background:#141210}
table{inline-size:100%;border-collapse:collapse;margin-block:1.25rem;font-size:.9375rem}
th,td{border:1px solid #2a2621;padding:.55rem .75rem;text-align:start;vertical-align:top}
th{background:#211d18;color:#d4a843;font-weight:700}
footer{margin-block-start:3.5rem;padding-block-start:1.25rem;border-block-start:1px solid #2a2621;
  color:#8a7f6d;font-size:.875rem;display:flex;flex-wrap:wrap;gap:.75rem 1.25rem}
footer a{color:#8a7f6d}
@media(max-width:34rem){html{font-size:1rem}nav.top .home{inline-size:100%;margin-block-end:.5rem}}
`.trim();

function page(title, navHtml, body) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#1a1713">
<meta name="description" content="${esc(title)} — توثيق أقلامنا، محرك القصص التفاعلية بالعربية.">
<link rel="icon" href="/assets/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="512x512" href="/assets/icon-512.png">
<title>${esc(title)} — أقلامنا</title>
<link rel="stylesheet" href="/assets/aqlamna.css"><style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<nav class="top">
  <a class="home" href="/">أقلامنا</a>
${navHtml}
  <a href="/editor/">المحرّر</a>
</nav>
<main>
${body}
</main>
<footer>
  <a href="/">الصفحة الرئيسية</a>
  <a href="/editor/">المحرّر</a>
  <a href="/privacy.html">الخصوصية</a>
  <a href="/terms.html">الشروط</a>
  <a href="https://github.com/humammalhas/aqlamna" target="_blank" rel="noopener">GitHub</a>
  <a href="https://github.com/humammalhas/aqlamna/discussions" target="_blank" rel="noopener">النقاشات</a>
</footer>
</div>
</body>
</html>
`;
}

mkdirSync(outDir, { recursive: true });

// الخصوصية.md / الشروط.md are already published as hand-written pages at
// /privacy.html and /terms.html. Emit a redirect rather than a second copy —
// two URLs for the same legal text is a liability, not a convenience.
const REDIRECTS = { "الخصوصية.md": "/privacy.html", "الشروط.md": "/terms.html" };

const sources = readdirSync(srcDir).filter((f) => f.endsWith(".md") && !/^(README|PRIVACY|TERMS)\.md$/.test(f));
let count = 0;

for (const file of sources) {
  if (REDIRECTS[file]) {
    const to = REDIRECTS[file];
    writeFileSync(
      resolve(outDir, file.replace(/\.md$/, ".html")),
      `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">` +
        `<meta http-equiv="refresh" content="0; url=${to}"><link rel="canonical" href="${to}">` +
        `<title>أقلامنا</title></head><body><a href="${to}">${to}</a></body></html>\n`,
      "utf8",
    );
    console.log(`  docs → site/docs/${file.replace(/\.md$/, ".html")}  (redirect → ${to})`);
    count++;
    continue;
  }
  const md = readFileSync(resolve(srcDir, file), "utf8");
  const title = (md.match(/^#\s+(.*)$/m)?.[1] ?? basename(file, ".md")).split("—")[0].trim();
  const navHtml = NAV.map((n) => {
    const href = `/docs/${encodeURIComponent(n.file.replace(/\.md$/, ".html"))}`;
    const here = n.file === file ? ' class="here"' : "";
    return `  <a href="${href}"${here}>${n.label}</a>`;
  }).join("\n");
  const html = page(title, navHtml, toHtml(md));
  const outFile = resolve(outDir, file.replace(/\.md$/, ".html"));
  writeFileSync(outFile, html, "utf8");
  count++;
  console.log(`  docs → site/docs/${basename(outFile)}  (${html.length} bytes)`);
}

console.log(`build-docs: ${count} page(s) written to site/docs/`);
