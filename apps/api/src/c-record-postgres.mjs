import pg from 'pg';

const recordColumns = [
  'id', 'care_recipient_id', 'author', 'author_user_id', 'assignment_id', 'input_method',
  'event_time', 'created_at', 'text', 'category', 'importance', 'safety_flag',
  'safety_reference', 'relation', 'related_manual_item_id', 'sent_to_guardian_at',
].join(', ');
const insertColumns = `${recordColumns}, source_text, save_key, save_index, save_fingerprint`;
const scopeFilter = 'author_user_id = $1 and care_recipient_id = $2 and assignment_id is not distinct from $3::uuid';

function readEntry({ source_text: sourceText, save_fingerprint: _fingerprint, ...record }) {
  return { record, sourceText };
}

export function createPostgresRecordStore(pool) {
  return {
    async list(scope) {
      const result = await pool.query(
        `select ${recordColumns} from public.care_records where ${scopeFilter}
         order by created_at desc, save_index, id`, scope,
      );
      return result.rows;
    },
    async find(scope, id) {
      const result = await pool.query(
        `select ${recordColumns}, source_text from public.care_records where ${scopeFilter} and id = $4`,
        [...scope, id],
      );
      return result.rows[0] && readEntry(result.rows[0]);
    },
    async save(scope, key, fingerprint, batch) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
          JSON.stringify(['care_records', ...scope, key]),
        ]);
        const previous = await client.query(
          `select ${recordColumns}, source_text, save_fingerprint from public.care_records
           where ${scopeFilter} and save_key = $4 order by save_index`,
          [...scope, key],
        );
        if (previous.rows.length) {
          await client.query('commit');
          if (previous.rows[0].save_fingerprint !== fingerprint) return { conflict: true };
          return { created: false, entries: previous.rows.map(readEntry) };
        }

        const rows = batch.map(({ record, sourceText }, index) => ({
          ...record, source_text: sourceText, save_key: key, save_index: index, save_fingerprint: fingerprint,
        }));
        await client.query(
          `insert into public.care_records (${insertColumns})
           select ${insertColumns} from jsonb_populate_recordset(null::public.care_records, $1::jsonb)`,
          [JSON.stringify(rows)],
        );
        await client.query('commit');
        return { created: true, entries: batch };
      } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async markSent(scope, id, sentAt) {
      const result = await pool.query(
        `update public.care_records set sent_to_guardian_at = coalesce(sent_to_guardian_at, $5)
         where ${scopeFilter} and id = $4 returning ${recordColumns}`,
        [...scope, id, sentAt],
      );
      if (!result.rows[0]) throw new Error('Missing care record');
      return result.rows[0];
    },
  };
}

export async function openPostgresRecordStore(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid database URL scheme');
  // pg's SSL URL options can override the TLS policy below.
  for (const option of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(option);
  const pool = new pg.Pool({
    connectionString: url.href,
    ssl: { rejectUnauthorized: true },
    max: 3,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', () => console.error('C 기록 저장소: 대기 중인 Postgres 연결 오류'));
  try {
    await pool.query(`select ${insertColumns} from public.care_records limit 0`);
    return { store: createPostgresRecordStore(pool), close: () => pool.end() };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
