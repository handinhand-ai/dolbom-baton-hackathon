export function isActiveAssignment(assignment, recipientId, timestamp) {
  return assignment?.status === 'active' && Boolean(assignment.id) &&
    assignment.care_recipient_id === recipientId &&
    Date.parse(assignment.starts_at) <= timestamp && timestamp <= Date.parse(assignment.ends_at);
}
