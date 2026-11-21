const SCHEMA = 'dolbom_demo';

export class AccountStoreError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function headers(key, content = false) {
  return {
    apikey: key,
    ...(content
      ? { 'Content-Type': 'application/json', 'Content-Profile': SCHEMA, Prefer: 'return=representation,resolution=merge-duplicates' }
      : { 'Accept-Profile': SCHEMA }),
  };
}

async function read(response, message) {
  if (!response.ok) throw new AccountStoreError(response.status, message);
  const body = await response.json();
  return Array.isArray(body) ? body : [];
}

export function createSupabaseAccountStore({ fetchImpl = fetch, supabaseUrl, supabaseAnonKey }) {
  const base = String(supabaseUrl).replace(/\/$/, '');
  const table = (name) => `${base}/rest/v1/${name}`;

  return {
    async createAccount(account) {
      const rows = await read(await fetchImpl(table('app_user'), {
        method: 'POST',
        headers: headers(supabaseAnonKey, true),
        body: JSON.stringify(account),
      }), '계정을 저장하지 못했어요.');
      return rows[0] ?? account;
    },

    async findAccount(phone) {
      const url = `${table('app_user')}?select=*&phone=eq.${encodeURIComponent(phone)}&limit=1`;
      const rows = await read(await fetchImpl(url, { headers: headers(supabaseAnonKey) }), '계정을 불러오지 못했어요.');
      return rows[0] ?? null;
    },

    async saveProfile(profile) {
      const url = `${table('user_profile')}?on_conflict=user_id`;
      const rows = await read(await fetchImpl(url, {
        method: 'POST',
        headers: headers(supabaseAnonKey, true),
        body: JSON.stringify(profile),
      }), '프로필을 저장하지 못했어요.');
      return rows[0] ?? profile;
    },

    async getProfile(userId) {
      const url = `${table('user_profile')}?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
      const rows = await read(await fetchImpl(url, { headers: headers(supabaseAnonKey) }), '프로필을 불러오지 못했어요.');
      return rows[0] ?? null;
    },
  };
}
