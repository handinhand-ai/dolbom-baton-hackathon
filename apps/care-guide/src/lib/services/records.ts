// WF-03 신규 돌봄 경험 구조화·검토·저장 + 공식 가이드 반영 요청(별도 승인 흐름)
import { AppError } from '../repo';
import { CATEGORY_CODES, QUICK_RECORD_HINTS, categoryByCode, toCategoryCode } from '../categories';
import { structureExperience, extractKeywords } from '../text/local-engine';
import { DRAFT_SCHEMA } from '../ai/openai';
import { requireText, parseInputType, parseTime, searchEvidence, sourceLabel } from './common';

const INPUT_TYPES = ['text', 'voice_transcribed', 'quick_button'];

function draftView(d, extra = {}) {
  return {
    draftId: d.draft_id,
    status: d.status,
    recipientId: d.recipient_id,
    situationId: d.situation_id,
    rawInput: { text: d.raw_text, inputType: d.input_type, activityHint: d.activity_hint },
    observedAt: new Date(d.observed_at).toISOString(),
    proposal: d.proposal,
    edited: d.edited,
    reviewed: d.reviewed,
    savedRecordId: d.saved_record_id,
    engine: d.engine,
    version: d.version,
    createdAt: new Date(d.created_at).toISOString(),
    updatedAt: new Date(d.updated_at).toISOString(),
    ...extra,
  };
}

function cleanList(v, field) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new AppError(400, 'VALIDATION_ERROR', '목록 형식이 올바르지 않습니다.', [{ field, reason: '문자열 배열' }]);
  }
  return v.map((x) => x.trim()).filter(Boolean).slice(0, 10);
}

function sanitizeProposal(p) {
  const category = toCategoryCode(p.category);
  const related = [...new Set((p.relatedCategories || []).map(toCategoryCode).filter((c) => c && c !== category))].slice(0, 3);
  const confidence = p.confidenceLevel || 'none';
  return {
    content: String(p.content || '').trim(),
    observation: (p.observation || []).filter(Boolean),
    response: (p.response || []).filter(Boolean),
    result: p.result || null,
    context: p.context || { time: p.timeMentioned || null },
    emotionOrExpression: p.emotionOrExpression || null,
    category,
    relatedCategories: related,
    classificationReason: p.classificationReason || '',
    confidenceLevel: confidence,
    // 낮은 신뢰도·모호한 분류는 자동 확정하지 않고 종사자가 선택한다.
    needsCategorySelection: !category || ['low', 'none'].includes(confidence) || Boolean(p.needsCategorySelection),
    missingInformation: p.missingInformation || [],
    humanConfirmationRequired: true,
  };
}

export async function createDraft(ctx, staffId, body) {
  const rawText = requireText(body.rawText, 'rawText', '돌봄 경험');
  const inputType = parseInputType(body.inputType, INPUT_TYPES);
  if (inputType === 'voice_transcribed' && body.transcriptConfirmed !== true) {
    throw new AppError(400, 'VALIDATION_ERROR', '음성 인식 결과를 확인·수정한 뒤 정리를 요청해 주세요.', [{ field: 'transcriptConfirmed', reason: '확인 필요' }]);
  }
  const observedAt = parseTime(body.observedAt, 'observedAt');
  const recipient = await ctx.repo.getRecipient(staffId, body.recipientId);
  const activityHint = body.activityHint && QUICK_RECORD_HINTS[body.activityHint] ? body.activityHint : null;
  const hintCategory = activityHint ? QUICK_RECORD_HINTS[activityHint] : null;

  let proposal;
  let engine = 'local-rules';
  if (ctx.ai) {
    engine = `openai:${ctx.ai.model}`;
    try {
      const ai = await ctx.ai.json({
        schema: DRAFT_SCHEMA,
        name: 'care_record_draft',
        maxTokens: 2000,
        system: `작업: 종사자가 말한 새로운 돌봄 경험을 기록 후보로 정리합니다.
- content: 원래 의미와 관찰 사실을 유지한 1~2문장. 원문에 없는 원인·감정·평가를 더하지 않습니다.
- observation(관찰), response(실제로 한 대응), result(실제로 관찰된 결과, 없으면 null)는 원문 표현을 짧게 옮깁니다.
- category는 9개 코드 중 주 항목 하나, relatedCategories는 함께 관련된 항목(없으면 빈 배열).
- 분류가 모호하면 confidenceLevel을 low 또는 none으로 씁니다.
- missingInformation에는 기록에 빠진 정보(예: 대응 후 결과)를 씁니다.
카테고리 코드: ${CATEGORY_CODES.map((c) => `${c}=${categoryByCode(c).name}`).join(', ')}`,
        user: JSON.stringify({ 원문: rawText, 빠른기록활동: activityHint, 기본항목: hintCategory }),
      });
      proposal = sanitizeProposal(ai);
    } catch (error: any) {
      throw new AppError(502, error.code || 'UPSTREAM_ERROR', 'AI 기록 정리에 실패했습니다. 입력 내용은 그대로 있으니 다시 시도해 주세요.');
    }
  } else {
    proposal = sanitizeProposal(structureExperience(rawText, hintCategory));
  }
  if (!proposal.content) proposal.content = rawText;

  const draft = await ctx.repo.insertDraft({
    recipientId: recipient.recipientId, staffId, situationId: body.situationId || null, rawText, inputType, activityHint, observedAt, proposal, engine,
  });

  // 중복 가능성: 유사 기록을 보여 주되 중복으로 확정하지 않는다.
  let similarRecords: any[] = [];
  try {
    const found = await searchEvidence(ctx, staffId, recipient.recipientId, { text: proposal.content, keywords: extractKeywords(rawText), limit: 5 });
    similarRecords = found
      .filter((e) => e.sourceType === 'care_record' && (e.vectorScore ?? 0) >= 0.85)
      .map((e) => ({ recordId: e.sourceId, content: e.excerpt, createdAt: e.createdAt, label: sourceLabel(e) }));
  } catch { /* 유사 기록 확인 실패는 초안 생성을 막지 않는다 */ }
  return draftView(draft, { similarRecords });
}

