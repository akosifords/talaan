import { BUSINESS_COLLECTIONS, checkCommand } from './commands.js';
import { validDate, validId, validCents, validTimezone, validateV2Event, DomainError } from './workspace.js';
export const BACKUP_FORMAT = 'talaan-workspace';
export const BACKUP_VERSION = 3;
export const PAGE_SIZE = 20;
const reject = message => { throw new DomainError('invalid-argument', message); };
export function validateManifest(manifest) {
  if (!manifest || manifest.format !== BACKUP_FORMAT || manifest.version !== BACKUP_VERSION || manifest.schemaVersion !== 2
    || !Array.isArray(manifest.pageHashes) || manifest.pageHashes.length > 5000 || manifest.pageHashes.some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))
    || !Number.isSafeInteger(manifest.recordCount) || manifest.recordCount < 0 || manifest.recordCount > 100000 || !manifest.profile || typeof manifest.profile !== 'object' || Array.isArray(manifest.profile)) reject('Unsupported or malformed backup manifest.');
  const p=manifest.profile;
  if(Object.keys(p).some(key=>!['displayName','currency','timezone','startPage','reminderEnabled','reminderHour','reminderLeadDays'].includes(key))
    || (p.displayName!==undefined&&(typeof p.displayName!=='string'||p.displayName.length>60)) || (p.currency!==undefined&&p.currency!=='usd')
    || (p.timezone!==undefined&&!validTimezone(p.timezone)) || (p.startPage!==undefined&&!['overview','schedule','goals'].includes(p.startPage))
    || (p.reminderEnabled!==undefined&&typeof p.reminderEnabled!=='boolean') || (p.reminderHour!==undefined&&(!Number.isInteger(p.reminderHour)||p.reminderHour<0||p.reminderHour>23))
    || (p.reminderLeadDays!==undefined&&(!Number.isInteger(p.reminderLeadDays)||p.reminderLeadDays<0||p.reminderLeadDays>30))) reject('Invalid backup profile.');
  return manifest;
}
export function validateBackupRecord(row) {
  if (!row || !BUSINESS_COLLECTIONS.includes(row.collection) || !validId(row.id) || !row.data || row.data.schemaVersion !== 2 || !Number.isSafeInteger(row.data.revision) || row.data.revision < 1) reject('Invalid backup record.');
  const d = row.data;
  if (JSON.stringify(d).length > 500000) reject('A backup record is too large.');
  const command = (collection, payload) => checkCommand({ requestId: 'validate', generation: 'validate', type: `${collection}.save`, entityId: row.id, expectedRevision: 0, payload });
  if (row.collection === 'events' && !validateV2Event({ ...d, id: row.id })) reject(`Invalid event ${row.id}.`);
  if (row.collection === 'goals') {
    if (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 100 || !validCents(d.targetCents,1) || !validCents(d.currentCents) || !validCents(d.openingCents) || !validDate(d.openingDate)
      || (d.contributions && (!Array.isArray(d.contributions) || d.contributions.length > 500 || d.contributions.some(item => !validCents(item.amountCents,1) || !validDate(item.date))))) reject(`Invalid goal ${row.id}.`);
  }
  if (row.collection === 'preferences') command('preferences',Object.fromEntries(['name','startPage','timezone','reminderEnabled','reminderHour','reminderLeadDays','guardrailEnabled','guardrailCents'].map(key=>[key,d[key]])));
  if (row.collection === 'categories') command('categories',{name:d.name,archived:d.archived||false});
  if (row.collection === 'budgets') command('budgets',{period:d.period,limits:d.limits});
  if (row.collection === 'scenarios') command('scenarios',Object.fromEntries(['name','period','incomeCents','expenseCents','savingCents','baselineRevision'].map(key=>[key,d[key]])));
  if (row.collection === 'subscriptions') command('subscriptions',Object.fromEntries(['name','amountCents','categoryId','frequency','startDate','endDate','status','timezone'].filter(key=>d[key]!==undefined).map(key=>[key,d[key]])));
  if (row.collection === 'goalPlans') command('goalPlans',{monthlyCents:d.monthlyCents,...(d.targetDate?{targetDate:d.targetDate}:{})});
  if (row.collection === 'cashCheckpoints') command('cashCheckpoints',{openingCents:d.openingCents,effectiveDate:d.effectiveDate});
  if (row.collection === 'recurringRules') {
    const date = d.nextRunAt?.toDate?.() || new Date(d.nextRunAt?.value || d.nextRunAt);
    if (!['daily','weekly','monthly','yearly'].includes(d.frequency) || !Number.isInteger(d.interval) || d.interval < 1 || d.interval > 365 || !Number.isFinite(date.getTime()) || !d.event || !validCents(d.event.amountCents,1) || !['income','expense','saving'].includes(d.event.type) || typeof d.event.name !== 'string' || !d.event.name.trim() || d.event.name.length>100 || typeof d.enabled!=='boolean') reject('Invalid recurrence in backup.');
  }
  if (row.collection === 'adjustments' && (!validId(d.goalId) || !Number.isSafeInteger(d.amountCents) || Math.abs(d.amountCents)>100000000 || typeof d.reason!=='string' || !d.reason.trim() || d.reason.length>1000)) reject('Invalid balance adjustment.');
  if (row.collection === 'guardrails' && (!validCents(d.limitCents,1) || !['weekly','monthly'].includes(d.period) || typeof d.enabled!=='boolean')) reject('Invalid guardrail.');
  return row;
}
export function reconcileBackup(rows) {
  const maps = Object.fromEntries(BUSINESS_COLLECTIONS.map(name=>[name,new Map()]));
  for (const row of rows) { validateBackupRecord(row); if(maps[row.collection].has(row.id)) reject('Duplicate backup record.'); maps[row.collection].set(row.id,row.data); }
  const reference = (collection,id) => { if(id&&!maps[collection].has(id)) reject(`Missing ${collection} reference: ${id}.`); };
  const deltas = new Map();
  for(const event of maps.events.values()) {
    reference('categories',event.categoryId);reference('goals',event.goalId);reference('subscriptions',event.subscriptionId);
    if(event.goalId&&!event.deleted&&!event.legacyIncludedInOpening&&event.type==='saving'&&event.status==='completed') {
      if(event.localDate<maps.goals.get(event.goalId).openingDate) reject('Contribution predates its opening balance.');
      deltas.set(event.goalId,(deltas.get(event.goalId)||0)+event.amountCents);
    }
  }
  const adjustments=new Map();
  for(const row of maps.adjustments.values()){reference('goals',row.goalId);adjustments.set(row.goalId,(adjustments.get(row.goalId)||0)+row.amountCents);}
  for(const [id,goal] of maps.goals) if(goal.currentCents!==goal.openingCents+(deltas.get(id)||0)+(adjustments.get(id)||0)) reject(`Goal ${id} does not reconcile with its opening balance, events and adjustments.`);
  for(const budget of maps.budgets.values()) for(const id of Object.keys(budget.limits)) reference('categories',id);
  for(const [id] of maps.goalPlans) reference('goals',id);
  for(const subscription of maps.subscriptions.values()){reference('categories',subscription.categoryId);reference('recurringRules',subscription.recurringRuleId);}
  for(const rule of maps.recurringRules.values()){reference('categories',rule.event.categoryId);reference('goals',rule.event.goalId);reference('subscriptions',rule.event.subscriptionId);}
  return rows;
}
