// 오늘의 돌봄 일지(한눈에 보기): 오늘 종사자가 확인해 저장한 기록에서 수면·식사·복약 칸을 채운다.
// 새 데이터를 만들지 않고, 저장된 기록 글과 관찰 시각만 읽는다. 글에서 찾지 못한 칸은 '기록 필요'로 둔다(짐작해서 채우지 않는다).
// 서버·브라우저 어디서나 쓰도록 외부 의존이 없는 순수 함수다.

export type CellState = 'filled' | 'notable' | 'missing' | 'none';
export interface LogCell { key: string; label: string; value: string; state: CellState }
export interface LogGroup { id: 'sleep' | 'meal' | 'medicine'; title: string; cells: LogCell[]; missing: number }

export interface LogRecord { category: string; content: string; observedAt: string }

const GROUPS: { id: LogGroup['id']; title: string; category: string; slots: { key: string; label: string }[] }[] = [
  { id: 'sleep', title: '수면', category: 'DAILY_ROUTINE_SLEEP', slots: [{ key: 'wake', label: '기상' }, { key: 'bed', label: '취침' }, { key: 'night', label: '밤에 깸' }] },
  { id: 'meal', title: '식사', category: 'MEAL', slots: [{ key: 'breakfast', label: '아침' }, { key: 'lunch', label: '점심' }, { key: 'dinner', label: '저녁' }] },
  { id: 'medicine', title: '복약', category: 'HEALTH_SAFETY_INFO', slots: [{ key: 'morning', label: '아침 약' }, { key: 'bedtime', label: '자기 전 약' }] },
];

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const timeIn = (text: string, iso: string) => text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)?.[0]?.padStart(5, '0') ?? hhmm(iso);

/** 식사 시간대: 글에 아침·점심·저녁이 있으면 그것을, 없으면 기록한 시각으로 나눈다. */
function mealSlot(text: string, iso: string): 'breakfast' | 'lunch' | 'dinner' {
  if (/아침|조식/.test(text)) return 'breakfast';
  if (/점심|중식/.test(text)) return 'lunch';
  if (/저녁|석식/.test(text)) return 'dinner';
  const h = new Date(iso).getHours();
  return h < 10 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner';
}

const mealValue = (t: string): { value: string; state: CellState } => {
  if (/절반|반만|반 정도/.test(t)) return { value: '절반', state: 'notable' };
  if (/조금|거의 안|안 먹|남김|남겼/.test(t)) return { value: '조금 먹음', state: 'notable' };
  if (/다 먹|잘 먹|완식|비웠/.test(t)) return { value: '다 먹음', state: 'filled' };
  return { value: '기록됨', state: 'filled' };
};

/** 같은 칸에 기록이 여러 개면 가장 늦게 관찰한 기록을 쓴다. */
export function buildDailyLog(records: LogRecord[], day: Date = new Date()): { groups: LogGroup[]; other: number } {
  const today = records.filter((r) => new Date(r.observedAt).toDateString() === day.toDateString()).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const filled = new Map<string, LogCell>();
  const put = (key: string, label: string, value: string, state: CellState) => filled.set(key, { key, label, value, state });

  for (const r of today) {
    const t = r.content;
    if (r.category === 'DAILY_ROUTINE_SLEEP') {
      if (/일어났|기상|눈을 떴/.test(t)) put('wake', '기상', timeIn(t, r.observedAt), 'filled');
      if (/잠들|취침|잠에 들|자러/.test(t)) put('bed', '취침', timeIn(t, r.observedAt), 'filled');
      if (/(밤|새벽)에.{0,8}(깼|깨)|깨어/.test(t)) put('night', '밤에 깸', `${t.match(/(\d+)\s*번/)?.[1] ?? '1'}번`, 'notable');
    } else if (r.category === 'MEAL') {
      const slot = mealSlot(t, r.observedAt);
      const label = GROUPS[1].slots.find((s) => s.key === slot)!.label;
      const v = mealValue(t);
      put(slot, label, v.value, v.state);
    } else if (r.category === 'HEALTH_SAFETY_INFO' && /약/.test(t)) {
      const slot = /자기 전|취침 전|밤/.test(t) ? 'bedtime' : 'morning';
      const label = GROUPS[2].slots.find((s) => s.key === slot)!.label;
      put(slot, label, /안 먹|못 먹|거부|뱉/.test(t) ? '먹지 못함' : '먹음', /안 먹|못 먹|거부|뱉/.test(t) ? 'notable' : 'filled');
    }
  }

  const groups = GROUPS.map<LogGroup>((g) => {
    // '밤에 깸'은 없는 날이 보통이라 기록이 없어도 '기록 필요'로 보지 않고, 빠진 칸으로 세지 않는다.
    const cells = g.slots.map<LogCell>((s) => filled.get(s.key) ?? (s.key === 'night'
      ? { key: s.key, label: s.label, value: '기록 없음', state: 'none' }
      : { key: s.key, label: s.label, value: '기록 필요', state: 'missing' }));
    return { id: g.id, title: g.title, cells, missing: cells.filter((c) => c.state === 'missing').length };
  });
  const other = today.filter((r) => !GROUPS.some((g) => g.category === r.category)).length;
  return { groups, other };
}
