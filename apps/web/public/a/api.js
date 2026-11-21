// 기능 A 클라이언트: /api/auth/*(PR #4) 호출 모음. B·C·D는 getSession()만 가져다 쓰면 됩니다.
//
//   import { getSession } from '/a/api.js';
//   const session = await getSession();   // 로그인 안 했으면 null
//   // → { user_id, role: 'guardian' | 'caregiver' | 'center_admin', display_name, center_id, center_name,
//   //     care_recipient_id, care_recipient: { id, name } | null, ... }  (docs/auth-api.md)
//   // care_recipient_id가 null이면 저장하지 말고 보호자는 홈으로, 종사자는 '아직 배정된 대상이 없어요'로 안내합니다.

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('서버에 연결할 수 없습니다. 네트워크와 서버 실행 상태를 확인해 주세요.');
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, ok: response.ok, body };
}

export async function getSession() {
  const { ok, status, body } = await request('/api/auth/session');
  if (ok) return body.data;
  if (status === 401) return null;
  throw new Error('로그인 상태를 확인하지 못했습니다.');
}

export async function login(username, password) {
  const { ok, status, body } = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  if (ok) return body.data;
  if (status === 401) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
  if (status === 429) throw new Error('시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  throw new Error('로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
}

export async function logout() {
  await request('/api/auth/logout', { method: 'POST' });
}

export async function listDemoAccounts() {
  const { ok, body } = await request('/api/auth/demo-accounts');
  return ok ? body.data : [];
}

// 시연 데이터 초기화는 D의 저장소 초기화(/api/care/demo-reset)를 호출합니다. 로그인 세션은 유지됩니다.
export async function resetDemo() {
  const { ok } = await request('/api/care/demo-reset', { method: 'POST' });
  if (!ok) throw new Error('시연 데이터를 초기화하지 못했습니다.');
}
