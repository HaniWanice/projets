// Local copy of the demo, in case the internet fails on the day: node serve.mjs (or double-click lancer.cmd).
// Plain static server, no dependency. http://localhost:4900
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { exec } from 'node:child_process';
const ROOT = path.dirname(fileURLToPath(import.meta.url)); const PORT = 4900;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('introuvable'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Démo locale : http://localhost:${PORT}/  (Ctrl+C pour arrêter)`);
  if (process.argv.includes('--open')) exec(`start "" msedge "http://localhost:${PORT}/"`);
});
