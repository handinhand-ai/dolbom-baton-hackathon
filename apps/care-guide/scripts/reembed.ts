// 임베딩 공급자를 바꾼 뒤(예: local-hash → openai) 기존 가이드·기록의 벡터를 다시 계산한다.
import { loadConfig } from '../src/lib/config';
import { openDatabase, runMigrations } from '../src/lib/db';
import { createEmbedder } from '../src/lib/ai/embeddings';
import { reembedAll } from '../src/lib/seed';

const config = loadConfig();
const db = await openDatabase(config.db);
await runMigrations(db);
console.log(`[${db.mode}] 재임베딩 완료:`, await reembedAll(db, createEmbedder(config.embedding)));
await db.close();
