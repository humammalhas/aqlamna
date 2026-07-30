// site/tests/server.mjs — tiny static server for Playwright webServer
// Serves site/ at localhost. No dependencies.

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const PORT = 8765;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

function tryPath(filePath) {
  if (existsSync(filePath) && statSync(filePath).isFile()) return filePath;
  // extensionless → .html
  if (!extname(filePath) && existsSync(filePath + ".html") && statSync(filePath + ".html").isFile()) {
    return filePath + ".html";
  }
  // directory → index.html
  const idx = resolve(filePath, "index.html");
  if (existsSync(idx) && statSync(idx).isFile()) return idx;
  return null;
}

function serve(req, res) {
  // URL-decode the path (Arabic filenames come percent-encoded)
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
  } catch {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  if (urlPath === "/") urlPath = "/index.html";

  const rawPath = resolve(root, "." + urlPath);

  // Security: don't escape the root
  if (!rawPath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const filePath = tryPath(rawPath);
  if (!filePath) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";

  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(500);
    res.end("Internal Server Error");
  }
}

const server = createServer(serve);
server.listen(PORT, () => {
  console.log(`Site server running at http://localhost:${PORT}`);
});
