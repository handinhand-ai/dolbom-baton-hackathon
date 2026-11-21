import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../apps/api/src/server.mjs';
import { ONBOARDING_STEPS, resolveOnboarding, resolveRoute } from '../apps/web/public/a/access.js';
import {
  COLORS, createOnboardingStore, defaultAvatar, normalizeReceiver, recolorHoodie, validateAvatar, validateReceiver, withObjectParticle,
} from '../apps/web/public/a/onboarding.js';

// 모든 값은 합성 시연 데이터입니다.
const valid = { name: '민준이', age: '24', sex: '남', heightCm: '172', weightKg: '65', impression: '보통 체형이에요.' };

function memoryStorage() {
  const map = new Map();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key), map };
}

test('the onboarding screens and their modules are served', async (context) => {
  const server = createApp();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const file of ['onboarding', 'onboarding-screens']) {
    const response = await fetch(`${base}/a/${file}.js`);
    assert.equal(response.status, 200, file);
    assert.match(response.headers.get('content-type'), /text\/javascript/);
  }
});

test('receiver validation accepts a full entry and an entry without optional body numbers', () => {
  assert.deepEqual(validateReceiver(valid), {});
  assert.deepEqual(validateReceiver({ ...valid, heightCm: '', weightKg: '', impression: '' }), {});
  assert.deepEqual(normalizeReceiver({ ...valid, name: '  민준이 ' }), { name: '민준이', age: 24, sex: '남', heightCm: 172, weightKg: 65, impression: '보통 체형이에요.' });
  assert.equal(normalizeReceiver({ ...valid, heightCm: '', weightKg: '' }).heightCm, null);
});

test('receiver validation rejects missing, malformed and out-of-range values', () => {
  assert.ok(validateReceiver({ ...valid, name: '  ' }).name);
  assert.ok(validateReceiver({ ...valid, name: '가'.repeat(21) }).name);
  assert.ok(validateReceiver({ ...valid, age: '' }).age);
  assert.ok(validateReceiver({ ...valid, age: '-1' }).age);
  assert.ok(validateReceiver({ ...valid, age: '121' }).age);
  assert.ok(validateReceiver({ ...valid, age: '2.5' }).age);
  assert.ok(validateReceiver({ ...valid, age: 'abc' }).age);
  assert.ok(validateReceiver({ ...valid, sex: null }).sex);
  assert.ok(validateReceiver({ ...valid, sex: '기타' }).sex);
  assert.ok(validateReceiver({ ...valid, heightCm: '10' }).heightCm);
  assert.ok(validateReceiver({ ...valid, heightCm: '300' }).heightCm);
  assert.ok(validateReceiver({ ...valid, weightKg: '5' }).weightKg);
  assert.ok(validateReceiver({ ...valid, impression: 'x'.repeat(121) }).impression);
});

test('avatar validation only accepts the offered body types, items and colors', () => {
  assert.equal(validateAvatar(defaultAvatar()), true);
  assert.equal(validateAvatar({ body: '보통', items: ['헤드폰', '안경'], color: 'blue' }), true);
  assert.equal(validateAvatar({ body: '거대', items: [], color: 'blue' }), false);
  assert.equal(validateAvatar({ body: '보통', items: ['마법봉'], color: 'blue' }), false);
  assert.equal(validateAvatar({ body: '보통', items: [], color: 'pink' }), false);
  assert.equal(validateAvatar({ body: '보통', items: 'x', color: 'blue' }), false);
  assert.equal(validateAvatar({}), false);
});

test('the onboarding store keeps each user separate and survives broken storage', () => {
  const storage = memoryStorage();
  const alice = createOnboardingStore(storage, 'user-a');
  const bob = createOnboardingStore(storage, 'user-b');
  assert.equal(alice.isOnboarded(), false);
  assert.equal(alice.save({ receiver: normalizeReceiver(valid) }), true);
  assert.equal(alice.load().receiver.name, '민준이');
  assert.deepEqual(bob.load(), {});
  alice.save({ avatar: defaultAvatar() });
  assert.equal(alice.load().receiver.name, '민준이');
  alice.complete(new Date('2026-11-21T00:00:00Z'));
  assert.equal(alice.isOnboarded(), true);
  assert.equal(bob.isOnboarded(), false);

  assert.equal(alice.savePhoto('data:image/jpeg;base64,AAAA'), true);
  assert.equal(alice.loadPhoto(), 'data:image/jpeg;base64,AAAA');
  assert.equal(bob.loadPhoto(), null);
  alice.clear();
  assert.deepEqual(alice.load(), {});
  assert.equal(alice.loadPhoto(), null);

  storage.setItem('baton.onboarding.v1.user-c', '{broken');
  assert.deepEqual(createOnboardingStore(storage, 'user-c').load(), {});
  storage.setItem('baton.photo.v1.user-c', JSON.stringify('javascript:alert(1)'));
  assert.equal(createOnboardingStore(storage, 'user-c').loadPhoto(), null);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const blocked = createOnboardingStore(broken, 'user-d');
  assert.deepEqual(blocked.load(), {});
  assert.equal(blocked.save({ receiver: {} }), false);
  assert.equal(blocked.loadPhoto(), null);
  assert.doesNotThrow(() => blocked.clear());
  assert.equal(createOnboardingStore(null, 'user-e').save({}), false);
});

