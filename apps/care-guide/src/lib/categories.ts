// 9개 고정 돌봄 가이드 카테고리 (명칭·순서는 기획 기준 그대로. 마이그레이션 시드와 동일해야 한다)
export const CATEGORIES = [
  { code: 'COMMUNICATION', name: '의사소통', easyLabel: '말과 표현', group: 'RED', order: 1 },
  { code: 'ANXIETY_CHALLENGING_BEHAVIOR', name: '불안·도전행동', easyLabel: '힘들어할 때', group: 'RED', order: 2 },
  { code: 'PAIN_DISCOMFORT_SIGN', name: '아픔·불편 신호', easyLabel: '아프거나 불편할 때', group: 'RED', order: 3 },
  { code: 'HEALTH_SAFETY_INFO', name: '건강 안전 정보', easyLabel: '건강·안전', group: 'RED', order: 4 },
  { code: 'MEAL', name: '식사', easyLabel: '밥 먹기', group: 'ORANGE', order: 5 },
  { code: 'HYGIENE_TOILETING_DRESSING', name: '위생·화장실·옷 입기', easyLabel: '씻기·화장실·옷', group: 'ORANGE', order: 6 },
  { code: 'DAILY_ROUTINE_SLEEP', name: '하루 일과·수면', easyLabel: '하루 순서·잠', group: 'ORANGE', order: 7 },
  { code: 'LIKES_DISLIKES', name: '좋아하는 것·싫어하는 것', easyLabel: '좋아하고 싫어하는 것', group: 'GREEN', order: 8 },
  { code: 'OWN_WISH', name: '본인의 의사', easyLabel: '스스로 정하고 싶은 것', group: 'GREEN', order: 9 },
];

export const CATEGORY_CODES = CATEGORIES.map((c) => c.code);
const byCode = new Map(CATEGORIES.map((c) => [c.code, c]));
const byName = new Map(CATEGORIES.map((c) => [c.name, c]));

export type Category = (typeof CATEGORIES)[number];

/** 9개 외 코드는 undefined (호출부에서 ?. 로 처리) */
export function categoryByCode(code: string | null | undefined): Category {
  return byCode.get(code as string) as Category;
}

/** 코드 또는 정확한 한국어 명칭을 코드로 변환. 9개 외 값은 null. */
export function toCategoryCode(value: unknown): string | null {
  if (!value) return null;
  if (typeof value !== 'string') return null;
  if (byCode.has(value)) return value;
  return byName.get(value)?.code || null;
}

export const GROUP_LABELS = {
  RED: { label: '꼭 확인', title: '빨강 · 꼭 알아야 할 정보' },
  ORANGE: { label: '일상 돌봄', title: '주황 · 일상 돌봄' },
  GREEN: { label: '관계·선호', title: '초록 · 관계 맺기' },
};

// 빠른 기록 버튼 → 활동 힌트와 기본 카테고리
export const QUICK_RECORD_HINTS: Record<string, string> = {
  식사: 'MEAL',
  수면: 'DAILY_ROUTINE_SLEEP',
  화장실: 'HYGIENE_TOILETING_DRESSING',
  '불안 발생': 'ANXIETY_CHALLENGING_BEHAVIOR',
};
