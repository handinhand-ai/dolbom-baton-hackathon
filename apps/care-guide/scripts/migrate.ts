// 마이그레이션 적용: DATABASE_URL 이 있으면 Supabase, 없으면 로컬 PGlite
import { loadConfig } from '../src/lib/config';
import { openDatabase, runMigrations } from '../src/lib/db';

const db = await openDatabase(loadConfig().db);
const ran = await runMigrations(db);
console.log(`[${db.mode}] 적용한 마이그레이션: ${ran.length ? ran.join(', ') : '없음(최신 상태)'}`);
await db.close();
