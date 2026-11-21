// 환경변수 해석. 키가 없으면 로컬 시연 모드로 동작하고, 어떤 모드인지 화면에 항상 표시한다.
import path from 'node:path';

type Env = Record<string, string | undefined>;

function num(env: Env, name: string, fallback: number): number {
  const v = env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} 값이 숫자가 아닙니다: ${v}`);
  return n;
}

export type DbConfig =
  | { mode: 'supabase'; url: string; ssl: boolean }
  | { mode: 'local-pglite'; dir: string; ephemeral: boolean };

export interface AppConfig {
  db: DbConfig;
  ai: { provider: 'openai' | 'local'; apiKey: string; model: string; sttModel: string; timeoutMs: number };
  embedding: { provider: 'openai' | 'local-hash'; apiKey: string; model: string; dimension: number };
  search: { limit: number; rrfK: number; minVectorScore: number };
  session: { idleMinutes: number };
  demo: { staffId: string; guardianScreen: boolean };
}

export function loadConfig(env: Env = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL?.trim() || '';
  const openaiKey = env.OPENAI_API_KEY?.trim() || '';
  const aiProvider = (env.AI_PROVIDER || (openaiKey ? 'openai' : 'local')).trim();
  if (aiProvider !== 'openai' && aiProvider !== 'local') throw new Error(`AI_PROVIDER 는 openai 또는 local 이어야 합니다: ${aiProvider}`);
  if (aiProvider === 'openai' && !openaiKey) throw new Error('AI_PROVIDER=openai 인데 OPENAI_API_KEY 가 없습니다.');
  const embeddingProvider = (env.EMBEDDING_PROVIDER || (openaiKey ? 'openai' : 'local-hash')).trim();
  if (embeddingProvider !== 'openai' && embeddingProvider !== 'local-hash') throw new Error(`EMBEDDING_PROVIDER 는 openai 또는 local-hash 이어야 합니다: ${embeddingProvider}`);
  if (embeddingProvider === 'openai' && !openaiKey) throw new Error('EMBEDDING_PROVIDER=openai 인데 OPENAI_API_KEY 가 없습니다.');

  // Vercel 처럼 파일 시스템이 유지되지 않는 환경에서 DATABASE_URL 이 없으면 메모리 DB(인스턴스마다 초기화)로 시연한다.
  const serverless = Boolean(env.VERCEL);
  // 경로를 정적으로 한정해 Vercel 번들이 프로젝트 전체를 추적하지 않게 한다. (LOCAL_DB_DIR 은 실행 위치 기준 상대/절대 경로)
  const localDir = env.LOCAL_DB_DIR === ':memory:' || serverless ? ':memory:' : env.LOCAL_DB_DIR || path.join(process.cwd(), '.local-db');

  return {
    db: databaseUrl
      ? { mode: 'supabase', url: databaseUrl, ssl: env.DATABASE_SSL !== 'false' }
      : { mode: 'local-pglite', dir: localDir, ephemeral: localDir === ':memory:' },
    ai: {
      provider: aiProvider,
      apiKey: openaiKey,
      model: env.OPENAI_MODEL || 'gpt-5.4-mini',
      sttModel: env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe',
      timeoutMs: num(env, 'OPENAI_TIMEOUT_MS', 45000),
    },
    embedding: {
      provider: embeddingProvider,
      apiKey: openaiKey,
      model: embeddingProvider === 'openai' ? env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small' : 'local-hash-ngram-v1',
      dimension: 1024,
    },
    search: {
      limit: num(env, 'SEARCH_LIMIT', 8),
      rrfK: num(env, 'SEARCH_RRF_K', 60),
      // 로컬 해시 벡터는 의미 임베딩이 아니므로 기준을 높게 둔다.
      minVectorScore: num(env, 'SEARCH_MIN_VECTOR_SCORE', embeddingProvider === 'openai' ? 0.3 : 0.45),
    },
    session: { idleMinutes: num(env, 'SESSION_IDLE_MINUTES', 30) },
    demo: {
      staffId: env.DEMO_STAFF_ID || 'staff_demo_01',
      guardianScreen: env.DEMO_GUARDIAN_SCREEN !== 'false',
    },
  };
}
