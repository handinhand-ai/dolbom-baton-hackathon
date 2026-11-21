// P0/P1 핵심 흐름과 제품 원칙 검증 (로컬 PGlite + pgvector, 외부 API 없음)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeContext, call, STAFF } from './helpers';
import { validateAiAnalysis } from '../src/lib/services/analysis';
import { extractSituation, structureExperience } from '../src/lib/text/local-engine';

let ctx: any;
const srv = { call };
before(async () => { ctx = await makeContext(); });
after(async () => { await ctx.db.close(); });

const analyze = (body: Record<string, unknown>) => srv.call('POST', '/api/v1/care-analyses', { recipientId: 'rec_demo_01', ...body });

test('대상자 목록은 접근 권한이 있는 대상자만 반환한다', async () => {
  const r = await srv.call('GET', '/api/v1/recipients');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.items.map((x) => x.recipientId).sort(), ['rec_demo_01', 'rec_demo_02']);
  const denied = await srv.call('GET', '/api/v1/recipients/rec_demo_03/care-guide');
  assert.equal(denied.status, 404);
  assert.equal(denied.data.error.code, 'NOT_FOUND');
});

test('돌봄 가이드는 9개 항목을 모두 반환하고 미작성·비공유를 구분한다', async () => {
  const g1 = await srv.call('GET', '/api/v1/recipients/rec_demo_01/care-guide');
  assert.equal(g1.data.categories.length, 9);
  assert.equal(g1.data.categories.find((c) => c.code === 'DAILY_ROUTINE_SLEEP').status, 'missing');
  const g2 = await srv.call('GET', '/api/v1/recipients/rec_demo_02/care-guide');
  const health = g2.data.categories.find((c) => c.code === 'HEALTH_SAFETY_INFO');
  assert.equal(health.status, 'not_shared');
  assert.equal(health.content, null);
});

test('하이브리드 검색은 선택된 대상자·허용 카테고리 범위를 벗어나지 않는다', async () => {
  const common = { keywords: ['식사', '소리', '헤드폰', '음악', '건강', '[도윤 전용]', '[비공유 항목]'], embeddingModel: ctx.embedder.model, limit: 50, rrfK: 60, minVectorScore: 0 };
  const [emb] = await ctx.embedder.embed(['식사 중 소리를 지름 헤드폰 음악'], 'query');
  const r1 = await ctx.repo.hybridSearch(STAFF, 'rec_demo_01', { ...common, embedding: emb });
  assert.ok(r1.length > 0);
  assert.ok(r1.every((e) => !e.excerpt.includes('[도윤 전용]')));
  const r2 = await ctx.repo.hybridSearch(STAFF, 'rec_demo_02', { ...common, embedding: emb });
  assert.ok(r2.every((e) => !e.excerpt.includes('[비공유 항목]') && e.category !== 'HEALTH_SAFETY_INFO'));
  await assert.rejects(ctx.repo.hybridSearch(STAFF, 'rec_demo_03', { ...common, embedding: emb }), (e: any) => e.code === 'NOT_FOUND');
  // SQL 함수 자체도 권한 없는 호출을 거부한다.
  await assert.rejects(ctx.db.query(`select * from hybrid_search('staff_demo_01','rec_demo_03','{식사}'::text[], null, 'x')`));
  // 각 근거는 출처 ID와 작성일을 가진다.
  assert.ok(r1.every((e) => e.sourceId && e.createdAt && ['official_care_guide', 'care_record'].includes(e.sourceType)));
});

test('WF-01: 상황 구조화 · 근거 연결 대응 가이드 (입력에 없는 원인 생성 안 함)', async () => {
  const r = await analyze({ situation: '민준이가 오늘 밥을 먹으려고 하지 않고 계속 고개를 돌려.' });
  assert.equal(r.status, 201);
  const a = r.data;
  assert.equal(a.situation.activity, '식사');
  assert.deepEqual(a.situation.observedBehavior, ['식사 거부', '고개 돌림']);
  assert.equal(a.comparison.status, 'evidence_found');
  const evIds = new Set(a.evidence.map((e) => e.evidenceId));
  const personal = a.guidance.filter((g) => g.basis === 'guide_based' || g.basis === 'record_based');
  assert.ok(personal.length > 0);
  assert.ok(personal.every((g) => g.evidenceRefs.length > 0 && g.evidenceRefs.every((id) => evIds.has(id))));
  assert.ok(a.evidence.every((e) => e.sourceId && e.createdAt));
  assert.equal(JSON.stringify(a.situation).includes('때문'), false);
  const again = await srv.call('GET', `/api/v1/care-analyses/${a.analysisId}`);
  assert.equal(again.data.analysisId, a.analysisId);
});

