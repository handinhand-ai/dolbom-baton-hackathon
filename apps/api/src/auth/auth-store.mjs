import { randomUUID, timingSafeEqual } from 'node:crypto';
import { DEMO_IDS } from '../care/demo-data.mjs';

// A 담당: 시연 계정 로그인 세션 저장소(메모리). 서버를 다시 시작하면 모든 세션이 사라집니다.
// 계정은 D의 시연 사용자(`care/demo-data.mjs`)와 같은 user_id를 씁니다. 아이디·비밀번호는 합성 시연값입니다.

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const ROLES = Object.freeze(['guardian', 'caregiver', 'center_admin']);

const DEMO_PASSWORD = 'demo-1234';
const DEMO_ACCOUNTS = Object.freeze([
  { user_id: DEMO_IDS.guardian, username: 'guardian', password: DEMO_PASSWORD },
  { user_id: DEMO_IDS.caregiverGn, username: 'caregiver', password: DEMO_PASSWORD },
  { user_id: DEMO_IDS.adminGn, username: 'center', password: DEMO_PASSWORD },
  { user_id: DEMO_IDS.caregiverSos, username: 'caregiver-sos', password: DEMO_PASSWORD },
  { user_id: DEMO_IDS.adminSos, username: 'center-sos', password: DEMO_PASSWORD },
]);

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

// getUser(userId)는 D의 careStore.getUser입니다. 역할·프로필은 그쪽 데이터를 단일 출처로 씁니다.
export function createAuthStore({ getUser, now = () => Date.now(), exposeDemoAccounts = process.env.AUTH_EXPOSE_DEMO_ACCOUNTS !== 'off' } = {}) {
  const sessions = new Map();

  return {
    exposeDemoAccounts,

    demoAccounts() {
      return DEMO_ACCOUNTS.flatMap(({ user_id: userId, username, password }) => {
        const user = getUser(userId);
        return user ? [{ role: user.role, display_name: user.display_name, username, password }] : [];
      });
    },

    // 아이디·비밀번호가 맞으면 사용자 ID를 돌려줍니다. 모든 계정을 같은 방식으로 비교합니다.
    authenticate(username, password) {
      let found = null;
      for (const account of DEMO_ACCOUNTS) {
        if (safeEqual(account.username, username) && safeEqual(account.password, password)) found = account;
      }
      return found && getUser(found.user_id) ? found.user_id : null;
    },

    createSession(userId) {
      const token = randomUUID();
      sessions.set(token, { userId, expiresAt: now() + SESSION_TTL_MS });
      return token;
    },

    // 유효한 세션이면 user_id, 아니면 null(만료된 세션은 지웁니다).
    userIdFor(token) {
      const entry = token ? sessions.get(token) : null;
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        sessions.delete(token);
        return null;
      }
      return entry.userId;
    },

    destroySession(token) {
      sessions.delete(token);
    },
  };
}
