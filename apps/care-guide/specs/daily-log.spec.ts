import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDailyLog, type LogRecord } from '../src/lib/daily-log';

// 모든 값은 합성 시연 데이터다. 시각은 지역 시간 기준으로 만들어 비교한다.
const DAY = new Date(2026, 10, 21, 18, 0, 0);
const at = (h: number, m = 0, day = 21) => new Date(2026, 10, day, h, m, 0).toISOString();
const rec = (category: string, content: string, observedAt: string): LogRecord => ({ category, content, observedAt });
const cell = (log: ReturnType<typeof buildDailyLog>, group: string, key: string) => log.groups.find((g) => g.id === group)!.cells.find((c) => c.key === key)!;

test('기록이 없으면 모든 칸이 기록 필요이고 밤에 깸만 기록 없음이다', () => {
  const log = buildDailyLog([], DAY);
  assert.deepEqual(log.groups.map((g) => g.id), ['sleep', 'meal', 'medicine']);
  assert.equal(cell(log, 'sleep', 'night').state, 'none');
  assert.equal(log.groups[0].missing, 2);
  assert.equal(log.groups[1].missing, 3);
  assert.equal(log.groups[2].missing, 2);
  assert.equal(log.other, 0);
});

test('식사 기록은 글의 시간대(없으면 기록 시각)로 칸을 채우고 절반은 눈에 띄게 표시한다', () => {
  const log = buildDailyLog([
    rec('MEAL', '아침은 다 먹음', at(8)),
    rec('MEAL', '점심은 절반만 먹었어요', at(12, 30)),
    rec('MEAL', '잘 먹었어요', at(18, 10)),
  ], DAY);
  assert.deepEqual([cell(log, 'meal', 'breakfast').value, cell(log, 'meal', 'breakfast').state], ['다 먹음', 'filled']);
  assert.deepEqual([cell(log, 'meal', 'lunch').value, cell(log, 'meal', 'lunch').state], ['절반', 'notable']);
  assert.equal(cell(log, 'meal', 'dinner').value, '다 먹음');
  assert.equal(log.groups[1].missing, 0);
});

test('수면 기록에서 기상·취침 시각과 밤에 깬 횟수를 읽는다', () => {
  const log = buildDailyLog([
    rec('DAILY_ROUTINE_SLEEP', '07:10에 일어났어요', at(7, 12)),
    rec('DAILY_ROUTINE_SLEEP', '22:05에 잠들었어요', at(22, 5)),
    rec('DAILY_ROUTINE_SLEEP', '밤에 2번 깼어요', at(3, 0)),
  ], new Date(2026, 10, 21, 23, 0, 0));
  assert.equal(cell(log, 'sleep', 'wake').value, '07:10');
  assert.equal(cell(log, 'sleep', 'bed').value, '22:05');
  assert.deepEqual([cell(log, 'sleep', 'night').value, cell(log, 'sleep', 'night').state], ['2번', 'notable']);
});

test('글에 시각이 없으면 기록한 시각을 쓴다', () => {
  const log = buildDailyLog([rec('DAILY_ROUTINE_SLEEP', '일어났어요', at(6, 45))], DAY);
  assert.equal(cell(log, 'sleep', 'wake').value, '06:45');
});

test('복약은 아침 약과 자기 전 약을 나누고, 못 먹은 경우는 눈에 띄게 표시한다', () => {
  const log = buildDailyLog([
    rec('HEALTH_SAFETY_INFO', '아침 약 먹음', at(8, 5)),
    rec('HEALTH_SAFETY_INFO', '자기 전 약을 뱉었어요', at(21, 30)),
  ], DAY);
  assert.deepEqual([cell(log, 'medicine', 'morning').value, cell(log, 'medicine', 'morning').state], ['먹음', 'filled']);
  assert.deepEqual([cell(log, 'medicine', 'bedtime').value, cell(log, 'medicine', 'bedtime').state], ['먹지 못함', 'notable']);
});

test('약 이야기가 아닌 건강·안전 기록은 복약 칸을 채우지 않는다', () => {
  const log = buildDailyLog([rec('HEALTH_SAFETY_INFO', '땅콩 간식은 주지 않았어요', at(15))], DAY);
  assert.equal(log.groups[2].missing, 2);
});

test('오늘이 아닌 기록은 쓰지 않고, 다른 분류의 오늘 기록은 개수만 센다', () => {
  const log = buildDailyLog([
    rec('MEAL', '점심은 다 먹음', at(12, 0, 20)),
    rec('ANXIETY_CHALLENGING_BEHAVIOR', '큰 소리에 귀를 막음', at(14)),
    rec('HYGIENE_TOILETING_DRESSING', '화장실은 혼자 감', at(15)),
  ], DAY);
  assert.equal(cell(log, 'meal', 'lunch').state, 'missing');
  assert.equal(log.other, 2);
});

test('같은 칸에 기록이 여러 개면 가장 늦게 관찰한 기록을 쓴다', () => {
  const log = buildDailyLog([
    rec('MEAL', '점심 다 먹음', at(13)),
    rec('MEAL', '점심 절반만 먹음', at(12)),
  ], DAY);
  assert.equal(cell(log, 'meal', 'lunch').value, '다 먹음');
});