test('WF-01: 비교할 기록이 없으면 비교 불가·근거 없음으로 표시한다', async () => {
  const { data } = await analyze({ situation: '목욕은 몇 시에 해요?' });
  assert.equal(data.comparison.status, 'no_comparable_records');
  assert.match(data.comparison.summary, /비교할 기록 없음/);
  assert.equal(data.noData, true);
  assert.ok(data.guidance.some((g) => g.basis === 'no_data' && /보호자/.test(g.text)));
});

test('WF-01: 상충 기록은 양쪽 출처·작성일을 모두 표시한다', async () => {
  const { data } = await analyze({ situation: '큰 소리 나서 귀를 막고 소리를 질러요' });
  assert.equal(data.comparison.status, 'conflicting_evidence');
  assert.ok(data.conflicts.length > 0);
  const contradicting = data.evidence.filter((e) => e.stance === 'contradicts');
  assert.ok(contradicting.length >= 2);
  assert.ok(contradicting.every((e) => e.createdAt));
  assert.equal(data.recordStatus, 'needs_confirmation');
});

test('WF-01: 의료적 판단이 필요한 표현은 진단 없이 보호자·의료진 확인을 안내한다', async () => {
  const { data } = await analyze({ situation: '열이 나는 것 같고 몸을 떨어요' });
  assert.equal(data.safety.medicalConcern, true);
  assert.equal(data.safety.medicalAdvice, false);
  assert.equal(data.guidance[0].basis, 'general_safety');
  assert.match(data.guidance[0].text, /진단·치료·처방을 하지 않습니다/);
});

test('WF-01: 입력 오류 처리 (빈 입력, 음성 미확인, 잘못된 JSON, 권한 없는 대상자)', async () => {
  assert.equal((await analyze({ situation: '   ' })).status, 400);
  const voice = await analyze({ situation: '밥을 안 먹어요', inputType: 'voice_transcribed' });
  assert.equal(voice.status, 400);
  assert.equal(voice.data.error.details[0].field, 'transcriptConfirmed');
  assert.equal((await srv.call('POST', '/api/v1/care-analyses', '{bad json')).status, 400);
  assert.equal((await srv.call('POST', '/api/v1/care-analyses', { recipientId: 'rec_demo_03', situation: '밥을 안 먹어요' })).status, 404);
  const m = await srv.call('DELETE', '/api/v1/recipients');
  assert.equal(m.status, 405);
  assert.equal(m.headers.get('allow'), 'GET');
});

