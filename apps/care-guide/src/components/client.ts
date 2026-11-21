// 브라우저용 공통 유틸: API 호출, 날짜 표기, 근거 라벨
export class ApiError extends Error {
  code?: string;
  status?: number;
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: options.body !== undefined ? { 'content-type': 'application/json' } : {},
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  let data: any = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const err = new ApiError(data?.error?.message || `요청 실패 (${res.status})`);
    err.code = data?.error?.code;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '날짜 미상');
export const fmtShort = (iso?: string | null) => {
  if (!iso) return '날짜 미상';
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
export const isToday = (iso?: string | null) => Boolean(iso) && new Date(iso as string).toDateString() === new Date().toDateString();
export const plainName = (name: string) => name.replace(/\s*\(가상\)\s*/, '');
export const longDate = (d: Date = new Date()) => d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

/** 홈의 기본 정보 한 줄: 있는 값만 이어서 보여 준다(예: 24세 남 · 172cm · 65kg). 값이 없으면 합성 데이터라는 표시만 남긴다. */
export function basicFacts(info: any): string {
  const age = info?.age ? `${info.age}세${info.sex ? ` ${info.sex}` : ''}` : '';
  const parts = [age, info?.heightCm ? `${info.heightCm}cm` : '', info?.weightKg ? `${info.weightKg}kg` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : '합성 시연 데이터';
}

const firstSentence = (text: string): string => {
  const m = String(text).match(/^(.+?[.!?。])(\s|$)/);
  return (m ? m[1] : String(text)).trim();
};

/** 홈의 한 줄 요약: 설명서의 조심할 것(불안·힘든 상황) → 의사소통 첫 문장을 이어서 보여 준다. 공유된 내용이 없으면 빈 문자열. */
export function buildHeadline(cats: any[]): string {
  const byCode = new Map(cats.map((c) => [c.code, c]));
  return ['ANXIETY_CHALLENGING_BEHAVIOR', 'COMMUNICATION']
    .map((code) => byCode.get(code))
    .filter((c) => c?.status === 'available' && c.content)
    .map((c) => firstSentence(c.content))
    .join(' ');
}

export const CAT_ICON: Record<string, string> = {
  COMMUNICATION: '💬', ANXIETY_CHALLENGING_BEHAVIOR: '♡', PAIN_DISCOMFORT_SIGN: '⚠', HEALTH_SAFETY_INFO: '✚', MEAL: '🍚',
  HYGIENE_TOILETING_DRESSING: '🧼', DAILY_ROUTINE_SLEEP: '🌙', LIKES_DISLIKES: '★', OWN_WISH: '✋',
};
export const CAT_TONE: Record<string, string> = { MEAL: 'mint', HYGIENE_TOILETING_DRESSING: 'butter', LIKES_DISLIKES: 'mint' };

export const BASIS: Record<string, [string, string]> = {
  guide_based: ['mint', '설명서 근거'],
  record_based: ['', '종사자 기록 근거'],
  general: ['line', '일반 안내 · 개인 근거 없음'],
  no_data: ['butter', '기록 없음'],
  general_safety: ['peach', '안전 안내'],
  analysis: ['line', '상황 분석'],
};
