import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSupabaseAccountStore } from '../apps/api/src/auth/supabase-account-store.mjs';

function response(status, body) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('Supabase account store persists and reloads an account', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (options.method === 'POST') return response(201, [JSON.parse(options.body)]);
    return response(200, [{
      user_id: '11111111-1111-4111-8111-111111111111',
      phone: '01012345678',
      password_salt: 'aa',
      password_hash: 'bb',
      role: 'guardian',
      display_name: '가상보호자',
      caregiver_type: null,
      center_id: null,
    }]);
  };
  const store = createSupabaseAccountStore({
    fetchImpl,
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'test-key',
  });

  await store.createAccount({
    user_id: '11111111-1111-4111-8111-111111111111',
    phone: '01012345678',
    password_salt: 'aa',
    password_hash: 'bb',
    role: 'guardian',
    display_name: '가상보호자',
    caregiver_type: null,
    center_id: null,
  });
  const loaded = await store.findAccount('01012345678');

  assert.equal(loaded.user_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(loaded.role, 'guardian');
  assert.match(requests[0].url, /\/rest\/v1\/app_user$/);
  assert.match(requests[1].url, /app_user\?.*phone=eq\.01012345678/);
  assert.equal(requests[0].options.headers['Content-Profile'], 'dolbom_demo');
  assert.equal(requests[1].options.headers['Accept-Profile'], 'dolbom_demo');
});

test('Supabase account store upserts and reloads one cloud profile', async () => {
  const requests = [];
  const profile = {
    user_id: '11111111-1111-4111-8111-111111111111',
    care_recipient_id: '22222222-2222-4222-8222-222222222222',
    recipient_name: '가상아이',
    age: 24,
    sex: '남',
    height_cm: 172,
    weight_kg: 65,
    impression: '보통 체형',
    photo_data: 'data:image/jpeg;base64,AAAA',
    avatar: { body: '보통', items: ['헤드폰'], color: 'orange' },
    onboarded_at: '2026-11-21T06:00:00.000Z',
  };
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (options.method === 'POST') return response(201, [JSON.parse(options.body)]);
    return response(200, [profile]);
  };
  const store = createSupabaseAccountStore({
    fetchImpl,
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'test-key',
  });

  await store.saveProfile(profile);
  const loaded = await store.getProfile(profile.user_id);

  assert.deepEqual(loaded.avatar, profile.avatar);
  assert.equal(loaded.photo_data, profile.photo_data);
  assert.match(requests[0].url, /user_profile\?on_conflict=user_id$/);
  assert.match(requests[1].url, /user_profile\?.*user_id=eq\.11111111/);
});
