// 서버 컨텍스트(싱글턴). API 라우트(Node 런타임)에서만 사용한다.
import { loadConfig, type AppConfig } from './config';
import { openDatabase, runMigrations, type Database } from './db';
import { createRepo } from './repo';
import { createEmbedder, type Embedder } from './ai/embeddings';
import { createAi, type AiClient } from './ai/openai';
import { seedDatabase } from './seed';

export interface AppContext {
  config: AppConfig;
  db: Database;
  repo: ReturnType<typeof createRepo>;
  embedder: Embedder;
  ai: AiClient | null;
}

export async function createContext(config: AppConfig = loadConfig()): Promise<AppContext> {
  const db = await openDatabase(config.db);
  await runMigrations(db);
  const ctx: AppContext = { config, db, repo: createRepo(db), embedder: createEmbedder(config.embedding), ai: createAi(config.ai) };
  // 메모리 DB(서버리스 시연)는 시작할 때마다 합성 데이터를 넣는다.
  if (config.db.mode === 'local-pglite' && config.db.ephemeral) {
    const n = (await db.query('select count(*)::int as n from recipient'))[0].n;
    if (n === 0) await seedDatabase(db, ctx.embedder);
  }
  return ctx;
}

const g = globalThis as unknown as { __dolbomCtx?: Promise<AppContext> };

export function getContext(): Promise<AppContext> {
  if (!g.__dolbomCtx) {
    g.__dolbomCtx = createContext().catch((e) => {
      g.__dolbomCtx = undefined;
      throw e;
    });
  }
  return g.__dolbomCtx;
}
