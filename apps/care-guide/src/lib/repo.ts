// 데이터 접근 계층. 모든 대상자 데이터 조회는 (종사자, 대상자) 접근 권한을 먼저 확인한다.
import { CATEGORIES, categoryByCode } from './categories';
import { toVectorLiteral, type Database, type Row } from './db';

export class AppError extends Error {
  status: number;
  code: string;
  details?: { field: string; reason: string }[];
  constructor(status: number, code: string, message: string, details?: { field: string; reason: string }[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// 권한 없음과 존재하지 않음을 구분하지 않는다(다른 대상자 존재 여부 노출 방지).
export const notFound = () => new AppError(404, 'NOT_FOUND', '대상자 정보를 찾을 수 없거나 접근 권한이 없습니다.');

const iso = (v) => (v ? new Date(v).toISOString() : null);
const mapQuestionRow = (q) => ({
  questionId: q.question_id,
  recipientId: q.recipient_id,
  question: q.question_text,
  status: q.status,
  answer: q.answer_text,
  askedAt: iso(q.created_at),
  answeredAt: iso(q.answered_at),
});

export function createRepo(db: Database) {
  async function allowedCategories(staffId, recipientId) {
    const rows = await db.query('select app_allowed_categories($1, $2) as allowed', [staffId, recipientId]);
    return rows[0]?.allowed || null;
  }

  async function requireAccess(staffId, recipientId) {
    if (!recipientId || typeof recipientId !== 'string') throw notFound();
    const allowed = await allowedCategories(staffId, recipientId);
    if (!allowed) throw notFound();
    return allowed;
  }

  return {
    db,
    requireAccess,

    async getStaff(staffId) {
      const rows = await db.query('select staff_id, display_name, role from staff_member where staff_id = $1', [staffId]);
      return rows[0] || null;
    },

    async listRecipients(staffId, q) {
      const rows = await db.query(
        `select r.recipient_id, r.display_name, r.basic_info, a.allowed_categories
           from recipient r
           join recipient_access a on a.recipient_id = r.recipient_id
          where a.staff_id = $1 and a.status = 'active' and r.status = 'active'
            and (a.expires_at is null or a.expires_at > now())
            and ($2::text is null or r.display_name ilike '%' || $2 || '%')
          order by r.display_name`,
        [staffId, q || null],
      );
      return rows.map((r) => ({
        recipientId: r.recipient_id,
        displayName: r.display_name,
        basicInfo: r.basic_info,
        sharedCategoryCount: r.allowed_categories.length,
      }));
    },

    async getRecipient(staffId, recipientId) {
      const allowed = await requireAccess(staffId, recipientId);
      const rows = await db.query('select recipient_id, display_name, basic_info from recipient where recipient_id = $1', [recipientId]);
      if (!rows[0]) throw notFound();
      return {
        recipientId: rows[0].recipient_id,
        displayName: rows[0].display_name,
        basicInfo: rows[0].basic_info,
        access: 'caregiver',
        sharedCategories: allowed,
      };
    },

    /** 9개 항목을 빠짐없이 반환: available / missing / not_shared */
    async getCareGuide(staffId, recipientId) {
      const allowed = await requireAccess(staffId, recipientId);
      const rows = await db.query(
        `select guide_item_id, category_code, content, status, current_revision_no, confirmed_at, updated_at
           from care_guide_item where recipient_id = $1`,
        [recipientId],
      );
      const byCat = new Map<string, Row>(rows.map((r) => [r.category_code, r]));
      const categories = CATEGORIES.map((c) => {
        const base = { code: c.code, category: c.name, easyLabel: c.easyLabel, priorityGroup: c.group, order: c.order };
        if (!allowed.includes(c.code)) return { ...base, content: null, status: 'not_shared', source: null };
        const g = byCat.get(c.code);
        if (!g || g.status !== 'published' || !g.content) return { ...base, content: null, status: 'missing', source: null };
        return {
          ...base,
          content: g.content,
          status: 'available',
          source: {
            type: 'official_care_guide',
            sourceId: g.guide_item_id,
            createdAt: iso(g.confirmed_at || g.updated_at),
            authorRole: 'guardian',
            approvalStatus: 'guardian_confirmed',
            revision: g.current_revision_no,
          },
        };
      });
      const updatedAt = rows.reduce((m, r) => (!m || r.updated_at > m ? r.updated_at : m), null);
      return { recipientId, updatedAt: iso(updatedAt), categories };
    },

    async listCareRecords(staffId, recipientId, { limit = 10, category = null }: { limit?: number | string | null; category?: string | null } = {}) {
      const allowed = await requireAccess(staffId, recipientId);
      const lim = Math.min(Math.max(Number(limit) || 10, 1), 50);
      const rows = await db.query(
        `select r.record_id, r.normalized_text, r.source_text, r.observation, r.response_taken, r.outcome,
                r.observed_at, r.confirmed_at, r.author_label, r.review_status, r.ai_assisted,
                pc.category_code as primary_code,
                coalesce((select array_agg(x.category_code) from care_record_category x
                           where x.record_id = r.record_id and not x.is_primary), '{}') as related
           from care_record r
           join care_record_category pc on pc.record_id = r.record_id and pc.is_primary
          where r.recipient_id = $1 and pc.category_code = any($2::text[])
            and ($3::text is null or pc.category_code = $3)
          order by r.confirmed_at desc, r.record_id
          limit $4`,
        [recipientId, allowed, category, lim],
      );
      return rows.map((r) => ({
        recordId: r.record_id,
        recipientId,
        category: r.primary_code,
        categoryName: categoryByCode(r.primary_code)?.name,
        relatedCategories: r.related.filter((c) => allowed.includes(c)),
        content: r.normalized_text,
        observation: r.observation,
        response: r.response_taken,
        result: r.outcome,
        observedAt: iso(r.observed_at),
        createdAt: iso(r.confirmed_at),
        author: { label: r.author_label, role: 'caregiver' },
        reviewStatus: r.review_status,
        provenance: { type: 'caregiver_observation', aiAssisted: r.ai_assisted, rawInputAvailable: true },
      }));
    },

    async hybridSearch(staffId, recipientId, { keywords, embedding, embeddingModel, limit, rrfK, minVectorScore }) {
      await requireAccess(staffId, recipientId);
      const rows = await db.query(
        `select * from hybrid_search($1, $2, $3::text[], $4::extensions.vector, $5, $6, $7, $8)`,
        [staffId, recipientId, keywords, toVectorLiteral(embedding), embeddingModel, limit, rrfK, minVectorScore],
      );
      return rows.map((r) => ({
        sourceType: r.source_type,
        sourceId: r.source_id,
        category: r.category_code,
        relatedCategories: r.related_categories,
        excerpt: r.content,
        createdAt: iso(r.source_created_at),
        authorRole: r.author_role,
        authorLabel: r.author_label,
        approvalStatus: r.approval_status,
        keywordScore: r.keyword_score,
        vectorScore: r.vector_score,
        rrfScore: r.rrf_score,
      }));
    },

    // ---- 분석 ----------------------------------------------------------
    async createAnalysis(a) {
      const rows = await db.query(
        `insert into situation_analysis (recipient_id, situation_id, staff_id, input_text, input_type, observed_at, status)
         values ($1,$2,$3,$4,$5,$6,'processing') returning analysis_id, created_at`,
        [a.recipientId, a.situationId, a.staffId, a.inputText, a.inputType, a.observedAt],
      );
      return { analysisId: rows[0].analysis_id, createdAt: iso(rows[0].created_at) };
    },

    async completeAnalysis(analysisId, r) {
      await db.query(
        `update situation_analysis set status = $2, structured_input = $3, comparison = $4, guidance = $5, safety = $6,
                clarification = $7, no_data_flag = $8, conflict_flag = $9, engine = $10, completed_at = now()
          where analysis_id = $1`,
        [analysisId, r.status, r.situation, r.comparison, JSON.stringify(r.guidance), r.safety, r.clarification, r.noData, r.conflict, r.engine],
      );
    },

    async failAnalysis(analysisId, code, engine) {
      await db.query(`update situation_analysis set status = 'failed', error_code = $2, engine = $3, completed_at = now() where analysis_id = $1`, [analysisId, code, engine]);
    },

    async insertEvidence(items, { analysisId = null, messageId = null }) {
      const out: any[] = [];
      for (const e of items) {
        const rows = await db.query(
          `insert into analysis_evidence (analysis_id, message_id, source_type, source_id, category_code, excerpt,
                  source_created_at, author_role, approval_status, stance, keyword_score, vector_score, rrf_score)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning evidence_id`,
          [analysisId, messageId, e.sourceType, e.sourceId, e.category, e.excerpt, e.createdAt, e.authorRole, e.approvalStatus,
            e.stance || 'supports', e.keywordScore, e.vectorScore, e.rrfScore],
        );
        out.push({ ...e, evidenceId: rows[0].evidence_id });
      }
      return out;
    },

    async getAnalysis(staffId, analysisId) {
      const rows = await db.query('select * from situation_analysis where analysis_id = $1', [analysisId]);
      const a = rows[0];
      if (!a) throw new AppError(404, 'NOT_FOUND', '분석 결과를 찾을 수 없습니다.');
      await requireAccess(staffId, a.recipient_id).catch(() => { throw new AppError(404, 'NOT_FOUND', '분석 결과를 찾을 수 없습니다.'); });
      const ev = await db.query('select * from analysis_evidence where analysis_id = $1 order by rrf_score desc nulls last', [analysisId]);
      return { row: a, evidence: ev.map(mapEvidenceRow) };
    },

    // ---- 세션·상황 -------------------------------------------------------
    async createSituation({ sessionId = null, recipientId, inputText, activity }) {
      const rows = await db.query(
        'insert into care_situation (session_id, recipient_id, input_text, activity) values ($1,$2,$3,$4) returning situation_id',
        [sessionId, recipientId, inputText, activity],
      );
      return rows[0].situation_id;
    },

    async attachSituation(situationId, sessionId) {
      await db.query('update care_situation set session_id = $2 where situation_id = $1 and session_id is null', [situationId, sessionId]);
    },

    async getSituation(situationId) {
      const rows = await db.query('select * from care_situation where situation_id = $1', [situationId]);
      return rows[0] || null;
    },

    async latestAnalysisForSituation(situationId) {
      const rows = await db.query(
        `select analysis_id from situation_analysis where situation_id = $1 and status in ('completed','needs_confirmation')
          order by created_at desc limit 1`, [situationId]);
      return rows[0]?.analysis_id || null;
    },

    async createSession({ recipientId, staffId, situationId, idleMinutes }) {
      const rows = await db.query(
        `insert into conversation_session (recipient_id, staff_id, active_situation_id, expires_at)
         values ($1,$2,$3, now() + make_interval(mins => $4)) returning *`,
        [recipientId, staffId, situationId, idleMinutes],
      );
      return rows[0];
    },

    async getSession(staffId, sessionId) {
      const rows = await db.query('select * from conversation_session where session_id = $1 and staff_id = $2', [sessionId, staffId]);
      const s = rows[0];
      if (!s) throw new AppError(404, 'NOT_FOUND', '대화 세션을 찾을 수 없습니다.');
      await requireAccess(staffId, s.recipient_id);
      if (s.status === 'active' && s.expires_at && new Date(s.expires_at) < new Date()) {
        const up = await db.query(`update conversation_session set status = 'expired' where session_id = $1 returning *`, [sessionId]);
        return up[0];
      }
      return s;
    },

    async touchSession(sessionId, idleMinutes, activeSituationId) {
      const rows = await db.query(
        `update conversation_session set last_activity_at = now(), expires_at = now() + make_interval(mins => $2),
                active_situation_id = coalesce($3, active_situation_id)
          where session_id = $1 returning *`,
        [sessionId, idleMinutes, activeSituationId || null],
      );
      return rows[0];
    },

    async closeSession(sessionId) {
      const rows = await db.query(
        `update conversation_session set status = 'closed', closed_at = now() where session_id = $1 and status = 'active' returning *`, [sessionId]);
      return rows[0] || null;
    },

    async insertMessage(m) {
      return db.tx(async (t) => {
        const seq = await t.query('select coalesce(max(sequence_no), 0) + 1 as n from conversation_message where session_id = $1', [m.sessionId]);
        const rows = await t.query(
          `insert into conversation_message (session_id, situation_id, sequence_no, speaker, message_text, input_type,
                  answer_status, basis, no_data_flag, conflict_flag, engine)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
          [m.sessionId, m.situationId, seq[0].n, m.speaker, m.text, m.inputType || null, m.answerStatus || null, m.basis || null,
            Boolean(m.noData), Boolean(m.conflict), m.engine || null],
        );
        return rows[0];
      });
    },

    async listMessages(sessionId) {
      const msgs = await db.query('select * from conversation_message where session_id = $1 order by sequence_no', [sessionId]);
      const ev = await db.query(
        `select e.* from analysis_evidence e join conversation_message m on m.message_id = e.message_id where m.session_id = $1`, [sessionId]);
      const byMsg = new Map<string, any[]>();
      ev.forEach((e) => { const l = byMsg.get(e.message_id) || []; l.push(mapEvidenceRow(e)); byMsg.set(e.message_id, l); });
      return msgs.map((m) => mapMessageRow(m, byMsg.get(m.message_id) || []));
    },

    // ---- 기록 초안·저장 --------------------------------------------------
    async insertDraft(d) {
      const rows = await db.query(
        `insert into care_record_draft (recipient_id, staff_id, situation_id, raw_text, input_type, activity_hint, observed_at, proposal, engine)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [d.recipientId, d.staffId, d.situationId, d.rawText, d.inputType, d.activityHint, d.observedAt, d.proposal, d.engine],
      );
      return rows[0];
    },

    async getDraft(staffId, draftId) {
      const rows = await db.query('select * from care_record_draft where draft_id = $1 and staff_id = $2', [draftId, staffId]);
      const d = rows[0];
      if (!d) throw new AppError(404, 'NOT_FOUND', '기록 후보를 찾을 수 없습니다.');
      await requireAccess(staffId, d.recipient_id);
      return d;
    },

    async updateDraft(draftId, { edited, reviewed, expectedVersion }) {
      const rows = await db.query(
        `update care_record_draft set edited = $2, reviewed = $3, status = case when $3 then 'reviewed' else 'needs_review' end,
                version = version + 1, updated_at = now()
          where draft_id = $1 and status in ('needs_review','reviewed') and ($4::int is null or version = $4)
          returning *`,
        [draftId, edited, reviewed, expectedVersion ?? null],
      );
      return rows[0] || null;
    },

    async discardDraft(draftId) {
      await db.query(`update care_record_draft set status = 'discarded', updated_at = now() where draft_id = $1 and status <> 'saved'`, [draftId]);
    },

    /** 초안 → 종사자 확인 기록. 공식 가이드(care_guide_item)는 건드리지 않는다. */
    async saveDraftAsRecord(draft, final, author, embedding, embeddingModel) {
      return db.tx(async (t) => {
        const lock = await t.query(`select status, saved_record_id from care_record_draft where draft_id = $1 for update`, [draft.draft_id]);
        if (lock[0].status === 'saved') return { recordId: lock[0].saved_record_id, alreadySaved: true };
        const rec = await t.query(
          `insert into care_record (recipient_id, situation_id, observed_at, source_text, normalized_text, observation, response_taken,
                  outcome, context, input_type, author_staff_id, author_label, review_status, ai_assisted, embedding, embedding_model)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'staff_confirmed',true,$13::extensions.vector,$14)
           returning record_id, confirmed_at`,
          [draft.recipient_id, draft.situation_id, draft.observed_at, draft.raw_text, final.content, JSON.stringify(final.observation),
            JSON.stringify(final.response), final.result, final.context || null, draft.input_type, author.staffId, author.label,
            toVectorLiteral(embedding), embeddingModel],
        );
        const recordId = rec[0].record_id;
        await t.query(
          `insert into care_record_category (record_id, category_code, is_primary, assigned_by) values ($1,$2,true,$3)`,
          [recordId, final.category, final.assignedBy],
        );
        for (const c of final.relatedCategories) {
          await t.query(
            `insert into care_record_category (record_id, category_code, is_primary, assigned_by) values ($1,$2,false,$3) on conflict do nothing`,
            [recordId, c, final.assignedBy],
          );
        }
        await t.query(`update care_record_draft set status = 'saved', saved_record_id = $2, updated_at = now() where draft_id = $1`, [draft.draft_id, recordId]);
        return { recordId, confirmedAt: iso(rec[0].confirmed_at), alreadySaved: false };
      });
    },

    async getRecordBasic(recordId) {
      const rows = await db.query(
        `select r.record_id, r.recipient_id, r.normalized_text, pc.category_code
           from care_record r join care_record_category pc on pc.record_id = r.record_id and pc.is_primary
          where r.record_id = $1`, [recordId]);
      return rows[0] || null;
    },

    // ---- 보호자에게 묻기 (설명서에 없는 내용) -----------------------------
    async createGuardianQuestion({ recipientId, staffId, questionText }) {
      const rows = await db.query(
        `insert into guardian_question (recipient_id, asked_by, question_text) values ($1,$2,$3) returning *`,
        [recipientId, staffId, questionText],
      );
      return mapQuestionRow(rows[0]);
    },

    async listGuardianQuestions(recipientId) {
      const rows = await db.query(
        `select q.*, r.display_name from guardian_question q join recipient r on r.recipient_id = q.recipient_id
          where ($1::text is null or q.recipient_id = $1) order by q.created_at desc limit 50`,
        [recipientId || null],
      );
      return rows.map((r) => ({ ...mapQuestionRow(r), recipientName: r.display_name }));
    },

    async answerGuardianQuestion(questionId, answerText) {
      const rows = await db.query(
        `update guardian_question set status = 'answered', answer_text = $2, answered_at = now()
          where question_id = $1 and status = 'pending' returning *`,
        [questionId, answerText],
      );
      return rows[0] ? mapQuestionRow(rows[0]) : null;
    },

    // ---- 공식 가이드 반영 요청 (별도 승인 흐름) --------------------------
    async createGuideRequest({ recordId, recipientId, categoryCode, proposedContent }) {
      const rows = await db.query(
        `insert into guide_update_request (record_id, recipient_id, category_code, proposed_content) values ($1,$2,$3,$4) returning *`,
        [recordId, recipientId, categoryCode, proposedContent],
      );
      return mapRequestRow(rows[0]);
    },

    async listGuideRequests(recipientId) {
      const rows = await db.query(
        `select q.*, r.display_name, g.content as current_content, g.confirmed_at as current_confirmed_at,
                rec.source_text, rec.normalized_text, rec.confirmed_at as record_confirmed_at, rec.author_label
           from guide_update_request q
           join recipient r on r.recipient_id = q.recipient_id
           join care_record rec on rec.record_id = q.record_id
           left join care_guide_item g on g.recipient_id = q.recipient_id and g.category_code = q.category_code
          where ($1::text is null or q.recipient_id = $1)
          order by q.created_at desc`, [recipientId || null]);
      return rows.map((r) => ({
        ...mapRequestRow(r),
        recipientName: r.display_name,
        currentGuideContent: r.current_content,
        currentGuideConfirmedAt: iso(r.current_confirmed_at),
        record: { sourceText: r.source_text, content: r.normalized_text, confirmedAt: iso(r.record_confirmed_at), authorLabel: r.author_label },
      }));
    },

    async getGuideContent(recipientId, categoryCode) {
      const rows = await db.query(
        `select content from care_guide_item where recipient_id = $1 and category_code = $2 and status = 'published'`, [recipientId, categoryCode]);
      return rows[0]?.content || null;
    },

    async getGuideRequest(requestId) {
      const rows = await db.query('select * from guide_update_request where request_id = $1', [requestId]);
      return rows[0] || null;
    },

    async decideGuideRequest(requestId, { decision, note, content }) {
      const rows = await db.query(
        `update guide_update_request set status = $2, decision_note = $3, proposed_content = coalesce($4, proposed_content), decided_at = now()
          where request_id = $1 and status in ('proposed','on_hold') returning *`,
        [requestId, decision, note || null, content || null],
      );
      return rows[0] ? mapRequestRow(rows[0]) : null;
    },

    /** 승인된 요청을 공식 가이드에 반영: 새 revision 생성, 이전 revision superseded. */
    async applyGuideRequest(requestId, embedding, embeddingModel) {
      return db.tx(async (t) => {
        const q = (await t.query(`select * from guide_update_request where request_id = $1 for update`, [requestId]))[0];
        if (!q || q.status !== 'approved') return null;
        let item = (await t.query('select * from care_guide_item where recipient_id = $1 and category_code = $2', [q.recipient_id, q.category_code]))[0];
        if (!item) {
          item = (await t.query(
            `insert into care_guide_item (recipient_id, category_code, status) values ($1,$2,'missing') returning *`,
            [q.recipient_id, q.category_code]))[0];
        }
        const nextNo = item.current_revision_no + 1;
        await t.query(`update care_guide_revision set status = 'superseded' where guide_item_id = $1 and status = 'published'`, [item.guide_item_id]);
        await t.query(
          `insert into care_guide_revision (guide_item_id, revision_no, content, status, change_reason, request_id)
           values ($1,$2,$3,'published',$4,$5)`,
          [item.guide_item_id, nextNo, q.proposed_content, q.decision_note || '종사자 기록 기반 보호자 승인', requestId],
        );
        await t.query(
          `update care_guide_item set content = $2, status = 'published', current_revision_no = $3, confirmed_at = now(), updated_at = now(),
                  embedding = $4::extensions.vector, embedding_model = $5
            where guide_item_id = $1`,
          [item.guide_item_id, q.proposed_content, nextNo, toVectorLiteral(embedding), embeddingModel],
        );
        const up = await t.query(`update guide_update_request set status = 'applied', applied_at = now(), apply_error = null where request_id = $1 returning *`, [requestId]);
        return mapRequestRow(up[0]);
      });
    },

    async markApplyError(requestId, message) {
      await db.query('update guide_update_request set apply_error = $2 where request_id = $1', [requestId, message]);
    },
  };
}

export function mapEvidenceRow(e) {
  return {
    evidenceId: e.evidence_id,
    sourceType: e.source_type,
    sourceId: e.source_id,
    category: e.category_code,
    categoryName: categoryByCode(e.category_code)?.name || null,
    excerpt: e.excerpt,
    createdAt: iso(e.source_created_at),
    authorRole: e.author_role,
    approvalStatus: e.approval_status,
    stance: e.stance,
    scores: { keyword: e.keyword_score, vector: e.vector_score, fused: e.rrf_score },
  };
}

export function mapMessageRow(m, evidence: any[] = []) {
  return {
    messageId: m.message_id,
    sessionId: m.session_id,
    situationId: m.situation_id,
    sequenceNo: m.sequence_no,
    role: m.speaker === 'caregiver' ? 'user' : m.speaker,
    content: m.message_text,
    inputType: m.input_type,
    answerStatus: m.answer_status,
    basis: m.basis,
    noData: m.no_data_flag,
    conflict: m.conflict_flag,
    engine: m.engine,
    createdAt: iso(m.created_at),
    evidence,
  };
}

function mapRequestRow(r) {
  return {
    requestId: r.request_id,
    recordId: r.record_id,
    recipientId: r.recipient_id,
    category: r.category_code,
    categoryName: categoryByCode(r.category_code)?.name,
    proposedContent: r.proposed_content,
    status: r.status,
    decisionNote: r.decision_note,
    createdAt: iso(r.created_at),
    decidedAt: iso(r.decided_at),
    appliedAt: iso(r.applied_at),
    applyError: r.apply_error,
  };
}
