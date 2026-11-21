import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { test } from 'node:test';

async function availablePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

test('root Node server boots and serves the UI and API', async (context) => {
  const port = await availablePort();
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  context.after(() => { child.kill(); });
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode != null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.status === 200) { ready = true; break; }
    } catch { /* Startup may not be ready yet. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, 'server failed to start');
  for (const path of ['/', '/a/', '/care', '/a/figma-features.css']) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 200, path);
  }
});
