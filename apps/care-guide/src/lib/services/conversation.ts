// WF-02 후속 질문·대화. 세션과 돌봄 상황을 분리하고, 상황별 근거를 섞지 않는다.
import { AppError, mapMessageRow } from '../repo';
import { categoryByCode } from '../categories';
import { extractSituation, extractKeywords, classifyFollowUp, detectConflicts } from '../text/local-engine';
import { FOLLOWUP_SCHEMA } from '../ai/openai';
import { requireText, parseInputType, searchEvidence, sourceLabel, MEDICAL_NOTICE, scrubMedical } from './common';
import { runAnalysis, getAnalysisView } from './analysis';

function sessionView(s) {
  return {
    sessionId: s.session_id,
    recipientId: s.recipient_id,
    activeSituationId: s.active_situation_id,
    status: s.status,
    createdAt: new Date(s.created_at).toISOString(),
    lastActivityAt: new Date(s.last_activity_at).toISOString(),
    expiresAt: s.expires_at ? new Date(s.expires_at).toISOString() : null,
    closedAt: s.closed_at ? new Date(s.closed_at).toISOString() : null,
  };
}

function assertActive(s) {
  if (s.status === 'expired') throw new AppError(409, 'SESSION_EXPIRED', '대화가 오래 멈춰 있어 종료되었습니다. 새 대화를 시작해 주세요.');
  if (s.status === 'closed') throw new AppError(409, 'SESSION_CLOSED', '종료된 대화입니다. 새 대화를 시작해 주세요.');
}

function analysisSummaryText(a) {
  const steps = (a.guidance || []).map((g) => `${g.step || ''}. ${g.text}`).join('\n');
  return `상황 분석: ${a.situation?.summary || ''}\n${a.comparison?.summary || ''}\n${steps}`.trim();
}

export async function createSession(ctx, staffId, body) {
  const recipient = await ctx.repo.getRecipient(staffId, body.recipientId);
  let situationId: string | null = null;
  let analysis: any = null;
  if (body.analysisId) {
    analysis = await getAnalysisView(ctx, staffId, body.analysisId);
    if (analysis.recipientId !== recipient.recipientId) {
      throw new AppError(409, 'RECIPIENT_MISMATCH', '분석의 대상자와 선택한 대상자가 다릅니다. 대상자를 다시 확인해 주세요.');
    }
    situationId = analysis.situationId;
  }
  const s = await ctx.repo.createSession({ recipientId: recipient.recipientId, staffId, situationId, idleMinutes: ctx.config.session.idleMinutes });
  if (analysis) {
    await ctx.repo.attachSituation(situationId, s.session_id);
    // 대화 이력에 최초 상황 입력과 분석 결과를 남긴다(근거 연결 포함).
    await ctx.repo.insertMessage({ sessionId: s.session_id, situationId, speaker: 'caregiver', text: analysis.input.text, inputType: analysis.input.inputType });
    const msg = await ctx.repo.insertMessage({
      sessionId: s.session_id, situationId, speaker: 'assistant', text: analysisSummaryText(analysis),
      answerStatus: analysis.noData ? 'no_data' : analysis.recordStatus === 'needs_confirmation' ? 'needs_confirmation' : 'answered',
      basis: 'analysis', noData: analysis.noData, conflict: analysis.conflict, engine: analysis.engine,
    });
    await ctx.repo.insertEvidence(analysis.evidence.map((e) => ({ ...e, authorRole: e.authorRole, rrfScore: e.scores?.fused, keywordScore: e.scores?.keyword, vectorScore: e.scores?.vector })), { messageId: msg.message_id });
  }
  return sessionView(s);
}

export async function getSession(ctx, staffId, sessionId) {
  const s = await ctx.repo.getSession(staffId, sessionId);
  return sessionView(s);
}

export async function listMessages(ctx, staffId, sessionId) {
  const s = await ctx.repo.getSession(staffId, sessionId);
  return { session: sessionView(s), items: await ctx.repo.listMessages(sessionId) };
}

export async function closeSession(ctx, staffId, sessionId) {
  const s = await ctx.repo.getSession(staffId, sessionId);
  if (s.status !== 'active') return sessionView(s);
  return sessionView(await ctx.repo.closeSession(sessionId));
}

async function situationContext(ctx, staffId, situationId) {
  const sit = situationId ? await ctx.repo.getSituation(situationId) : null;
  if (!sit) return { sit: null, info: null, priorEvidence: [] };
  const info = extractSituation(sit.input_text);
  const analysisId = await ctx.repo.latestAnalysisForSituation(situationId);
  const priorEvidence = analysisId ? (await ctx.repo.getAnalysis(staffId, analysisId)).evidence : [];
  return { sit, info, priorEvidence };
}