test('only a guardian who just signed up is sent to onboarding; the login flow is not', () => {
  const guardian = { role: 'guardian' };
  // 세 번째 값은 회원가입 직후(signupPending)인지 여부입니다.
  assert.deepEqual(resolveOnboarding(guardian, '/g/home', true), { action: 'redirect', to: ONBOARDING_STEPS[0] });
  assert.deepEqual(resolveOnboarding(guardian, '/g/manual', true), { action: 'redirect', to: '/g/onboarding/profile' });
  assert.equal(resolveOnboarding(guardian, '/g/onboarding/photo', true), null);
  assert.equal(resolveOnboarding(guardian, '/g/home', false), null);
  assert.equal(resolveOnboarding(guardian, '/g/manual', false), null);
  assert.equal(resolveOnboarding({ role: 'caregiver' }, '/c/home', true), null);
  assert.equal(resolveOnboarding({ role: 'center_admin' }, '/c/center-admin', true), null);
  assert.equal(resolveOnboarding(null, '/login', true), null);
  assert.deepEqual(ONBOARDING_STEPS, ['/g/onboarding/profile', '/g/onboarding/photo', '/g/onboarding/avatar']);
});

test('signup pending is set only after signup and cleared when onboarding is completed', () => {
  const storage = memoryStorage();
  const store = createOnboardingStore(storage, 'new-user');
  assert.equal(store.isSignupPending(), false);
  assert.equal(store.markSignupPending(), true);
  assert.equal(store.isSignupPending(), true);
  assert.equal(createOnboardingStore(storage, 'someone-else').isSignupPending(), false);
  store.complete(new Date('2026-11-21T00:00:00Z'));
  assert.equal(store.isSignupPending(), false);
  assert.equal(store.isOnboarded(), true);
  store.markSignupPending();
  assert.equal(store.isSignupPending(), false, 'an onboarded account is never sent back');
});

test('the signup and login screens are public routes that logged-in users leave', () => {
  assert.deepEqual(resolveRoute(null, '/signup'), { action: 'render' });
  assert.deepEqual(resolveRoute(null, '/login'), { action: 'render' });
  assert.deepEqual(resolveRoute({ role: 'guardian' }, '/signup'), { action: 'redirect', to: '/g/home' });
  assert.deepEqual(resolveRoute({ role: 'caregiver' }, '/signup'), { action: 'redirect', to: '/c/home' });
});

test('onboarding routes are guardian-only', () => {
  for (const path of ONBOARDING_STEPS) {
    assert.deepEqual(resolveRoute({ role: 'guardian' }, path), { action: 'render' });
    assert.deepEqual(resolveRoute({ role: 'caregiver' }, path), { action: 'redirect', to: '/c/home' });
    assert.deepEqual(resolveRoute(null, path), { action: 'redirect', to: `/login?next=${encodeURIComponent(path)}` });
  }
});

test('hoodie recoloring changes only orange pixels and keeps transparency', () => {
  // [r, g, b, a]: 주황 옷, 흰 머리, 빨간 헤드폰, 투명
  const make = () => new Uint8ClampedArray([255, 122, 26, 255, 240, 240, 240, 255, 230, 30, 40, 255, 255, 122, 26, 0]);
  const orange = make();
  assert.deepEqual([...recolorHoodie(orange, 'orange')], [...make()]);
  const blue = recolorHoodie(make(), 'blue');
  assert.ok(blue[2] > blue[0] && blue[2] > blue[1], 'the hoodie turns blue');
  assert.deepEqual([...blue.slice(4, 8)], [240, 240, 240, 255]);
  assert.deepEqual([...blue.slice(8, 12)], [230, 30, 40, 255]);
  assert.deepEqual([...blue.slice(12, 16)], [255, 122, 26, 0]);
  const dark = recolorHoodie(make(), 'dark');
  assert.ok(Math.max(dark[0], dark[1], dark[2]) < 120, 'the hoodie turns dark');
  assert.deepEqual([...recolorHoodie(make(), 'unknown')], [...make()]);
  assert.equal(COLORS.length, 6);
});

test('the Korean object particle follows the final consonant', () => {
  assert.equal(withObjectParticle('민준이'), '민준이를');
  assert.equal(withObjectParticle('민준'), '민준을');
  assert.equal(withObjectParticle('서연'), '서연을');
  assert.equal(withObjectParticle('지아'), '지아를');
  assert.equal(withObjectParticle('Alex'), 'Alex를');
});
