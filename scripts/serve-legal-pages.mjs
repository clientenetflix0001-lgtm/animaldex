#!/usr/bin/env node
/**
 * Servidor local de las páginas legales (sin SPA, sin login).
 * Uso: node scripts/serve-legal-pages.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT = Number(process.env.LEGAL_PAGES_PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/png',
};

function legalFile(pathname) {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/privacidad') return join(root, 'web/legal/privacidad/index.html');
  if (p === '/eliminar-cuenta') return join(root, 'web/legal/eliminar-cuenta/index.html');
  if (p === '/legal/legal.css') return join(root, 'web/legal/legal.css');
  if (p === '/legal/animaldex-logo-mark.png') return join(root, 'web/legal/assets/animaldex-logo-mark.png');
  return null;
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const file = legalFile(url.pathname);
  if (!file || !existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Legal pages: http://127.0.0.1:${PORT}/privacidad`);
  console.log(`Legal pages: http://127.0.0.1:${PORT}/eliminar-cuenta`);
});
