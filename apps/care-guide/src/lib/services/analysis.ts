// WF-01 돌봄 상황 분석 및 근거 기반 대응 가이드
import { AppError } from '../repo';
import { categoryByCode } from '../categories';
import { extractSituation, detectConflicts } from '../text/local-engine';
import { ANALYSIS_SCHEMA } from '../ai/openai';
import { requireText, parseInputType, parseTime, searchEvidence, sourceLabel, MEDICAL_NOTICE, scrubMedical } from './common';

function relevantTo(info, e) {
  const cats = new Set(Object.keys(info.categoryScores));
  if (info.activityCategory) cats.add(info.activityCategory);
  return cats.has(e.category) || (e.relatedCategories || []).some((c) => cats.has(c));
}

function localAnalysis(info, evidence) {
  const relevant = evidence.filter((e) => relevantTo(info, e));
  const conflicts = detectConflicts(evidence);
  const conflictIds = new Set(conflicts.flatMap((c) => c.evidenceRefs));

  let status = relevant.length > 0 ? 'evidence_found' : 'no_comparable_records';
  if (conflicts.length > 0) status = 'conflicting_evidence';
  const usualItems = relevant.slice(0, 3).map((e) => ({ text: e.excerpt, evidenceRefs: [e.evidenceId] }));
  const summary = {
    evidence_found: `이 상황과 관련된 평소 정보 ${relevant.length}건을 현재 관찰과 함께 보여 드립니다. 차이가 있는지는 원문을 보고 판단해 주세요.`,
    no_comparable_records: '비교할 기록 없음 — 이 상황과 비교할 수 있는 평소 기록이 없어 평소와 다르다고 판단하지 않습니다.',
    conflicting_evidence: '기록끼리 내용이 서로 다릅니다. 아래 상충 기록의 출처와 날짜를 확인해 주세요.',
  }[status];

  // 규칙 기반 모드는 문장을 새로 만들지 않고, 이 상황과 관련된 근거 원문을 단계로 보여 준다.
  const guidance: any[] = [];
  const ordered = [...relevant].sort((a, b) => (a.sourceType === b.sourceType ? 0 : a.sourceType === 'official_care_guide' ? -1 : 1));
  for (const e of ordered.slice(0, 4)) {
    const isGuide = e.sourceType === 'official_care_guide';
    const conflicted = conflictIds.has(e.evidenceId);
    guidance.push({
      text: `${conflicted ? '⚠ 다른 기록과 내용이 다름 · ' : ''}${isGuide ? '공식 가이드 확인' : '과거 기록 확인'}: ${e.excerpt}`,
      basis: isGuide ? 'guide_based' : 'record_based',
      evidenceRefs: [e.evidenceId],
      conflict: conflicted,
    });
  }
  if (conflicts.length > 0) {
    guidance.push({ text: '기록끼리 내용이 달라 한 가지 방법으로 단정하지 않습니다. 상충 기록의 날짜를 확인하고 필요하면 보호자에게 물어봐 주세요.', basis: 'general', evidenceRefs: [...new Set(conflicts.flatMap((c) => c.evidenceRefs))] });
  }
  if (relevant.length === 0) {
    guidance.push({ text: '이 상황과 관련해 확인된 기록이 없습니다. 이 대상자에게 맞는 대응 방법은 보호자에게 확인해 주세요.', basis: 'no_data', evidenceRefs: [] });
  }
  guidance.push({ text: '지금 보이는 행동이 계속되는지, 언제 시작됐는지 관찰해 주세요.', basis: 'general', evidenceRefs: [] });
  return {
    situation: {
      summary: info.summary,
      activity: info.activity,
      observedBehavior: info.observedBehavior,
      details: info.details,
      usualBehaviorMentioned: info.usualBehaviorMentioned,
      timeMentioned: info.timeMentioned,
    },
    clarification: info.clarification,
    comparison: { status, summary, usualItems },
    guidance,
    conflicts,
    medicalConcern: { flag: info.medical.flag, reason: info.medical.matched ? `입력에 '${info.medical.matched}' 표현이 있습니다.` : null },
  };
}

function evidenceForPrompt(evidence) {
  return evidence.map((e) => ({
    id: e.evidenceId,
    type: e.sourceType,
    category: categoryByCode(e.category)?.name,
    date: e.createdAt?.slice(0, 10) || null,
    text: e.excerpt,
  }));
}

