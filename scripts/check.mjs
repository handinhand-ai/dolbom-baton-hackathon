import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const roots = ['apps/', 'scripts/', 'tests/'];
let count = 0;

async function checkDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ['node_modules', 'dist', '.next'].includes(entry.name)) continue;
    const target = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    // apps/care-guide(Next.js)는 자기 도구(타입 검사·테스트)로 따로 검사합니다. 루트 검사에는 넣지 않습니다.
    if (entry.isDirectory() && target.pathname.endsWith('/apps/care-guide/')) continue;
    if (entry.isDirectory()) {
      await checkDirectory(target);
    } else if (/\.(mjs|js)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', fileURLToPath(target)], { stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status ?? 1);
      count += 1;
    }
  }
}

for (const directory of roots) await checkDirectory(new URL(directory, root));
console.log(`Syntax checks passed for ${count} JavaScript files.`);
