import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { handleCareRequest } from './care/routes.mjs';
import { createCareStore } from './care/store.mjs';
import { createAuthStore } from './auth/auth-store.mjs';
import { createAuthHandler, readSessionToken } from './auth/routes.mjs';

const publicRoot = new URL('../../web/public/', import.meta.url);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  // D: 아이 맡기기 · 센터 화면(시연용). A의 탭 틀이 병합되면 탭 자리에 연결합니다.
  ['/care', ['care.html', 'text/html; charset=utf-8']],
  ['/care.css', ['care.css', 'text/css; charset=utf-8']],
  ['/care.js', ['care.js', 'text/javascript; charset=utf-8']],
]);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

export function createApp({ careStore = createCareStore(), authStore = createAuthStore({ getUser: careStore.getUser }) } = {}) {
  const handleAuthRequest = createAuthHandler({ authStore, careStore, sendJson });
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'");

    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      sendJson(response, 400, { error: 'Invalid request URL' });
      return;
    }

    // A: 로그인·세션·역할 확인(/api/auth/*). D의 /api/care/*는 로그인 세션이 있으면 그 사용자로 처리합니다.
    if (await handleAuthRequest({ request, response, url })) return;
    const sessionUserId = authStore.userIdFor(readSessionToken(request));
    if (await handleCareRequest({ request, response, url, store: careStore, sendJson, sessionUserId })) return;

    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    const { pathname } = url;

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
