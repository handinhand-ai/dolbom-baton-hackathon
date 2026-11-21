import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import handler from '../api/index.mjs';

test('Vercel handler serves original application routes', async (context) => {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  context.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));

  const base = `http://127.0.0.1:${server.address().port}`;

  for (const [route, expected] of [
    ['', '돌봄바통'],
    ['api/health', '"status":"ok"'],
    ['a/figma-features.css', ''],
  ]) {
    const response = await fetch(
      `${base}/api/index?__route=${encodeURIComponent(route)}`
    );
    assert.equal(response.status, 200, route);

    const body = await response.text();
    if (expected) assert.ok(body.includes(expected));
  }
});