function localAnswer(question, evidence, classification) {
  if (classification === 'experience_statement') {
    return {
      answer: '새로 알게 된 돌봄 경험으로 보입니다. "경험 기록" 화면에서 내용을 확인한 뒤 기록으로 저장할 수 있어요. (아직 저장되지 않았습니다)',
      basis: 'general', evidenceRefs: [], needsGuardianCheck: false, suggestRecord: true,
    };
  }
  if (evidence.length === 0) {
    return { answer: '이 질문과 관련해 확인된 기록이 없습니다. 보호자 확인이 필요합니다.', basis: 'no_data', evidenceRefs: [], needsGuardianCheck: true, suggestRecord: false };
  }
  const top = evidence.slice(0, 3);
  const lines = top.map((e) => `• ${e.excerpt} (${sourceLabel(e)})`);
  const hasGuide = top.some((e) => e.sourceType === 'official_care_guide');
  return {
    answer: `확인된 기록은 다음과 같습니다.\n${lines.join('\n')}\n기록에 없는 내용은 보호자에게 확인해 주세요.`,
    basis: hasGuide ? 'guide_based' : 'record_based', evidenceRefs: top.map((e) => e.evidenceId), needsGuardianCheck: false, suggestRecord: false,
  };
}

export async function postMessage(ctx, staffId, sessionId, body) {
  const content = requireText(body.content, 'content', '질문');
  const inputType = parseInputType(body.inputType);
  let s = await ctx.repo.getSession(staffId, sessionId);
  assertActive(s);
  const situationId = body.situationId || s.active_situation_id;
  if (situationId && situationId !== s.active_situation_id) {
    const sit = await ctx.repo.getSituation(situationId);
    if (!sit || sit.session_id !== s.session_id) throw new AppError(409, 'SITUATION_MISMATCH', '이 대화에 속한 상황이 아닙니다.');
  }
  const decision = body.decision ?? null;
  if (decision && !['continue_existing', 'start_new'].includes(decision)) {
    throw new AppError(400, 'VALIDATION_ERROR', '상황 처리 방식이 올바르지 않습니다.', [{ field: 'decision', reason: 'continue_existing 또는 start_new' }]);
  }

  // 새 상황으로 분리: 독립 situation 과 독립 분석·근거를 만든다.
  if (decision === 'start_new' || (!situationId && !decision)) {
    const analysis = await runAnalysis(ctx, staffId, { recipientId: s.recipient_id, situation: content, inputType, transcriptConfirmed: true }, { sessionId });
    const userMessage = await ctx.repo.insertMessage({ sessionId, situationId: analysis.situationId, speaker: 'caregiver', text: content, inputType });
    const am = await ctx.repo.insertMessage({
      sessionId, situationId: analysis.situationId, speaker: 'assistant', text: analysisSummaryText(analysis),
      answerStatus: analysis.noData ? 'no_data' : 'answered', basis: 'analysis', noData: analysis.noData, conflict: analysis.conflict, engine: analysis.engine,
    });
    const ev = await ctx.repo.insertEvidence(analysis.evidence.map((e) => ({ ...e, keywordScore: e.scores?.keyword, vectorScore: e.scores?.vector, rrfScore: e.scores?.fused })), { messageId: am.message_id });
    s = await ctx.repo.touchSession(sessionId, ctx.config.session.idleMinutes, analysis.situationId);
    return { userMessage: mapMessageRow(userMessage), assistantMessage: mapMessageRow(am, ev.map((e) => ({ ...e, categoryName: categoryByCode(e.category)?.name }))), analysis, session: sessionView(s) };
  }

  const { sit, info, priorEvidence } = await situationContext(ctx, staffId, situationId);
  const activeSituation = info ? { activity: info.activity, activityCategory: info.activityCategory, observedBehavior: info.observedBehavior } : null;

  // 1) 맥락 해석: 새 상황 가능성이 있으면 사용자 선택 전까지 답하지 않는다.
  let classification: { type: string; reason?: string | null } = classifyFollowUp(activeSituation, content);
  const history = (await ctx.repo.listMessages(sessionId)).filter((m) => m.situationId === situationId).slice(-8);

  // 2) 근거: 활성 상황의 기존 근거 재사용 + 같은 대상자 범위의 추가 하이브리드 검색
  const keywords = [...new Set([...extractKeywords(content), ...(info ? info.keywords.slice(0, 4) : [])])];
  const extra = await searchEvidence(ctx, staffId, s.recipient_id, { text: `${content} ${sit?.input_text || ''}`, keywords, limit: 6 });
  const merged: any[] = [];
  const seen = new Set();
  for (const e of [...extra, ...priorEvidence]) {
    const key = `${e.sourceType}:${e.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(e);
  }
  let evidence = merged.slice(0, 8).map((e, i) => ({ ...e, evidenceId: `E${i + 1}` }));

  let ans;
  const engine = ctx.ai ? `openai:${ctx.ai.model}` : 'local-rules';
  if (ctx.ai) {
    try {
      const ai = await ctx.ai.json({
        schema: FOLLOWUP_SCHEMA,
        name: 'follow_up_answer',
        maxTokens: 2000,
        system: `작업: 같은 돌봄 상황에 대한 종사자의 후속 질문에 답합니다.
- classification: 질문이 현재 상황의 후속 질문이면 follow_up, 다른 활동·새로운 관찰을 알리는 내용이면 possible_new_situation, 종사자가 직접 해 본 대응과 결과를 알려 주는 말이면 experience_statement.
- answer는 근거 목록과 현재 상황 맥락만 사용해 3문장 이내로 씁니다. 근거가 없으면 basis를 no_data로 하고 "확인된 기록이 없습니다. 보호자 확인이 필요합니다."라고 답합니다.
- 일반적인 관찰 요령은 basis를 general로 하고 개인 기록처럼 쓰지 않습니다.`,
        user: JSON.stringify({
          현재상황: sit?.input_text || null,
          이전대화: history.map((m) => ({ 역할: m.role === 'user' ? '종사자' : 'AI', 내용: m.content })),
          질문: content,
          사용자선택: decision,
          근거목록: evidence.map((e) => ({ id: e.evidenceId, type: e.sourceType, category: categoryByCode(e.category)?.name, date: e.createdAt?.slice(0, 10), text: e.excerpt })),
        }),
      });
      if (!decision && ai.classification === 'possible_new_situation') classification = { type: 'possible_new_situation', reason: ai.classificationReason };
      else if (ai.classification === 'experience_statement') classification = { type: 'experience_statement' };
      const ids = new Set(evidence.map((e) => e.evidenceId));
      const refs = (ai.evidenceRefs || []).filter((r) => ids.has(r));
      ans = {
        answer: scrubMedical(ai.answer),
        basis: (ai.basis === 'guide_based' || ai.basis === 'record_based') && refs.length === 0 ? 'general' : ai.basis,
        evidenceRefs: refs,
        needsGuardianCheck: ai.needsGuardianCheck || ai.basis === 'no_data',
        suggestRecord: ai.classification === 'experience_statement',
        medical: ai.medicalConcern,
      };
    } catch (error: any) {
      throw new AppError(502, error.code || 'UPSTREAM_ERROR', 'AI 답변에 실패했습니다. 질문은 그대로 있으니 다시 시도해 주세요.');
    }
  }

  if (!decision && classification.type === 'possible_new_situation') {
    return {
      needsUserDecision: {
        type: 'situation_handling',
        options: ['continue_existing', 'start_new'],
        message: '새로운 돌봄 상황으로 보입니다. 지금 상황과 이어서 볼까요, 새 상황으로 나눠서 분석할까요?',
        reason: classification.reason,
        pendingContent: content,
        activeSituationId: situationId,
      },
      session: sessionView(s),
    };
  }
  if (!ans) ans = localAnswer(content, evidence, classification.type);

  const medical = ans.medical || extractSituation(content).medical.flag;
  if (medical) ans.answer = `${MEDICAL_NOTICE}\n${ans.answer}`;
  const usedIds = new Set(ans.evidenceRefs);
  const conflicts = detectConflicts(evidence.filter((e) => usedIds.has(e.evidenceId)));
  if (conflicts.length > 0) ans.answer += '\n※ 참고한 기록끼리 내용이 다릅니다. 출처와 날짜를 확인해 주세요.';
  const used = evidence.filter((e) => usedIds.has(e.evidenceId));

  const userMessage = await ctx.repo.insertMessage({ sessionId, situationId, speaker: 'caregiver', text: content, inputType });
  const am = await ctx.repo.insertMessage({
    sessionId, situationId, speaker: 'assistant', text: ans.answer,
    answerStatus: ans.basis === 'no_data' ? 'no_data' : ans.needsGuardianCheck || conflicts.length ? 'needs_confirmation' : 'answered',
    basis: ans.basis, noData: ans.basis === 'no_data', conflict: conflicts.length > 0, engine,
  });
  const conflictIds = new Set(conflicts.flatMap((c) => c.evidenceRefs));
  const savedEv = await ctx.repo.insertEvidence(used.map((e) => ({ ...e, stance: conflictIds.has(e.evidenceId) ? 'contradicts' : 'supports' })), { messageId: am.message_id });
  s = await ctx.repo.touchSession(sessionId, ctx.config.session.idleMinutes, situationId);
  return {
    userMessage: mapMessageRow(userMessage),
    assistantMessage: {
      ...mapMessageRow(am, savedEv.map((e) => ({ ...e, categoryName: categoryByCode(e.category)?.name, label: sourceLabel(e) }))),
      suggestRecord: Boolean(ans.suggestRecord),
      suggestedRecordText: ans.suggestRecord ? content : null,
    },
    session: sessionView(s),
  };
}