test('WF-02: 후속 질문은 상황 맥락을 유지하고, 새 상황은 사용자 선택 후에만 분리한다', async () => {
  const { data: a } = await analyze({ situation: '점심에 밥을 안 먹고 식판을 밀어내요' });
  const s = await srv.call('POST', '/api/v1/conversation-sessions', { recipientId: 'rec_demo_01', analysisId: a.analysisId });
  assert.equal(s.status, 201);
  const sid = s.data.sessionId;
  const f = await srv.call('POST', `/api/v1/conversation-sessions/${sid}/messages`, { content: '다른 방법은 없을까?' });
  assert.equal(f.status, 200);
  assert.equal(f.data.assistantMessage.situationId, a.situationId);
  assert.ok(['record_based', 'guide_based'].includes(f.data.assistantMessage.basis));

  const n = await srv.call('POST', `/api/v1/conversation-sessions/${sid}/messages`, { content: '이번엔 화장실에서 소리를 질러요' });
  assert.ok(n.data.needsUserDecision, '새 상황 가능성이 있으면 답하지 않고 선택을 요청');
  const before = (await srv.call('GET', `/api/v1/conversation-sessions/${sid}/messages`)).data.items.length;

  const keep = await srv.call('POST', `/api/v1/conversation-sessions/${sid}/messages`, { content: '이번엔 화장실에서 소리를 질러요', decision: 'continue_existing' });
  assert.equal(keep.data.assistantMessage.situationId, a.situationId);

  const split = await srv.call('POST', `/api/v1/conversation-sessions/${sid}/messages`, { content: '이번엔 화장실에서 소리를 질러요', decision: 'start_new' });
  assert.notEqual(split.data.analysis.situationId, a.situationId);
  assert.equal(split.data.session.activeSituationId, split.data.analysis.situationId);
  const hist = (await srv.call('GET', `/api/v1/conversation-sessions/${sid}/messages`)).data.items;
  assert.equal(hist.length, before + 4);
  assert.ok(hist.every((m) => m.situationId));

  const exp = await srv.call('POST', `/api/v1/conversation-sessions/${sid}/messages`, { content: '헤드폰을 주니까 괜찮아졌어' });
  assert.equal(exp.data.assistantMessage.suggestRecord, true);
});

test('WF-02: 비활성 세션은 만료되고, 종료된 세션에는 메시지를 추가할 수 없다', async () => {
  const s = await srv.call('POST', '/api/v1/conversation-sessions', { recipientId: 'rec_demo_01' });
  await ctx.db.query(`update conversation_session set expires_at = now() - interval '1 minute' where session_id = $1`, [s.data.sessionId]);
  const r = await srv.call('POST', `/api/v1/conversation-sessions/${s.data.sessionId}/messages`, { content: '밥을 안 먹어요' });
  assert.equal(r.status, 409);
  assert.equal(r.data.error.code, 'SESSION_EXPIRED');
  const s2 = await srv.call('POST', '/api/v1/conversation-sessions', { recipientId: 'rec_demo_01' });
  await srv.call('POST', `/api/v1/conversation-sessions/${s2.data.sessionId}/close`, {});
  const r2 = await srv.call('POST', `/api/v1/conversation-sessions/${s2.data.sessionId}/messages`, { content: '질문' });
  assert.equal(r2.data.error.code, 'SESSION_CLOSED');
});

