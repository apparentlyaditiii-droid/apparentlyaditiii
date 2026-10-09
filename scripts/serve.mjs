#!/usr/bin/env node
// Tiny static server for dist/ that mimics Vercel's clean URLs. Dev only.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT) || 4321;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.xml': 'application/xml', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain' };

async function resolve(urlPath) {
  const file = path.join(dist, path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(dist)) return null;
  const s = await stat(file).catch(() => null);
  if (s?.isFile()) return file;
  if (s?.isDirectory()) return (await stat(path.join(file, 'index.html')).catch(() => null)) ? path.join(file, 'index.html') : null;
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (!pathname.endsWith('/') && !path.extname(pathname) && (await resolve(pathname + '/'))) {
    res.writeHead(308, { Location: pathname + '/' }).end();
    return;
  }
  const file = await resolve(pathname);
  const status = file ? 200 : 404;
  const body = await readFile(file ?? path.join(dist, '404.html'));
  res.writeHead(status, { 'Content-Type': types[path.extname(file ?? '.html')] ?? 'application/octet-stream' }).end(body);
}).listen(port, () => console.log(`Serving dist/ at http://localhost:${port}`));