function parseEdits(body, draft) {
  const content = requireText(body.content ?? draft.proposal.content, 'content', '기록 내용');
  const categoryRaw = body.category ?? draft.proposal.category;
  const category = categoryRaw ? toCategoryCode(categoryRaw) : null;
  if (categoryRaw && !category) throw new AppError(400, 'VALIDATION_ERROR', '9개 돌봄 항목 중에서 선택해 주세요.', [{ field: 'category', reason: '허용되지 않은 항목' }]);
  const relatedRaw = body.relatedCategories ?? draft.proposal.relatedCategories ?? [];
  const related = cleanList(relatedRaw, 'relatedCategories').map((c) => {
    const code = toCategoryCode(c);
    if (!code) throw new AppError(400, 'VALIDATION_ERROR', '관련 항목이 올바르지 않습니다.', [{ field: 'relatedCategories', reason: c }]);
    return code;
  }).filter((c) => c !== category);
  return {
    content,
    category,
    relatedCategories: [...new Set(related)],
    observation: cleanList(body.observation ?? draft.proposal.observation, 'observation'),
    response: cleanList(body.response ?? draft.proposal.response, 'response'),
    result: (body.result ?? draft.proposal.result) || null,
    context: draft.proposal.context || null,
    changedFromProposal: content !== draft.proposal.content || category !== draft.proposal.category,
  };
}

function assertRecipient(body, draft) {
  if (body.recipientId && body.recipientId !== draft.recipient_id) {
    throw new AppError(409, 'RECIPIENT_MISMATCH', '선택한 대상자와 기록 후보의 대상자가 다릅니다. 저장을 중단했습니다. 대상자를 다시 확인해 주세요.');
  }
}

export async function patchDraft(ctx, staffId, draftId, body) {
  const draft = await ctx.repo.getDraft(staffId, draftId);
  assertRecipient(body, draft);
  if (draft.status === 'saved') throw new AppError(409, 'CONFLICT', '이미 저장된 기록입니다.');
  if (draft.status === 'discarded') throw new AppError(409, 'CONFLICT', '취소된 기록 후보입니다.');
  const edited = parseEdits(body, draft);
  const reviewed = body.reviewed === true;
  if (reviewed && !edited.category) {
    throw new AppError(400, 'CATEGORY_REQUIRED', '돌봄 항목을 선택해야 확인할 수 있습니다.', [{ field: 'category', reason: '필수' }]);
  }
  const updated = await ctx.repo.updateDraft(draftId, { edited, reviewed, expectedVersion: body.version });
  if (!updated) throw new AppError(409, 'VERSION_CONFLICT', '다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 확인해 주세요.');
  return draftView(updated);
}

export async function discardDraft(ctx, staffId, draftId) {
  const draft = await ctx.repo.getDraft(staffId, draftId);
  if (draft.status === 'saved') throw new AppError(409, 'CONFLICT', '이미 저장된 기록은 취소할 수 없습니다.');
  await ctx.repo.discardDraft(draftId);
  return { draftId, status: 'discarded' };
}