/** AI 결과를 근거 목록과 대조해 검증·보정한다. */
export function validateAiAnalysis(ai, evidence, info) {
  const ids = new Set(evidence.map((e) => e.evidenceId));
  const keep = (refs) => (refs || []).filter((r) => ids.has(r));
  const guidance = (ai.guidance || []).map((g) => {
    const refs = keep(g.evidenceRefs);
    const basis = (g.basis === 'guide_based' || g.basis === 'record_based') && refs.length === 0 ? 'general' : g.basis;
    return { text: scrubMedical(String(g.text || '').trim()), basis, evidenceRefs: refs };
  }).filter((g) => g.text);
  const aiConflicts = (ai.conflicts || []).map((c) => ({ evidenceRefs: keep(c.evidenceRefs), description: c.description })).filter((c) => c.evidenceRefs.length >= 2);
  const localConflicts = detectConflicts(evidence);
  const seen = new Set(aiConflicts.map((c) => [...c.evidenceRefs].sort().join('|')));
  const conflicts = [...aiConflicts, ...localConflicts.filter((c) => !seen.has([...c.evidenceRefs].sort().join('|')))];

  const usualItems = (ai.comparison?.usualItems || []).map((u) => ({ text: u.text, evidenceRefs: keep(u.evidenceRefs) })).filter((u) => u.evidenceRefs.length > 0);
  let status = ai.comparison?.status || 'no_comparable_records';
  let summary = ai.comparison?.summary || '';
  if (evidence.length === 0 || (status === 'evidence_found' && usualItems.length === 0)) {
    status = 'no_comparable_records';
    summary = '비교할 기록 없음 — 이 상황과 비교할 수 있는 평소 기록이 없어 평소와 다르다고 판단하지 않습니다.';
  }
  if (conflicts.length > 0) status = 'conflicting_evidence';
  if (evidence.length === 0 && !guidance.some((g) => g.basis === 'no_data')) {
    guidance.push({ text: '확인된 기록이 없습니다. 이 대상자에게 맞는 대응 방법은 보호자에게 확인해 주세요.', basis: 'no_data', evidenceRefs: [] });
  }
  return {
    situation: { ...ai.situation, observedBehavior: ai.situation?.observedBehavior || [], details: ai.situation?.details || [] },
    clarification: ai.clarification || { needed: false, question: null },
    comparison: { status, summary, usualItems },
    guidance,
    conflicts,
    medicalConcern: { flag: Boolean(ai.medicalConcern?.flag || info.medical.flag), reason: ai.medicalConcern?.reason || (info.medical.matched ? `입력에 '${info.medical.matched}' 표현이 있습니다.` : null) },
  };
}

