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
import { isolateAscii } from "./bidi-isolate.mjs";

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
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${isolateAscii(esc(codes[Number(i)]))}</code>`);
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

/**
 * Drop the leading `# Title` line from a markdown body.
 *
 * The legal pages render that title in the hero AND render the body below it,
 * so /privacy and /terms each shipped two <h1> elements saying the same thing.
 * One document, one top-level heading.
 */
function stripLeadingTitle(md) {
  return md.replace(/^﻿?\s*#\s+.*(\r\n?|\n)/, "");
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
      // The block stays RTL so Arabic reads normally; every ASCII run inside it
      // is wrapped in an LTR isolate so `->` does not paint as `<-`.
      out.push(
        `<pre${cls}><code>${isolateAscii(esc(buf.join("\n")))}</code></pre>`,
      );
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

// STYLE contains ONLY layout rules (fonts, sizing, spacing, flex, grid).
// All colours come from the linked /assets/aqlamna.css stylesheet.
// If you add a hex/rgb/named colour here, lint-colors will fail the build.
const STYLE = `
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
   padding:1rem 1.15rem;margin-block:1rem;overflow-x:auto;overflow-wrap:break-word;
   max-inline-size:100%;direction:rtl;text-align:start}
 pre code{background:none;padding:0;font-size:.9375rem;line-height:1.8;
   white-space:pre-wrap;unicode-bidi:isolate;display:block}
 pre span[dir=ltr],code span[dir=ltr]{unicode-bidi:isolate}
 blockquote{border-inline-start:3px solid;
   padding:.75rem 1rem;margin-block:1rem;border-radius:0 .35rem .35rem 0}
 table{inline-size:100%;border-collapse:collapse;margin-block:1.25rem;font-size:.9375rem}
 th,td{padding:.55rem .75rem;text-align:start;vertical-align:top}
 th{font-weight:700}
 footer{margin-block-start:3.5rem;padding-block-start:1.25rem;border-block-start:1px solid;
   font-size:.875rem;display:flex;flex-wrap:wrap;gap:.75rem 1.25rem}
 table{display:block;overflow-x:auto;max-inline-size:100%}
 @media(max-width:40rem){
  html{font-size:1rem}
  .wrap{padding-inline:1.125rem}
  nav.top .home{inline-size:100%;margin-block-end:.5rem}
  nav.top a,footer a{display:inline-flex;align-items:center;justify-content:center;
   min-block-size:44px;min-inline-size:44px;flex-shrink:0}
  h1{font-size:1.5rem}
  footer{gap:.5rem 1rem}
 }
`.trim();

/** Site-level legal page — matches site/index.html look, not the dark docs theme. */
function legalPage(title, body) {
  const engLink = title.includes("خصوصية") ? "PRIVACY.md" : "TERMS.md";
  const engLabel = title.includes("خصوصية")
    ? "English version (PRIVACY.md)"
    : "English version (TERMS.md)";
  return "<!DOCTYPE html>\n" +
"<html lang=\"ar\" dir=\"rtl\">\n" +
"<head>\n" +
"  <meta charset=\"UTF-8\">\n" +
"  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
"  <meta name=\"theme-color\" content=\"#1a1713\">\n" +
"  <meta name=\"description\" content=\"" + esc(title) + " — أقلامنا\">\n" +
"  <link rel=\"icon\" href=\"/assets/favicon.ico\" sizes=\"any\">\n" +
"  <link rel=\"icon\" type=\"image/png\" sizes=\"512x512\" href=\"/assets/icon-512.png\">\n" +
"  <title>" + esc(title) + " — أقلامنا</title>\n" +
"  <link rel=\"manifest\" href=\"/manifest.webmanifest\">\n" +
"  <link rel=\"stylesheet\" href=\"/assets/aqlamna.css\">\n" +
"  <style>\n" +
".page{inline-size:100%;max-inline-size:48rem;padding-inline:1.5rem;padding-block:2rem}\n" +
".hero{text-align:center;padding-block:3rem 1.5rem}\n" +
".hero-logo{display:block;max-inline-size:100px;margin-inline:auto;margin-block-end:1.5rem}\n" +
".hero-title{font-size:2.25rem;font-weight:700}\n" +
".prose{max-inline-size:40rem;margin-inline:auto}\n" +
".prose p{line-height:1.85;margin-block:.85rem;font-size:1.0625rem}\n" +
".prose h2{font-size:1.375rem;font-weight:700;margin-block:2.25rem .75rem}\n" +
".prose h3{font-size:1.125rem;font-weight:700;margin-block:1.5rem .5rem}\n" +
".prose ul,.prose ol{margin-block:.85rem;padding-inline-start:1.5rem}\n" +
".prose li{margin-block:.35rem}\n" +
".prose hr{margin-block:2rem}\n" +
".prose blockquote{padding:.75rem 1rem;margin-block:1rem;border-radius:0 .35rem .35rem 0}\n" +
".prose a{text-decoration:underline}\n" +
".back-link{text-align:center;margin-block:3rem 2rem}\n" +
".back-link a{text-decoration:none;font-size:.9375rem}\n" +
".english-link{text-align:center;margin-block-start:3rem;font-size:.8125rem}\n" +
".site-footer{margin-block-start:auto;padding-block:2rem;text-align:center;font-size:.8125rem}\n" +
".site-footer nav{display:flex;flex-wrap:wrap;justify-content:center;gap:1.5rem;margin-block-end:1rem}\n" +
".site-footer a{text-decoration:none}\n" +
".version{text-align:center;font-size:.9375rem;margin-block-end:2rem}\n" +
"@media(max-width:40rem){\n" +
" .page{padding-inline:1.125rem;padding-block:1.25rem}\n" +
" .hero{padding-block:2rem 1rem}\n" +
" .hero-title{font-size:1.75rem}\n" +
" .site-footer nav{gap:.5rem 1rem}\n" +
" .site-footer a,.back-link a,.english-link a{display:inline-flex;align-items:center;min-block-size:44px}\n" +
"}\n" +
"  <\/style>\n" +
"</head>\n" +
"<body>\n" +
"  <main class=\"page reading-page\">\n" +
"    <header class=\"hero\">\n" +
"      <a href=\"/\"><img class=\"hero-logo\" src=\"/assets/logo-transparent.png\" alt=\"شعار أقلامنا\" width=\"100\" height=\"100\"><\/a>\n" +
"      <h1 class=\"hero-title\">" + esc(title) + "<\/h1>\n" +
"      <p class=\"version\">الإصدار 1.0 — 30 تموز 2026<\/p>\n" +
"    <\/header>\n" +
"\n" +
"    <div class=\"prose\">\n" +
body + "\n" +
"    <\/div>\n" +
"\n" +
"    <div class=\"english-link\">\n" +
"      <a href=\"https://github.com/humammalhas/aqlamna/blob/main/docs/" + engLink + "\">\n" +
"        " + engLabel + "\n" +
"      <\/a>\n" +
"    <\/div>\n" +
"\n" +
"    <div class=\"back-link\">\n" +
"      <a href=\"/\">← العودة إلى أقلامنا<\/a>\n" +
"    <\/div>\n" +
"  <\/main>\n" +
"\n" +
"  <footer class=\"site-footer\">\n" +
"    <nav>\n" +
"      <a href=\"https://github.com/humammalhas/aqlamna/issues/new?template=bug.yml\" target=\"_blank\" rel=\"noopener\">أبلغ عن خطأ<\/a>\n" +
"      <a href=\"https://github.com/humammalhas/aqlamna/issues/new?template=idea.yml\" target=\"_blank\" rel=\"noopener\">اقترح فكرة<\/a>\n" +
"      <a href=\"https://github.com/humammalhas/aqlamna/discussions\" target=\"_blank\" rel=\"noopener\">ناقش<\/a>\n" +
"      <a href=\"mailto:admin@almaseer.co\">راسلنا<\/a>\n" +
"      <a href=\"https://github.com/humammalhas/aqlamna\" target=\"_blank\" rel=\"noopener\">GPL-3.0<\/a>\n" +
"      <a href=\"/privacy\">الخصوصية<\/a>\n" +
"      <a href=\"/terms\">الشروط<\/a>\n" +
"    <\/nav>\n" +
"    <p class=\"company\">المصير لبرامج وأنظمة الحاسوب<\/p>\n" +
"  <\/footer>\n" +
"</body>\n" +
"</html>\n";
}

function page(title, navHtml, body) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#F6F1E7">
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

// الخصوصية.md / الشروط.md — generated at site/ level (one source per document).
// Also emit redirects at site/docs/ for anyone who lands there.
const REDIRECTS = { "الخصوصية.md": "/privacy.html", "الشروط.md": "/terms.html" };

const sources = readdirSync(srcDir).filter((f) => f.endsWith(".md") && !/^(README|PRIVACY|TERMS)\.md$/.test(f));
let count = 0;

for (const file of sources) {
  if (REDIRECTS[file]) {
    const to = REDIRECTS[file];
    // Redirect stub at site/docs/
    writeFileSync(
      resolve(outDir, file.replace(/\.md$/, ".html")),
      `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">` +
        `<meta http-equiv="refresh" content="0; url=${to}"><link rel="canonical" href="${to}">` +
        `<title>أقلامنا</title></head><body><a href="${to}">${to}</a></body></html>\n`,
      "utf8",
    );
    console.log(`  docs → site/docs/${file.replace(/\.md$/, ".html")}  (redirect → ${to})`);

    // Generate the real page at site/
    const md = readFileSync(resolve(srcDir, file), "utf8");
    const title = (md.match(/^#\s+(.*)$/m)?.[1] ?? basename(file, ".md")).split("—")[0].trim();
    const outFile = resolve(root, "site", file.replace(/\.md$/, ".html").replace(/^ال/, ""));
    // Map: الخصوصية.md → privacy.html, الشروط.md → terms.html
    const engFile = { "الخصوصية.md": "privacy.html", "الشروط.md": "terms.html" }[file];
    const actualOut = resolve(root, "site", engFile);
    const html = legalPage(title, toHtml(stripLeadingTitle(md)));
    writeFileSync(actualOut, html, "utf8");
    console.log(`  docs → site/${engFile}  (${html.length} bytes)`);
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

console.log(`build-docs: ${count} page(s) written`);
