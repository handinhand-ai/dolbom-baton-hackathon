export function createMemoryRecordStore() {
  const entries = new Map();
  const batches = new Map();
  const belongsTo = (record, [userId, recipientId, assignmentId]) =>
    record.author_user_id === userId && record.care_recipient_id === recipientId &&
    record.assignment_id === assignmentId;

  return {
    list(scope) {
      return [...entries.values()].map(({ record }) => record)
        .filter((record) => belongsTo(record, scope)).reverse();
    },
    find(scope, id) {
      const entry = entries.get(id);
      return entry && belongsTo(entry.record, scope) ? entry : undefined;
    },
    save(scope, key, fingerprint, batch) {
      const batchKey = JSON.stringify([...scope, key]);
      const previous = batches.get(batchKey);
      if (previous) {
        if (previous.fingerprint !== fingerprint) return { conflict: true };
        return { created: false, entries: previous.ids.map((id) => entries.get(id)) };
      }
      for (const entry of batch) entries.set(entry.record.id, entry);
      batches.set(batchKey, { fingerprint, ids: batch.map(({ record }) => record.id) });
      return { created: true, entries: batch };
    },
    markSent(scope, id, sentAt) {
      const entry = this.find(scope, id);
      if (!entry) throw new Error('Missing care record');
      if (!entry.record.sent_to_guardian_at) {
        entry.record = { ...entry.record, sent_to_guardian_at: sentAt };
      }
      return entry.record;
    },
  };
}