export async function runAnalysis(ctx, staffId, body, { sessionId = null, situationId = null } = {}) {
  const situationText = requireText(body.situation, 'situation', '현재 상황');
  const inputType = parseInputType(body.inputType);
  if (inputType === 'voice_transcribed' && body.transcriptConfirmed !== true) {
    throw new AppError(400, 'VALIDATION_ERROR', '음성 인식 결과를 확인·수정한 뒤 분석을 요청해 주세요.', [{ field: 'transcriptConfirmed', reason: '음성 입력은 확인이 필요합니다.' }]);
  }
  const observedAt = parseTime(body.observedAt, 'observedAt');
  const recipient = await ctx.repo.getRecipient(staffId, body.recipientId); // 권한 없으면 여기서 중단

  const info = extractSituation(situationText);
  const sitId = situationId || await ctx.repo.createSituation({ sessionId, recipientId: recipient.recipientId, inputText: situationText, activity: info.activity });
  const { analysisId, createdAt } = await ctx.repo.createAnalysis({
    recipientId: recipient.recipientId, situationId: sitId, staffId, inputText: situationText, inputType, observedAt,
  });
  const engine = ctx.ai ? `openai:${ctx.ai.model}` : 'local-rules';

  let evidence;
  let result;
  try {
    const found = await searchEvidence(ctx, staffId, recipient.recipientId, { text: situationText, keywords: info.keywords });
    // 프롬프트·화면에서 쓸 임시 ID를 붙이고, 저장 후 실제 ID로 바꾼다.
    evidence = found.map((e, i) => ({ ...e, evidenceId: `E${i + 1}` }));
    if (ctx.ai) {
      const ai = await ctx.ai.json({
        schema: ANALYSIS_SCHEMA,
        name: 'care_analysis',
        system: `작업: 종사자가 입력한 현재 상황을 구조화하고, 근거 목록과 비교한 뒤, 단계별 대응 가이드를 만듭니다.
- situation.observedBehavior/details는 입력에 실제로 적힌 행동만 짧은 명사구로 씁니다.
- situation.usualBehaviorMentioned는 입력에 "평소" 기준이 명시된 경우 그 표현만, 없으면 null.
- comparison.usualItems는 근거 목록에서 이 상황과 비교할 수 있는 평소 정보만 근거 ID와 함께 씁니다.
- guidance는 중요한 순서대로 2~5단계, 각 문장은 한 가지 행동만 담습니다.
- 입력이 모호하면 clarification.needed=true와 짧은 확인 질문을 씁니다.`,
        user: JSON.stringify({ 현재입력: situationText, 대상자표시이름: recipient.displayName, 근거목록: evidenceForPrompt(evidence) }),
      });
      result = validateAiAnalysis(ai, evidence, info);
    } else {
      result = localAnalysis(info, evidence);
    }
  } catch (error: any) {
    await ctx.repo.failAnalysis(analysisId, error.code || 'ANALYSIS_FAILED', engine);
    if (error instanceof AppError) throw error;
    throw new AppError(502, error.code || 'UPSTREAM_ERROR', 'AI 분석에 실패했습니다. 입력 내용은 그대로 있으니 다시 시도해 주세요.', [{ field: 'analysisId', reason: analysisId }]);
  }

  // 상충 근거 표시 후 저장, 임시 ID → 실제 ID
  const conflictIds = new Set(result.conflicts.flatMap((c) => c.evidenceRefs));
  const saved = await ctx.repo.insertEvidence(
    evidence.map((e) => ({ ...e, stance: conflictIds.has(e.evidenceId) ? 'contradicts' : 'supports' })),
    { analysisId },
  );
  const idMap = new Map(evidence.map((e, i) => [e.evidenceId, saved[i].evidenceId]));
  const remap = (refs) => refs.map((r) => idMap.get(r)).filter(Boolean);
  result.guidance = result.guidance.map((g, i) => ({ step: i + 1, ...g, evidenceRefs: remap(g.evidenceRefs) }));
  result.comparison.usualItems = result.comparison.usualItems.map((u) => ({ ...u, evidenceRefs: remap(u.evidenceRefs) }));
  result.conflicts = result.conflicts.map((c) => ({ ...c, evidenceRefs: remap(c.evidenceRefs) }));

  if (result.medicalConcern.flag) {
    result.guidance = [{ step: 0, text: MEDICAL_NOTICE, basis: 'general_safety', evidenceRefs: [] }, ...result.guidance];
  }
  // 개인별 근거가 붙은 안내가 하나도 없으면 '근거 없음'으로 본다.
  const noData = !result.guidance.some((g) => (g.basis === 'guide_based' || g.basis === 'record_based') && g.evidenceRefs.length > 0);
  const conflict = result.conflicts.length > 0;
  const status = result.clarification?.needed || noData || conflict || result.medicalConcern.flag ? 'needs_confirmation' : 'completed';
  const safety = {
    medicalAdvice: false,
    medicalConcern: result.medicalConcern.flag,
    medicalReason: result.medicalConcern.reason,
    needsHumanReview: status === 'needs_confirmation',
  };
  await ctx.repo.completeAnalysis(analysisId, {
    status, situation: result.situation, comparison: { ...result.comparison, conflicts: result.conflicts }, guidance: result.guidance,
    safety, clarification: result.clarification, noData, conflict, engine,
  });
  return getAnalysisView(ctx, staffId, analysisId);
}

export async function getAnalysisView(ctx, staffId, analysisId) {
  const { row, evidence } = await ctx.repo.getAnalysis(staffId, analysisId);
  const comparison = row.comparison || null;
  return {
    analysisId: row.analysis_id,
    status: row.status === 'completed' ? 'succeeded' : row.status,
    recordStatus: row.status,
    recipientId: row.recipient_id,
    situationId: row.situation_id,
    input: { text: row.input_text, inputType: row.input_type, observedAt: row.observed_at ? new Date(row.observed_at).toISOString() : null },
    situation: row.structured_input,
    clarification: row.clarification,
    comparison: comparison && { status: comparison.status, summary: comparison.summary, usualItems: comparison.usualItems },
    conflicts: comparison?.conflicts || [],
    guidance: row.guidance || [],
    evidence: evidence.map((e) => ({ ...e, label: sourceLabel({ ...e, authorLabel: null }) })),
    safety: row.safety,
    noData: row.no_data_flag,
    conflict: row.conflict_flag,
    engine: row.engine,
    errorCode: row.error_code,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}
