// 합성 데이터 적재. 기존 앱 데이터를 비운 뒤 다시 넣는다(시연 전용).
import { SEED } from './seed-data';
import { toVectorLiteral } from './db';

const APP_TABLES = [
  'guardian_question', 'analysis_evidence', 'guide_update_request', 'care_record_draft', 'care_record_category', 'care_record',
  'conversation_message', 'situation_analysis', 'care_situation', 'conversation_session',
  'care_guide_revision', 'care_guide_item', 'recipient_access', 'recipient', 'staff_member',
];

export async function seedDatabase(db, embedder) {
  const staffNames = new Map(SEED.staff.map((s) => [s.staffId, s.displayName]));
  const guideVecs = await embedder.embed(SEED.guides.map((g) => g[2]), 'document');
  const recordVecs = await embedder.embed(SEED.records.map((r) => r.text), 'document');
  await db.tx(async (t) => {
    for (const table of APP_TABLES) await t.query(`delete from ${table}`);
    for (const s of SEED.staff) {
      await t.query('insert into staff_member (staff_id, display_name, role) values ($1,$2,$3)', [s.staffId, s.displayName, s.role]);
    }
    for (const r of SEED.recipients) {
      await t.query('insert into recipient (recipient_id, display_name, basic_info) values ($1,$2,$3)', [r.recipientId, r.displayName, r.basicInfo]);
    }
    for (const a of SEED.access) {
      await t.query('insert into recipient_access (staff_id, recipient_id, allowed_categories) values ($1,$2,$3)', [a.staffId, a.recipientId, a.allowed]);
    }
    for (const [i, [rid, code, content, at]] of SEED.guides.entries()) {
      const g = await t.query(
        `insert into care_guide_item (recipient_id, category_code, content, status, current_revision_no, confirmed_at, created_at, updated_at, embedding, embedding_model)
         values ($1,$2,$3,'published',1,$4,$4,$4,$5::extensions.vector,$6) returning guide_item_id`,
        [rid, code, content, at, toVectorLiteral(guideVecs[i]), embedder.model],
      );
      await t.query(
        `insert into care_guide_revision (guide_item_id, revision_no, content, status, change_reason, effective_at, created_at)
         values ($1,1,$2,'published','보호자 최초 작성(합성 데이터)',$3,$3)`,
        [g[0].guide_item_id, content, at],
      );
    }
    for (const [i, r] of SEED.records.entries()) {
      const rec = await t.query(
        `insert into care_record (recipient_id, observed_at, source_text, normalized_text, observation, response_taken, outcome,
                author_staff_id, author_label, confirmed_at, created_at, updated_at, embedding, embedding_model)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$10,$11::extensions.vector,$12) returning record_id`,
        [r.recipientId, r.observedAt, r.source, r.text, JSON.stringify(r.observation), JSON.stringify(r.response), r.outcome,
          r.author, staffNames.get(r.author), r.confirmedAt, toVectorLiteral(recordVecs[i]), embedder.model],
      );
      const id = rec[0].record_id;
      await t.query('insert into care_record_category (record_id, category_code, is_primary) values ($1,$2,true)', [id, r.primary]);
      for (const c of r.related) await t.query('insert into care_record_category (record_id, category_code, is_primary) values ($1,$2,false)', [id, c]);
    }
  });
  return { recipients: SEED.recipients.length, guides: SEED.guides.length, records: SEED.records.length, embeddingModel: embedder.model };
}

export async function reembedAll(db, embedder) {
  const guides = await db.query('select guide_item_id, content from care_guide_item where content is not null');
  const records = await db.query('select record_id, normalized_text from care_record');
  const gv = guides.length ? await embedder.embed(guides.map((g) => g.content), 'document') : [];
  const rv = records.length ? await embedder.embed(records.map((r) => r.normalized_text), 'document') : [];
  for (const [i, g] of guides.entries()) {
    await db.query('update care_guide_item set embedding = $2::extensions.vector, embedding_model = $3 where guide_item_id = $1', [g.guide_item_id, toVectorLiteral(gv[i]), embedder.model]);
  }
  for (const [i, r] of records.entries()) {
    await db.query('update care_record set embedding = $2::extensions.vector, embedding_model = $3 where record_id = $1', [r.record_id, toVectorLiteral(rv[i]), embedder.model]);
  }
  return { guides: guides.length, records: records.length, embeddingModel: embedder.model };
}
