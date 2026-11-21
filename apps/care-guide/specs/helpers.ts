// 테스트용: 메모리 PGlite + 같은 마이그레이션 + 합성 데이터. 외부 API 호출 없음.
// 실제 Next.js 라우트 핸들러(src/app/api/**/route.ts)를 Request 객체로 직접 호출한다.
import { loadConfig } from '../src/lib/config';
import { createContext, type AppContext } from '../src/lib/context';
import { seedDatabase } from '../src/lib/seed';

export const STAFF = 'staff_demo_01';

export async function makeContext(extraEnv: Record<string, string> = {}): Promise<AppContext> {
  const config = loadConfig({ LOCAL_DB_DIR: ':memory:', AI_PROVIDER: 'local', EMBEDDING_PROVIDER: 'local-hash', ...extraEnv });
  const ctx = await createContext(config);
  await seedDatabase(ctx.db, ctx.embedder);
  (globalThis as any).__dolbomCtx = Promise.resolve(ctx); // 라우트의 getContext() 가 이 컨텍스트를 쓰게 한다
  return ctx;
}

// [경로 정규식, 라우트 모듈 경로]
const ROUTES: [RegExp, string][] = [
  [/^\/api\/health$/, 'health'],
  [/^\/api\/v1\/system\/status$/, 'v1/system/status'],
  [/^\/api\/v1\/categories$/, 'v1/categories'],
  [/^\/api\/v1\/recipients$/, 'v1/recipients'],
  [/^\/api\/v1\/recipients\/([^/]+)$/, 'v1/recipients/[id]'],
  [/^\/api\/v1\/recipients\/([^/]+)\/care-guide$/, 'v1/recipients/[id]/care-guide'],
  [/^\/api\/v1\/recipients\/([^/]+)\/care-records$/, 'v1/recipients/[id]/care-records'],
  [/^\/api\/v1\/care-analyses$/, 'v1/care-analyses'],
  [/^\/api\/v1\/care-analyses\/([^/]+)$/, 'v1/care-analyses/[id]'],
  [/^\/api\/v1\/conversation-sessions$/, 'v1/conversation-sessions'],
  [/^\/api\/v1\/conversation-sessions\/([^/]+)$/, 'v1/conversation-sessions/[id]'],
  [/^\/api\/v1\/conversation-sessions\/([^/]+)\/messages$/, 'v1/conversation-sessions/[id]/messages'],
  [/^\/api\/v1\/conversation-sessions\/([^/]+)\/close$/, 'v1/conversation-sessions/[id]/close'],
  [/^\/api\/v1\/care-record-drafts$/, 'v1/care-record-drafts'],
  [/^\/api\/v1\/care-record-drafts\/([^/]+)$/, 'v1/care-record-drafts/[id]'],
  [/^\/api\/v1\/care-record-drafts\/([^/]+)\/save$/, 'v1/care-record-drafts/[id]/save'],
  [/^\/api\/v1\/care-record-drafts\/([^/]+)\/discard$/, 'v1/care-record-drafts/[id]/discard'],
  [/^\/api\/v1\/care-guide-reviews$/, 'v1/care-guide-reviews'],
  [/^\/api\/v1\/care-guide-reviews\/([^/]+)\/decision$/, 'v1/care-guide-reviews/[id]/decision'],
  [/^\/api\/v1\/care-guide-reviews\/([^/]+)\/apply$/, 'v1/care-guide-reviews/[id]/apply'],
  [/^\/api\/v1\/stt$/, 'v1/stt'],
];

export async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const url = new URL(path, 'http://localhost');
  const hit = ROUTES.map(([re, mod]) => ({ m: url.pathname.match(re), mod })).find((r) => r.m);
  if (!hit) return { status: 404, headers: new Headers(), data: null };
  const mod = await import(`../src/app/api/${hit.mod}/route.ts`);
  const fn = mod[method];
  // Next.js 는 내보내지 않은 메서드에 405 를 응답한다.
  if (typeof fn !== 'function') {
    const allow = ['GET', 'POST', 'PATCH'].filter((k) => typeof mod[k] === 'function').join(', ');
    return { status: 405, headers: new Headers({ allow }), data: null };
  }
  const init: RequestInit = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' || body instanceof Uint8Array ? (body as any) : JSON.stringify(body);
    if (!headers['content-type']) (init.headers as Record<string, string>)['content-type'] = 'application/json';
  }
  const res: Response = await fn(new Request(url, init), { params: Promise.resolve({ id: hit.m![1] }) });
  let data: any = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, headers: res.headers, data };
}
