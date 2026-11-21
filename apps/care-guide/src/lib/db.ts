// DB 드라이버 추상화. 두 모드 모두 같은 SQL(마이그레이션·쿼리)을 사용한다.
// - supabase: DATABASE_URL 로 Supabase Postgres(pgvector) 접속 (node-postgres)
// - local-pglite: 같은 SQL을 PGlite(WASM Postgres + pgvector)로 실행 (로컬 폴더 또는 메모리)
// 트랜잭션 풀러(Supavisor 6543)에서도 동작하도록 세션 설정(search_path)에 기대지 않는다.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DbConfig } from './config';

export type Row = Record<string, any>;
export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<Row[]>;
}
export interface Database extends Queryable {
  mode: 'supabase' | 'local-pglite';
  exec(sql: string): Promise<void>;
  tx<T>(fn: (t: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function openDatabase(dbConfig: DbConfig): Promise<Database> {
  if (dbConfig.mode === 'supabase') {
    const pg = (await import('pg')).default;
    const pool = new pg.Pool({
      connectionString: dbConfig.url,
      ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
      max: 3,
    });
    return {
      mode: 'supabase',
      async query(sql, params = []) {
        return (await pool.query(sql, params as any[])).rows;
      },
      async exec(sql) {
        await pool.query(sql);
      },
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('begin');
          const result = await fn({ query: async (s, p = []) => (await client.query(s, p as any[])).rows });
          await client.query('commit');
          return result;
        } catch (e) {
          await client.query('rollback');
          throw e;
        } finally {
          client.release();
        }
      },
      async close() {
        await pool.end();
      },
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite-pgvector');
  const memory = dbConfig.dir === ':memory:';
  if (!memory) await fs.mkdir(dbConfig.dir, { recursive: true });
  const db = memory ? new PGlite({ extensions: { vector } }) : new PGlite(dbConfig.dir, { extensions: { vector } });
  await db.waitReady;
  await db.exec('create schema if not exists extensions; create extension if not exists vector with schema extensions;');
  return {
    mode: 'local-pglite',
    async query(sql, params = []) {
      return (await db.query<Row>(sql, params as any[])).rows;
    },
    async exec(sql) {
      await db.exec(sql);
    },
    async tx(fn) {
      return db.transaction(async (t) => fn({ query: async (s, p = []) => (await t.query<Row>(s, p as any[])).rows }));
    },
    async close() {
      await db.close();
    },
  };
}

export async function runMigrations(db: Database): Promise<string[]> {
  await db.exec(`create table if not exists _app_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const dir = path.join(process.cwd(), 'supabase', 'migrations');
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set((await db.query('select name from _app_migrations')).map((r) => r.name));
  const ran: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = await fs.readFile(path.join(dir, f), 'utf8');
    await db.exec(sql);
    await db.query('insert into _app_migrations (name) values ($1)', [f]);
    ran.push(f);
  }
  return ran;
}

export function toVectorLiteral(vec: number[] | null | undefined): string | null {
  return vec ? `[${vec.map((x) => Number(x).toFixed(6)).join(',')}]` : null;
}
