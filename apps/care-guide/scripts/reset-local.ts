// 로컬 PGlite 폴더를 지우고 마이그레이션 + 합성 데이터를 다시 넣는다. (Supabase 에는 동작하지 않음)
// 개발 서버(npm run dev)가 같은 폴더를 쓰고 있으면 먼저 끈다.
import fs from 'node:fs/promises';
import { loadConfig } from '../src/lib/config';
import { openDatabase, runMigrations } from '../src/lib/db';
import { createEmbedder } from '../src/lib/ai/embeddings';
import { seedDatabase } from '../src/lib/seed';

const config = loadConfig();
if (config.db.mode !== 'local-pglite' || config.db.ephemeral) {
  console.error('DATABASE_URL 이 설정되어 있거나 메모리 DB 모드라 로컬 초기화를 실행하지 않습니다.');
  process.exit(1);
}
await fs.rm(config.db.dir, { recursive: true, force: true });
const db = await openDatabase(config.db);
await runMigrations(db);
console.log('로컬 DB 초기화 완료:', await seedDatabase(db, createEmbedder(config.embedding)));
await db.close();
