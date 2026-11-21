import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as my from '../apps/web/public/a/my.js';

test('mypage counts only currently shared assigned applications', () => {
  assert.equal(typeof my.activeShares, 'function');
  const now = new Date('2026-11-21T06:00:00Z');
  const applications = [
    { status: 'assigned', center_name: '긴급돌봄', requested_start_at: '2026-11-20T00:00:00Z', requested_end_at: '2026-11-22T00:00:00Z', assignment: { status: 'active' } },
    { status: 'assigned', center_name: '종료센터', requested_start_at: '2026-11-10T00:00:00Z', requested_end_at: '2026-11-11T00:00:00Z', assignment: { status: 'active' } },
    { status: 'submitted', center_name: '대기센터', requested_start_at: '2026-11-20T00:00:00Z', requested_end_at: '2026-11-22T00:00:00Z', assignment: null },
  ];

  assert.deepEqual(my.activeShares(applications, now).map((item) => item.center_name), ['긴급돌봄']);
});

test('mypage backup contains profile, questionnaire answers and sent records', () => {
  assert.equal(typeof my.buildBackup, 'function');
  const backup = my.buildBackup({
    exportedAt: '2026-11-21T06:00:00.000Z',
    session: { user_id: 'user-1', role: 'guardian', display_name: '가상보호자' },
    profile: { receiver: { name: '가상아이' }, photo: 'data:image/jpeg;base64,AAAA' },
    answers: [{ question_id: 'q1', option_ids: ['o1'], answer_text: '' }],
    applications: [{ id: 'request-1', status: 'assigned' }],
  });

  assert.equal(backup.exported_at, '2026-11-21T06:00:00.000Z');
  assert.deepEqual(backup.guardian, { user_id: 'user-1', display_name: '가상보호자' });
  assert.equal(backup.profile.receiver.name, '가상아이');
  assert.equal(backup.questionnaire_answers[0].question_id, 'q1');
  assert.equal(backup.sent_records[0].id, 'request-1');
});
