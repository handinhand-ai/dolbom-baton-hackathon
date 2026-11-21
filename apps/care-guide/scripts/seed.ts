// 합성 시연 데이터 적재. 앱 테이블의 기존 데이터를 지우므로 Supabase 에서는 --yes 가 필요하다.
import { loadConfig } from '../src/lib/config';
import { openDatabase, runMigrations } from '../src/lib/db';
import { createEmbedder } from '../src/lib/ai/embeddings';
import { seedDatabase } from '../src/lib/seed';

const config = loadConfig();
if (config.db.mode === 'supabase' && !process.argv.includes('--yes')) {
  console.error('Supabase DB 의 돌봄바통 테이블 데이터를 모두 지우고 합성 데이터를 넣습니다. 계속하려면: npm run db:seed -- --yes');
  process.exit(1);
}
const db = await openDatabase(config.db);
await runMigrations(db);
console.log(`[${db.mode}] 합성 데이터 적재 완료:`, await seedDatabase(db, createEmbedder(config.embedding)));
await db.close();
