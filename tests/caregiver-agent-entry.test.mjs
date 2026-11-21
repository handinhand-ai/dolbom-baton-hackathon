import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { allowedRoles } from '../apps/web/public/a/access.js';

test('caregiver agent route is restricted to caregivers', () => {
  assert.deepEqual(allowedRoles('/c/agent'), ['caregiver']);
});

test('caregiver agent entry connects to the authenticated evidence-based screen', async () => {
  const [screens, home] = await Promise.all([
    readFile(new URL('../apps/web/public/a/screens.js', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/public/a/figma-features.js', import.meta.url), 'utf8'),
  ]);
  assert.match(screens, /\['\/c\/agent', renderCManual\]/);
  assert.match(home, /navigate\('\/c\/agent'\)/);
  assert.match(home, /item\.can_view_now/);
});
