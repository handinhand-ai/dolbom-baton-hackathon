import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../apps/api/src/server.mjs';
import { HOME, TABS, parseHash, resolveRoute, safeNext } from '../apps/web/public/a/access.js';

async function startServer(context) {
  const server = createApp();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('the common screen shell and its assets are served with the right types', async (context) => {
  const base = await startServer(context);
  const page = await fetch(`${base}/a/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<html lang="ko">/);
  for (const [, path] of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) assert.equal((await fetch(`${base}${path}`)).status, 200);
  for (const file of ['access', 'api', 'dom', 'icons', 'login', 'my', 'screens', 'shell']) {
    const response = await fetch(`${base}/a/${file}.js`);
    assert.equal(response.status, 200, file);
    assert.match(response.headers.get('content-type'), /text\/javascript/);
  }
  const character = await fetch(`${base}/a/assets/minjun.png`);
  assert.equal(character.status, 200);
  assert.equal(character.headers.get('content-type'), 'image/png');
  const font = await fetch(`${base}/a/fonts/pretendard-variable.woff2`);
  assert.equal(font.status, 200);
  assert.equal(font.headers.get('content-type'), 'font/woff2');
  assert.equal(String.fromCharCode(...new Uint8Array(await font.arrayBuffer()).slice(0, 4)), 'wOF2');
});

test('only files that match the /a/ naming rule are served and nothing else leaks', async (context) => {
  const base = await startServer(context);
  const blocked = [
    '/a/../package.json', '/a/%2e%2e/package.json', '/a/.env', '/a/shell.js.map', '/a/a/b/c.js', '/a/missing.js',
    '/a/Shell.js', '/a/assets/missing.png', '/a/fonts/none.woff2', '/a/fonts/PRETENDARD-LICENSE.txt', '/a/fonts/pretendard-variable.woff2.txt',
  ];
  for (const path of blocked) assert.equal((await fetch(`${base}${path}`)).status, 404, path);
  assert.equal((await fetch(`${base}/a/`, { method: 'POST', body: '{}' })).status, 405);
});

test('role tabs match the agreed menus', () => {
  assert.deepEqual(TABS.guardian.map((tab) => tab.label), ['홈', '설명서', '아이 맡기기', '마이페이지']);
  assert.deepEqual(TABS.caregiver.map((tab) => tab.label), ['홈', '설명서', '돌봄기록', '마이페이지']);
  assert.deepEqual(TABS.center_admin, []);
  assert.deepEqual(HOME, { guardian: '/g/home', caregiver: '/c/home', center_admin: '/c/center-admin' });
});

test('route guard sends anonymous and wrong-role users to the right place', () => {
  const guardian = { role: 'guardian' };
  const caregiver = { role: 'caregiver' };
  const admin = { role: 'center_admin' };
  assert.deepEqual(resolveRoute(null, '/g/care'), { action: 'redirect', to: '/login?next=%2Fg%2Fcare' });
  assert.deepEqual(resolveRoute(null, '/'), { action: 'redirect', to: '/login' });
  assert.deepEqual(resolveRoute(null, '/nowhere'), { action: 'redirect', to: '/login' });
  assert.deepEqual(resolveRoute(null, '/login'), { action: 'render' });
  assert.deepEqual(resolveRoute(caregiver, '/g/home'), { action: 'redirect', to: '/c/home' });
  assert.deepEqual(resolveRoute(guardian, '/c/records'), { action: 'redirect', to: '/g/home' });
  assert.deepEqual(resolveRoute(guardian, '/c/center-admin'), { action: 'redirect', to: '/g/home' });
  assert.deepEqual(resolveRoute(admin, '/g/home'), { action: 'redirect', to: '/c/center-admin' });
  assert.deepEqual(resolveRoute(admin, '/c/home'), { action: 'redirect', to: '/c/center-admin' });
  assert.deepEqual(resolveRoute(caregiver, '/c/center-admin'), { action: 'render' });
  assert.deepEqual(resolveRoute(guardian, '/g/care/new'), { action: 'render' });
  assert.deepEqual(resolveRoute(guardian, '/login'), { action: 'redirect', to: '/g/home' });
  assert.deepEqual(resolveRoute(guardian, '/nowhere'), { action: 'redirect', to: '/g/home' });
});

test('the post-login destination is limited to pages the user may open', () => {
  const guardian = { role: 'guardian' };
  assert.equal(safeNext('/g/care', guardian), '/g/care');
  assert.equal(safeNext('/c/home', guardian), '/g/home');
  assert.equal(safeNext('//evil.example', guardian), '/g/home');
  assert.equal(safeNext('https://evil.example', guardian), '/g/home');
  assert.equal(safeNext(null, guardian), '/g/home');
  assert.equal(safeNext('/login', guardian), '/g/home');
  const { path, query } = parseHash('#/login?next=%2Fg%2Fcare');
  assert.equal(path, '/login');
  assert.equal(query.get('next'), '/g/care');
  assert.equal(parseHash('').path, '/');
});