export async function saveDraft(ctx, staffId, draftId, body: any = {}) {
  const draft = await ctx.repo.getDraft(staffId, draftId);
  assertRecipient(body, draft);
  if (draft.status === 'saved') {
    return { recordId: draft.saved_record_id, draftId, alreadySaved: true };
  }
  if (!draft.reviewed || !draft.edited || draft.status !== 'reviewed') {
    throw new AppError(409, 'REVIEW_REQUIRED', '종사자 확인 전에는 저장할 수 없습니다. 내용을 확인한 뒤 "확인"을 눌러 주세요.');
  }
  const staff = await ctx.repo.getStaff(staffId);
  const final = { ...draft.edited, assignedBy: draft.edited.changedFromProposal ? 'staff' : 'ai_suggested_staff_confirmed' };
  let embedding: number[] | null = null;
  try {
    [embedding] = await ctx.embedder.embed([final.content], 'document');
  } catch {
    embedding = null; // 임베딩 실패 시 키워드 검색만 가능한 상태로 저장
  }
  const saved = await ctx.repo.saveDraftAsRecord(draft, final, { staffId, label: staff?.display_name || staffId }, embedding, embedding ? ctx.embedder.model : null);

  let guideUpdateRequest: any = null;
  if (body.requestGuideUpdate === true && !saved.alreadySaved) {
    // 기본 제안은 "기존 공식 내용 + 새 기록"이다. 보호자가 승인 화면에서 문장을 고칠 수 있다.
    const current = await ctx.repo.getGuideContent(draft.recipient_id, final.category);
    const custom = typeof body.guideProposal === 'string' && body.guideProposal.trim() ? body.guideProposal.trim() : null;
    guideUpdateRequest = await ctx.repo.createGuideRequest({
      recordId: saved.recordId, recipientId: draft.recipient_id, categoryCode: final.category,
      proposedContent: custom || (current ? `${current}\n(추가 제안) ${final.content}` : final.content),
    });
  }
  return {
    recordId: saved.recordId,
    draftId,
    recipientId: draft.recipient_id,
    category: final.category,
    categoryName: categoryByCode(final.category)?.name,
    relatedCategories: final.relatedCategories,
    content: final.content,
    reviewStatus: 'staff_confirmed',
    author: { staffId, label: staff?.display_name || staffId, role: 'caregiver' },
    createdAt: saved.confirmedAt,
    provenance: { rawInputPreserved: true, aiAssisted: true, searchable: Boolean(embedding) ? 'keyword+vector' : 'keyword' },
    officialGuideChanged: false,
    guideUpdateRequest,
    alreadySaved: saved.alreadySaved,
  };
}

// ---- 공식 가이드 반영 (보호자 검토 데모 화면용) ---------------------------
export async function listGuideRequests(ctx, recipientId) {
  return { items: await ctx.repo.listGuideRequests(recipientId) };
}

export async function decideGuideRequest(ctx, requestId, body) {
  const decision = body.decision;
  if (!['approved', 'rejected', 'on_hold'].includes(decision)) {
    throw new AppError(400, 'VALIDATION_ERROR', '결정 값이 올바르지 않습니다.', [{ field: 'decision', reason: 'approved, rejected, on_hold 중 하나' }]);
  }
  const content = typeof body.content === 'string' && body.content.trim() ? body.content.trim() : null;
  const r = await ctx.repo.decideGuideRequest(requestId, { decision, note: body.note, content });
  if (!r) throw new AppError(409, 'CONFLICT', '이미 처리된 요청이거나 찾을 수 없습니다.');
  return r;
}

export async function applyGuideRequest(ctx, requestId) {
  const q = await ctx.repo.getGuideRequest(requestId);
  if (!q) throw new AppError(404, 'NOT_FOUND', '요청을 찾을 수 없습니다.');
  if (q.status !== 'approved') throw new AppError(409, 'NOT_APPROVED', '보호자 승인 후에만 공식 가이드에 반영할 수 있습니다.');
  try {
    let embedding: number[] | null = null;
    try { [embedding] = await ctx.embedder.embed([q.proposed_content], 'document'); } catch { embedding = null; }
    const r = await ctx.repo.applyGuideRequest(requestId, embedding, embedding ? ctx.embedder.model : null);
    if (!r) throw new AppError(409, 'NOT_APPROVED', '보호자 승인 후에만 반영할 수 있습니다.');
    return r;
  } catch (error) {
    if (error instanceof AppError) throw error;
    await ctx.repo.markApplyError(requestId, '반영 중 오류가 발생했습니다.');
    throw new AppError(500, 'APPLY_FAILED', '공식 가이드 반영에 실패했습니다. 승인 상태와 기록은 그대로 있으니 다시 시도해 주세요.');
  }
}
