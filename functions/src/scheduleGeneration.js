import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { dueOccurrences, occurrenceId } from './recurrence.js';
import { reminderInstant } from './domain/reminders.js';
import { assertLegacyWritable } from './domain/workspace.js';

export async function generateRule(db, ruleRef, horizon) {
  const root = ruleRef.parent.parent;
  const modern = root?.parent.id === "workspaceVersions";
  const owner = modern ? root.parent.parent : root;
  // Collection-group queries also find staged generations. Never process those as users.
  if (!owner || owner.parent.id !== 'users') return 0;
  return db.runTransaction(async transaction => {
    const [profile, snapshot] = await transaction.getAll(owner, ruleRef);
    if (profile.get('workspaceLock')) return 0;
    if (modern) {
      if (profile.get('activeWorkspaceVersion') !== root.id || profile.get('migration.status') !== 'ready' || !profile.get('backendEnabled')) return 0;
    } else { try { assertLegacyWritable(profile.data()); } catch { return 0; } }
    if (!snapshot.exists || !snapshot.get('enabled')) return 0;
    const rule = snapshot.data();
    const result = dueOccurrences(rule, horizon, 50);
    const refs = result.occurrences.map(date => root.collection('events').doc(occurrenceId(snapshot.id, date)));
    const existing = refs.length ? await transaction.getAll(...refs) : [];
    let created = 0;
    result.occurrences.forEach((occurrence, index) => {
      if (existing[index].exists) return;
      const reminderAt = modern && profile.get('reminderEnabled') && rule.event.type === 'expense'
        ? Timestamp.fromDate(reminderInstant(occurrence, { timezone: profile.get('timezone') || 'UTC', hour: profile.get('reminderHour') ?? 9, leadDays: profile.get('reminderLeadDays') ?? 3 }))
        : !modern && Number.isInteger(rule.reminderMinutesBefore) ? Timestamp.fromMillis(occurrence.getTime() - rule.reminderMinutesBefore * 60000) : null;
      transaction.create(refs[index], {
        ...rule.event, ownerId: owner.id, status: 'planned',
        ...(modern ? { schemaVersion: 2, revision: 1, localDate: occurrence.toISOString().slice(0, 10), deleted: false } : {}),
        recurringRuleId: snapshot.id, occurrenceAt: Timestamp.fromDate(occurrence), date: Timestamp.fromDate(occurrence),
        ...(reminderAt ? { reminderAt, reminderSent: false } : {}),
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      created++;
    });
    transaction.update(ruleRef, { nextRunAt: Timestamp.fromDate(result.nextRunAt), anchorDay: result.anchorDay,
      anchorMonth: result.anchorMonth, enabled: !result.exhausted, updatedAt: FieldValue.serverTimestamp() });
    if (modern && created) transaction.update(owner, { workspaceRevision: (profile.get('workspaceRevision') || 0) + 1, ledgerRevision: (profile.get('ledgerRevision') || 0) + 1 });
    return created;
  });
}
