import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCareStore } from '../apps/api/src/care/store.mjs';
import { DEMO_IDS } from '../apps/api/src/care/demo-data.mjs';

test('share summary counts questionnaire items for the requested recipient', async () => {
  const careStore = createCareStore({
    questionnaireReader: async (recipientId) => {
      assert.equal(recipientId, DEMO_IDS.recipient);
      return [{ category: '약' }, { category: '소통' }, { category: '소통' }];
    },
  });

  const summary = await careStore.shareSummary(
    careStore.getUser(DEMO_IDS.guardian),
    DEMO_IDS.recipient,
  );

  assert.equal(summary.find((item) => item.category === '약').confirmed_count, 1);
  assert.equal(summary.find((item) => item.category === '소통').confirmed_count, 2);
  assert.equal(summary.find((item) => item.category === '식사').confirmed_count, 0);
});
