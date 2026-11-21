// 서비스 공통: 입력 검증, 근거 검색, 안전 문구
import { AppError } from '../repo';
import { categoryByCode } from '../categories';

export const MAX_TEXT = 1000;

export function requireText(value, field, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `${label}을(를) 입력해 주세요.`, [{ field, reason: '필수 값입니다.' }]);
  }
  if (value.length > MAX_TEXT) {
    throw new AppError(400, 'VALIDATION_ERROR', `${label}은(는) ${MAX_TEXT}자 이하로 입력해 주세요.`, [{ field, reason: `최대 ${MAX_TEXT}자` }]);
  }
  return value.trim();
}

export function parseInputType(value, allowed = ['text', 'voice_transcribed']) {
  const v = value ?? 'text';
  if (!allowed.includes(v)) throw new AppError(400, 'VALIDATION_ERROR', '입력 방식이 올바르지 않습니다.', [{ field: 'inputType', reason: `${allowed.join(', ')} 중 하나` }]);
  return v;
}

export function parseTime(value, field) {
  if (value === undefined || value === null || value === '') return new Date().toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError(400, 'VALIDATION_ERROR', '시각 형식이 올바르지 않습니다.', [{ field, reason: 'RFC 3339 형식' }]);
  if (d.getTime() > Date.now() + 10 * 60 * 1000) throw new AppError(400, 'VALIDATION_ERROR', '미래 시각은 입력할 수 없습니다.', [{ field, reason: '미래 시각' }]);
  return d.toISOString();
}

/** 대상자 범위로 제한된 하이브리드 검색 */
export async function searchEvidence(ctx, staffId: string, recipientId: string, { text, keywords, limit }: { text: string; keywords: string[]; limit?: number }) {
  const [embedding] = await ctx.embedder.embed([text], 'query');
  return ctx.repo.hybridSearch(staffId, recipientId, {
    keywords,
    embedding,
    embeddingModel: ctx.embedder.model,
    limit: limit ?? ctx.config.search.limit,
    rrfK: ctx.config.search.rrfK,
    minVectorScore: ctx.config.search.minVectorScore,
  });
}

export function sourceLabel(e) {
  const date = e.createdAt ? e.createdAt.slice(0, 10) : '날짜 미상';
  const type = e.sourceType === 'official_care_guide' ? '공식 가이드(보호자 확인)' : `종사자 확인 기록${e.authorLabel ? ` · ${e.authorLabel}` : ''}`;
  const cat = categoryByCode(e.category)?.name;
  return `${type} · ${cat || ''} · ${date}`;
}

export const MEDICAL_NOTICE = '의료적 판단이 필요할 수 있는 상황입니다. 돌봄 바통은 진단·치료·처방을 하지 않습니다. 보호자 또는 의료진에게 바로 확인하고, 위급해 보이면 기관의 응급 절차를 따르세요.';

const MEDICAL_ADVICE_RE = /(진단(합니다|됩니다|일\s*수)|처방|복용량|\d+\s*mg|투약하세요|약을\s*(더\s*)?(먹이|주)세요)/;

/** AI 문장에 의료 지시가 섞이면 안전 문구로 대체 */
export function scrubMedical(text) {
  return MEDICAL_ADVICE_RE.test(text) ? MEDICAL_NOTICE : text;
}