test('WF-03: 기록 후보 → 종사자 확인 전 저장 차단 → 확인 후 저장, 공식 가이드는 그대로', async () => {
  const guideBefore = await ctx.db.query(`select content, current_revision_no from care_guide_item where recipient_id = 'rec_demo_01' and category_code = 'ANXIETY_CHALLENGING_BEHAVIOR'`);
  const d = await srv.call('POST', '/api/v1/care-record-drafts', { recipientId: 'rec_demo_01', rawText: '산책 중 사람이 많아서 귀를 막았는데 그림카드를 보여 주니까 진정됐어요.', activityHint: '불안 발생' });
  assert.equal(d.status, 201);
  assert.equal(d.data.status, 'needs_review');
  assert.equal(d.data.proposal.category, 'ANXIETY_CHALLENGING_BEHAVIOR');
  assert.ok(d.data.proposal.response.length > 0 && d.data.proposal.result);
  const draftCount = await ctx.db.query(`select count(*)::int n from care_record where source_text like '산책 중%'`);
  assert.equal(draftCount[0].n, 0, '초안은 공식 기록이 아니다');

  const early = await srv.call('POST', `/api/v1/care-record-drafts/${d.data.draftId}/save`, { recipientId: 'rec_demo_01' });
  assert.equal(early.status, 409);
  assert.equal(early.data.error.code, 'REVIEW_REQUIRED');

  const mismatch = await srv.call('PATCH', `/api/v1/care-record-drafts/${d.data.draftId}`, { recipientId: 'rec_demo_02', reviewed: true });
  assert.equal(mismatch.data.error.code, 'RECIPIENT_MISMATCH');
  const badCat = await srv.call('PATCH', `/api/v1/care-record-drafts/${d.data.draftId}`, { category: '일상·환경', reviewed: true });
  assert.equal(badCat.status, 400);

  const edited = '산책 중 사람이 많은 곳에서 귀를 막음. 그림카드를 보여 주자 진정됨.';
  const p = await srv.call('PATCH', `/api/v1/care-record-drafts/${d.data.draftId}`, { recipientId: 'rec_demo_01', content: edited, relatedCategories: ['COMMUNICATION'], reviewed: true, version: d.data.version });
  assert.equal(p.status, 200);
  const stale = await srv.call('PATCH', `/api/v1/care-record-drafts/${d.data.draftId}`, { reviewed: true, version: d.data.version });
  assert.equal(stale.data.error.code, 'VERSION_CONFLICT');

  const saved = await srv.call('POST', `/api/v1/care-record-drafts/${d.data.draftId}/save`, { recipientId: 'rec_demo_01', requestGuideUpdate: true });
  assert.equal(saved.status, 201);
  assert.equal(saved.data.content, edited);
  assert.equal(saved.data.reviewStatus, 'staff_confirmed');
  assert.equal(saved.data.officialGuideChanged, false);
  assert.equal(saved.data.guideUpdateRequest.status, 'proposed');
  const again = await srv.call('POST', `/api/v1/care-record-drafts/${d.data.draftId}/save`, { recipientId: 'rec_demo_01' });
  assert.equal(again.data.recordId, saved.data.recordId, '재시도는 같은 기록을 돌려준다');

  const guideAfter = await ctx.db.query(`select content, current_revision_no from care_guide_item where recipient_id = 'rec_demo_01' and category_code = 'ANXIETY_CHALLENGING_BEHAVIOR'`);
  assert.deepEqual(guideAfter, guideBefore);
  const raw = await ctx.db.query('select source_text from care_record where record_id = $1', [saved.data.recordId]);
  assert.match(raw[0].source_text, /^산책 중 사람이 많아서/, '원본 입력 보존');

  // E2E-T02: 저장된 기록이 다음 분석의 근거로 검색된다
  const { data: next } = await analyze({ situation: '사람이 많은 곳에서 귀를 막아요' });
  assert.ok(next.evidence.some((e) => e.sourceId === saved.data.recordId && e.sourceType === 'care_record'));

  // 보호자 승인 흐름: 승인 전 반영 불가 → 승인 → 반영(새 버전)
  const reqId = saved.data.guideUpdateRequest.requestId;
  assert.equal((await srv.call('POST', `/api/v1/care-guide-reviews/${reqId}/apply`, {})).data.error.code, 'NOT_APPROVED');
  assert.equal((await srv.call('POST', `/api/v1/care-guide-reviews/${reqId}/decision`, { decision: 'approved' })).data.status, 'approved');
  const applied = await srv.call('POST', `/api/v1/care-guide-reviews/${reqId}/apply`, {});
  assert.equal(applied.data.status, 'applied');
  assert.ok(applied.data.decidedAt && applied.data.appliedAt);
  const g = await ctx.db.query(`select content, current_revision_no from care_guide_item where recipient_id = 'rec_demo_01' and category_code = 'ANXIETY_CHALLENGING_BEHAVIOR'`);
  assert.equal(g[0].current_revision_no, guideBefore[0].current_revision_no + 1);
  assert.ok(g[0].content.startsWith(guideBefore[0].content), '기본 제안은 기존 내용을 유지하고 추가한다');
});

test('WF-03: 보호자 반려 시 공식 가이드는 바뀌지 않고 종사자 기록은 남는다', async () => {
  const d = await srv.call('POST', '/api/v1/care-record-drafts', { recipientId: 'rec_demo_01', rawText: '저녁 반 정도 먹음' });
  await srv.call('PATCH', `/api/v1/care-record-drafts/${d.data.draftId}`, { category: 'MEAL', reviewed: true });
  const saved = await srv.call('POST', `/api/v1/care-record-drafts/${d.data.draftId}/save`, { requestGuideUpdate: true });
  const reqId = saved.data.guideUpdateRequest.requestId;
  const before = await ctx.db.query(`select content from care_guide_item where recipient_id='rec_demo_01' and category_code='MEAL'`);
  assert.equal((await srv.call('POST', `/api/v1/care-guide-reviews/${reqId}/decision`, { decision: 'rejected', note: '확인 필요' })).data.status, 'rejected');
  assert.equal((await srv.call('POST', `/api/v1/care-guide-reviews/${reqId}/apply`, {})).status, 409);
  const after = await ctx.db.query(`select content from care_guide_item where recipient_id='rec_demo_01' and category_code='MEAL'`);
  assert.deepEqual(after, before);
  const rec = await ctx.db.query('select count(*)::int n from care_record where record_id = $1', [saved.data.recordId]);
  assert.equal(rec[0].n, 1);
});

