import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthStore } from '../apps/api/src/auth/auth-store.mjs';
import { createCareStore } from '../apps/api/src/care/store.mjs';

function memoryCloud() {
  const accounts = new Map();
  const profiles = new Map();
  return {
    async createAccount(account) { accounts.set(account.phone, structuredClone(account)); return account; },
    async findAccount(phone) { return structuredClone(accounts.get(phone) ?? null); },
    async saveProfile(profile) {
      const saved = { ...(profiles.get(profile.user_id) ?? {}), ...structuredClone(profile) };
      profiles.set(profile.user_id, saved);
      return structuredClone(saved);
    },
    async getProfile(userId) { return structuredClone(profiles.get(userId) ?? null); },
  };
}

function stores(cloud) {
  const care = createCareStore();
  const auth = createAuthStore({
    getUser: care.getUser,
    registerUser: care.registerUser,
    registerRecipient: care.registerRecipient,
    listCenters: care.listCenters,
    accountRepository: cloud,
  });
  return { auth, care };
}

test('cloud account and profile survive a fresh in-memory server store', async () => {
  const cloud = memoryCloud();
  const first = stores(cloud);
  const userId = await first.auth.signUp({
    role: 'guardian', display_name: '가상보호자', phone: '010-1234-5678', password: 'synthetic-pass-1', agree: true,
  });
  const saved = await first.auth.saveProfile(userId, {
    receiver: { name: '가상아이', age: 24, sex: '남', heightCm: 172, weightKg: 65, impression: '보통 체형' },
    photo: 'data:image/jpeg;base64,AAAA',
    avatar: { body: '보통', items: ['헤드폰'], color: 'orange' },
    completed: true,
  });
  assert.match(saved.care_recipient_id, /^[0-9a-f-]{36}$/);

  const second = stores(cloud);
  const loggedInUserId = await second.auth.authenticate('01012345678', 'synthetic-pass-1');
  assert.equal(loggedInUserId, userId);
  assert.equal(second.care.myRecipients(second.care.getUser(userId))[0].id, saved.care_recipient_id);
  const restored = await second.auth.getProfile(userId);
  assert.equal(restored.receiver.name, '가상아이');
  assert.equal(restored.photo, 'data:image/jpeg;base64,AAAA');
  assert.deepEqual(restored.avatar, { body: '보통', items: ['헤드폰'], color: 'orange' });
});
