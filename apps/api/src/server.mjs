import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const publicRoot = new URL('../../web/public/', import.meta.url);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

export function createApp() {
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'");

    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch {
      sendJson(response, 400, { error: 'Invalid request URL' });
      return;
    }

    if (pathname === '/api/health') {
      sendJson(response, 200, { status: 'ok', mode: 'skeleton' });
      return;
    }

    const asset = assets.get(pathname);
    if (!asset) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }

    try {
      const content = await readFile(new URL(asset[0], publicRoot));
      response.writeHead(200, { 'Content-Type': asset[1] });
      response.end(content);
    } catch {
      sendJson(response, 500, { error: 'Unable to load application asset' });
    }
  });
}