test('규칙 기반 구조화는 입력 표현만 사용한다', () => {
  const s = extractSituation('평소에는 식사를 잘하는데 오늘은 식판을 밀어내고 소리를 지르고 있어요.');
  assert.equal(s.activity, '식사');
  assert.ok(s.observedBehavior.includes('밀어냄') && s.observedBehavior.includes('소리 지름'));
  assert.match(s.usualBehaviorMentioned as string, /^평소에는 식사를 잘하는데/);
  const e = structureExperience('오늘 점심 식사 때 처음에는 식판을 밀어냈지만, 잠시 쉬고 나서 좋아하는 반찬부터 제공하니 다시 식사를 시작했어요.');
  assert.equal(e.category, 'MEAL');
  assert.ok(e.observation.join(' ').includes('식판을 밀어냈'));
  assert.ok(e.response.join(' ').includes('반찬부터 제공'));
  assert.match(e.result as string, /다시 식사를 시작/);
  const amb = structureExperience('오늘 기분이 좋아 보였어요');
  assert.equal(amb.needsCategorySelection, true);
});

test('AI 결과 검증: 근거 목록에 없는 ID는 버리고 근거 없는 개인 안내는 일반 안내로 낮춘다', () => {
  const evidence = [{ evidenceId: 'E1', excerpt: '헤드폰을 쓰면 진정돼요', sourceType: 'official_care_guide' }];
  const info = { medical: { flag: false, matched: null } };
  const v = validateAiAnalysis({
    situation: { summary: 's', activity: null, observedBehavior: [], details: [], usualBehaviorMentioned: null, timeMentioned: null },
    clarification: { needed: false, question: null },
    comparison: { status: 'evidence_found', summary: '차이 있음', usualItems: [{ text: 'x', evidenceRefs: ['E9'] }] },
    guidance: [
      { text: '헤드폰을 주세요', basis: 'guide_based', evidenceRefs: ['E1', 'E7'] },
      { text: '평소 좋아하는 음악을 틀어 주세요', basis: 'record_based', evidenceRefs: ['E5'] },
      { text: '해열제 5mg을 투약하세요', basis: 'general', evidenceRefs: [] },
    ],
    conflicts: [{ evidenceRefs: ['E1', 'E8'], description: '?' }],
    medicalConcern: { flag: false, reason: null },
  }, evidence, info);
  assert.deepEqual(v.guidance[0].evidenceRefs, ['E1']);
  assert.equal(v.guidance[1].basis, 'general');
  assert.match(v.guidance[2].text, /진단·치료·처방을 하지 않습니다/);
  assert.equal(v.comparison.status, 'no_comparable_records');
  assert.equal(v.conflicts.length, 0);
});

test('STT: OpenAI 키가 없으면 서버 받아쓰기를 쓸 수 없다고 안내한다 (음성은 저장하지 않음)', async () => {
  const r = await srv.call('POST', '/api/v1/stt', new Uint8Array([1, 2, 3]), { 'content-type': 'audio/webm' });
  assert.equal(r.status, 503);
  assert.equal(r.data.error.code, 'STT_UNAVAILABLE');
});

test('시스템 상태는 실제 연동 모드를 그대로 보여 준다', async () => {
  const r = await srv.call('GET', '/api/v1/system/status');
  assert.equal(r.data.database.mode, 'local-pglite');
  assert.equal(r.data.ai.mode, 'local');
  assert.equal(r.data.embedding.mode, 'local-hash');
  assert.equal(r.data.stt.mode, 'browser');
});
