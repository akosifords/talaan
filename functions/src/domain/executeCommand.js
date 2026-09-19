import { reminderInstant } from './reminders.js';
import { checkCommand, assertRevision, requireReference, eventEffect, applyGoalDelta } from './commands.js';
import { DomainError, validCents } from './workspace.js';
import { nextOccurrence } from '../recurrence.js';

export async function executeTransactionCommand(db, uid, input, { fingerprint, timestamp, serverTimestamp }) {
  const command = checkCommand(input);
  const owner = db.collection('users').doc(uid);
  const receipt = owner.collection('operations').doc(command.requestId);
  const hash = fingerprint(command);
  return db.runTransaction(async tx => {
    const [profile, received] = await tx.getAll(owner, receipt);
    if (received.exists) {
      if (received.get('fingerprint') !== hash) throw new DomainError('already-exists', 'This request ID was already used for different changes.');
      return received.get('result');
    }
    if (profile.get('schemaVersion') !== 2 || profile.get('activeWorkspaceVersion') !== command.generation || profile.get('migration.status') !== 'ready' || profile.get('backendEnabled') !== true || profile.get('workspaceLock')) throw new DomainError('failed-precondition', 'This workspace is not enabled for writes, or its data version changed. Reload before saving.');
    const root = owner.collection('workspaceVersions').doc(command.generation);
    const [collection, action] = command.type.split('.');
    const ref = root.collection(collection).doc(command.entityId);
    const snapshot = await tx.get(ref); const old = snapshot.data();
    assertRevision(old, command.expectedRevision);
    const p = command.payload;
    const revision = (old?.revision || 0) + 1;
    const updates = new Map();
    const put = (path, value) => updates.set(path, value);
    const get = async (name, id) => (await tx.get(root.collection(name).doc(id))).data();
    let next = { ...old, ...p, ownerId: uid, schemaVersion: 2, revision, deleted: false };
    if (action === 'remove') { requireReference(old, 'Record'); next = { ...old, revision, deleted: collection === 'events' || collection === 'scenarios', archived: collection !== 'events' && collection !== 'scenarios' }; }
    if (collection === 'events') {
      if (action === 'save') {
        const storedCategory = await get('categories', p.categoryId);
        const category = storedCategory && old?.categoryId === p.categoryId ? storedCategory : requireReference(storedCategory, 'Category');
        next.category = category.name; next.currency = 'usd'; next.date = timestamp(new Date(`${p.localDate}T12:00:00Z`));
        const occurrence = new Date(`${p.localDate}T12:00:00Z`);
        next.reminderAt = profile.get('reminderEnabled') && p.type === 'expense' && p.status === 'planned' ? timestamp(reminderInstant(occurrence, { timezone: profile.get('timezone') || 'UTC', hour: profile.get('reminderHour') ?? 9, leadDays: profile.get('reminderLeadDays') ?? 3 })) : null;
        next.reminderSent = false;
        if (old?.recurringRuleId && p.recurring) throw new DomainError('failed-precondition', 'Edit the recurring source or subscription to change future events.');
      }
      if(old?.legacyIncludedInOpening && (action === 'remove' || ['amountCents','localDate','goalId','type','status'].some(key=>old[key]!==next[key]))) throw new DomainError('failed-precondition','This legacy contribution is already included in the goal opening balance. Use an explained balance adjustment instead.');
      const ids = [...new Set([old?.goalId, next.goalId].filter(Boolean))];
      for (const id of ids) {
        const goal = requireReference(await get('goals', id), 'Goal');
        const before = old?.goalId === id ? eventEffect(old) : 0;
        const after = next.goalId === id ? eventEffect(next) : 0;
        if(after && !next.legacyIncludedInOpening && next.localDate < goal.openingDate)throw new DomainError('failed-precondition','This contribution precedes the goal opening balance.');
        if (before !== after) put(`goals/${id}`, applyGoalDelta(goal, after - before, [before && old.localDate, after && next.localDate].filter(Boolean)));
      }
      if (!old?.recurringRuleId) {
        const rule = await get('recurringRules', command.entityId);
        if (action === 'remove' || !p.recurring) {
          if (rule) put(`recurringRules/${command.entityId}`, { ...rule, enabled: false, revision: (rule.revision || 0) + 1 });
        } else {
          const source = new Date(`${p.localDate}T12:00:00Z`);
          const unchanged = old && fingerprint(old.recurring || null) === fingerprint(p.recurring) && old.localDate === p.localDate;
          put(`recurringRules/${command.entityId}`, { ownerId: uid, schemaVersion: 2, revision: (rule?.revision || 0) + 1, enabled: true,
            frequency: p.recurring.frequency, interval: p.recurring.interval, anchorDay: source.getUTCDate(), anchorMonth: source.getUTCMonth(),
            nextRunAt: unchanged && rule ? rule.nextRunAt : timestamp(nextOccurrence(source, p.recurring.frequency, p.recurring.interval)),
            endAt: p.recurring.endDate ? timestamp(new Date(`${p.recurring.endDate}T12:00:00Z`)) : null,
            timezone: profile.get('timezone') || 'UTC', event: { name: next.name, type: next.type, amountCents: next.amountCents, currency: 'usd', categoryId: next.categoryId, category: next.category, goalId: next.goalId || null } });
        }
      }
    }
    if (collection === 'goals') {
      if (action === 'save') {
        if (old && (p.openingCents !== undefined || p.openingDate !== undefined)) throw new DomainError('invalid-argument', 'Opening balances cannot be overwritten. Use a balance adjustment.');
        if (!old && (p.openingCents === undefined || !p.openingDate)) throw new DomainError('invalid-argument', 'A goal opening balance and date are required.');
        next = { ...next, currency: 'usd', archived: p.archived ?? old?.archived ?? false, openingCents: old?.openingCents ?? p.openingCents,
          openingDate: old?.openingDate ?? p.openingDate, currentCents: old?.currentCents ?? p.openingCents };
        if (p.contributionCents) {
          requireReference(next, 'Goal');
          next = { ...applyGoalDelta(next, p.contributionCents, [p.contributionDate]), revision };
          const category = await get('categories', 'savings');
          if (!category) put('categories/savings', { ownerId: uid, schemaVersion: 2, revision: 1, name: 'Savings', archived: false });
          else requireReference(category, 'Savings category');
          put(`events/contribution_${command.requestId}`, { ownerId: uid, schemaVersion: 2, revision: 1, name: `${p.name} contribution`.slice(0, 100), type: 'saving', amountCents: p.contributionCents,
            localDate: p.contributionDate, date: timestamp(new Date(`${p.contributionDate}T12:00:00Z`)), categoryId: 'savings', category: 'Savings', currency: 'usd', status: 'completed', goalId: command.entityId, deleted: false });
        }
        delete next.contributionCents; delete next.contributionDate;
      } else if (action === 'adjust') {
        requireReference(old, 'Goal');
        const currentCents = old.currentCents + p.adjustmentCents;
        if (!validCents(currentCents)) throw new DomainError('invalid-argument', 'Invalid adjusted balance.');
        next = { ...old, currentCents, revision, adjustmentCents: (old.adjustmentCents || 0) + p.adjustmentCents };
        put(`adjustments/${command.requestId}`, { ownerId: uid, schemaVersion: 2, revision: 1, goalId: command.entityId, amountCents: p.adjustmentCents, reason: p.reason });
      }
    }
    if (collection === 'scenarios' && action === 'save' && p.baselineRevision !== (profile.get('ledgerRevision') || 0)) throw new DomainError('aborted', 'The scenario baseline changed. Rebase before saving.');
    if (collection === 'budgets') for (const id of Object.keys(p.limits)) { const category=await get('categories',id);if(!category || old?.limits?.[id]!==p.limits[id])requireReference(category,'Budget category'); }
    if (collection === 'goalPlans') requireReference(await get('goals', command.entityId), 'Goal');
    if (collection === 'subscriptions') {
      const rule = await get('recurringRules', `subscription_${command.entityId}`);
      if (action === 'save') {
        const storedCategory=await get('categories',p.categoryId);
        const category=storedCategory&&old?.categoryId===p.categoryId?storedCategory:requireReference(storedCategory,'Subscription category');
        const source = new Date(`${p.startDate}T12:00:00Z`);
        const end = p.endDate ? new Date(`${p.endDate}T12:00:00Z`) : null;
        if(end && p.status === 'cancelled')end.setUTCDate(end.getUTCDate()-1);
        next.recurringRuleId = `subscription_${command.entityId}`;
        next.category = category.name;
        put(`recurringRules/${next.recurringRuleId}`, { ownerId: uid, schemaVersion: 2, revision: (rule?.revision || 0) + 1, enabled: p.status === 'active' || (p.status === 'cancelled' && p.endDate > p.startDate), frequency: p.frequency, interval: 1,
          anchorDay: source.getUTCDate(), anchorMonth: source.getUTCMonth(), timezone: p.timezone,
          nextRunAt: rule && old.startDate === p.startDate && old.frequency === p.frequency ? rule.nextRunAt : timestamp(source),
          endAt: end ? timestamp(end) : null,
          event: { name: p.name, amountCents: p.amountCents, currency: 'usd', type: 'expense', categoryId: p.categoryId, category: category.name, subscriptionId: command.entityId } });
      } else if (rule) put(`recurringRules/subscription_${command.entityId}`, { ...rule, enabled: false, revision: (rule.revision || 0) + 1 });
    }
    put(`${collection}/${command.entityId}`, next);
    for (const [path, value] of updates) tx.set(root.collection(path.split("/")[0]).doc(path.split("/")[1]), { ...value, updatedAt: serverTimestamp() });
    // Incrementing the workspace revision provides an explicit scenario baseline token.
    const workspaceRevision = (profile.get('workspaceRevision') || 0) + 1;
    tx.update(owner, { workspaceRevision, ...(collection === 'preferences' ? { reminderReschedule: true, reminderCursor: null, displayName: p.name, startPage: p.startPage, timezone: p.timezone, reminderEnabled: p.reminderEnabled, reminderHour: p.reminderHour, reminderLeadDays: p.reminderLeadDays } : {}), ...(['events','goals','subscriptions','cashCheckpoints'].includes(collection) ? { ledgerRevision: (profile.get('ledgerRevision') || 0) + 1 } : {}) });
    tx.set(root, { writable: true }, { merge: true });
    const result = { id: command.entityId, revision, workspaceRevision, generation: command.generation };
    tx.create(receipt, { fingerprint: hash, generation: command.generation, result, createdAt: serverTimestamp() });
    return result;
  });
}
