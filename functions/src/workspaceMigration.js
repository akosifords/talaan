import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { encodeFirestore, validateRestoreBackup, validateWorkspaceDocument } from './validation.js';
import { validDate, validId } from './domain/workspace.js';

const COLLECTIONS = ['events', 'goals', 'recurringRules', 'guardrails'];
const MAX_RECORDS = 10000;
const BATCH_SIZE = 40;
const canonical = value => {
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
};
export const fingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const categoryId = name => `cat_${fingerprint(name).slice(0, 24)}`;

async function readSource(owner, transaction) {
  const source={};let count=0;
  for(const name of COLLECTIONS){
    const rows=[];let after;
    while(true){
      let query=owner.collection(name).orderBy('__name__').limit(200);
      if(after)query=query.startAfter(after);
      const page=transaction?await transaction.get(query):await query.get();
      count+=page.size;
      if(count>MAX_RECORDS)throw new Error('Migration exceeds 10,000 source records. An operator bulk migration is required; no records were omitted.');
      rows.push(...page.docs.map(doc=>({id:doc.id,data:doc.data()})));
      if(page.size<200)break;
      after=page.docs.at(-1);
    }
    source[name]=rows;
  }
  return source;
}

export function planMigration(source, uid, openingDate) {
  if (!validDate(openingDate)) throw new Error('An explicit opening date is required.');
  const checked = Object.fromEntries(COLLECTIONS.map(name=>[name,(source[name]||[]).map(row=>
    validateRestoreBackup({[name]:[{id:row.id,data:encodeFirestore(row.data)}]})[name][0]) ]));
  const originals=Object.fromEntries(COLLECTIONS.map(name=>[name,new Map((source[name]||[]).map(row=>[row.id,row.data]))]));
  const rows = [];
  const categories = new Map();
  const warnings = ['Operating cash has no inferred opening balance. An explicit cash checkpoint is required before forecasts.'];
  const totals = { eventCents: 0, goalCents: 0, legacyContributions: 0 };
  for (const name of COLLECTIONS) for (const row of checked[name]) {
    validateWorkspaceDocument(name, row.data);
    if (row.data.ownerId && row.data.ownerId !== uid) throw new Error(`Owner mismatch: ${name}/${row.id}`);
    const data = { ...originals[name].get(row.id), ownerId: uid, schemaVersion: 2, revision: 1 };
    if (name === 'events') {
      if (data.type === 'expense' && data.category === 'Savings') data.type = 'saving';
      data.localDate = row.data.date.toISOString().slice(0, 10);
      data.status = data.status || 'planned';
      if (data.goalId && data.status === 'completed') data.legacyIncludedInOpening = true;
      data.categoryId = categoryId(data.category);
      categories.set(data.categoryId, data.category);
      totals.eventCents += data.amountCents;
      if (data.localDate < openingDate && data.status === 'planned') warnings.push(`Unreconciled past event: ${row.id}`);
    }
    if (name === 'goals') {
      const history = data.contributions || [];
      if (history.reduce((sum, item) => sum + item.amountCents, 0) > data.currentCents) {
        throw new Error(`Reconciliation required: goal ${row.id} history exceeds its saved balance. Original data is unchanged.`);
      }
      data.openingCents = data.currentCents;
      data.openingDate = openingDate;
      data.archived = data.status === 'archived';
      data.historyMode = 'legacy-included-in-opening';
      totals.goalCents += data.currentCents;
      totals.legacyContributions += history.length;
    }
    if (name === 'recurringRules') {
      data.event = { ...data.event, categoryId: categoryId(data.event.category), type: data.event.type === 'expense' && data.event.category === 'Savings' ? 'saving' : data.event.type };
      categories.set(data.event.categoryId, data.event.category);
    }
    if (name === 'recurringRules' && data.anchorDay == null) {
      const origin = checked.events.find(item => item.id === row.id)?.data.date;
      if (!origin && ['monthly', 'yearly'].includes(data.frequency)) throw new Error(`Reconciliation required: recurrence ${row.id} has no original date anchor.`);
      const anchor = origin || row.data.nextRunAt;
      data.anchorDay = anchor.getUTCDate(); data.anchorMonth = anchor.getUTCMonth();
    }
    rows.push({ collection: name, id: row.id, data });
  }
  const eventIds = new Set(checked.events.map(row => row.id));
  const goalIds = new Set(checked.goals.map(row => row.id));
  for (const row of rows.filter(item => item.collection === 'events')) {
    if (row.data.goalId && !goalIds.has(row.data.goalId)) throw new Error(`Unresolved goal reference: ${row.id}`);
    if (row.data.subscriptionId) throw new Error(`Unresolved subscription reference: ${row.id}`);
    if (row.data.recurringRuleId && !checked.recurringRules.some(rule => rule.id === row.data.recurringRuleId)) warnings.push(`Historical event references removed recurrence: ${row.id}`);
  }
  for (const [id, name] of categories) rows.push({ collection: 'categories', id, data: { ownerId: uid, schemaVersion: 2, revision: 1, name, archived: false } });
  return { sourceHash: fingerprint(source), openingDate, rows, totals, warnings, sourceCount: Object.values(source).flat().length, eventCount: eventIds.size };
}

// Operator migration requires an explicit environment and remains unavailable to client writes.
export async function migrateWorkspace(db, uid, { mode = 'dry-run', openingDate, afterBatch } = {}) {
  const emulator=process.env.FIRESTORE_EMULATOR_HOST&&db.projectId?.startsWith('demo-');
  const staging=process.env.TALAAN_ALLOW_STAGING_MIGRATION==='true'&&process.env.TALAAN_STAGING_PROJECT_ID&&db.projectId===process.env.TALAAN_STAGING_PROJECT_ID;
  if(!emulator&&!staging)throw new Error('Migration requires a demo emulator or an explicitly approved staging project.');
  if (!validId(uid) || !['dry-run', 'apply', 'rollback'].includes(mode)) throw new Error('Invalid migration request.');
  const owner = db.collection('users').doc(uid);
  const initial = await owner.get();
  if (!initial.exists) throw new Error('Workspace profile does not exist.');
  const profile = initial.data();
  if (mode === 'rollback') {
    return db.runTransaction(async tx => {
      const current = await tx.get(owner);
      const migration = current.get('migration');
      if (!migration?.version || !['copying', 'ready'].includes(migration.status)) throw new Error('No B2 migration to roll back.');
      const generation = owner.collection('workspaceVersions').doc(migration.version);
      const manifest = await tx.get(generation);
      if (manifest.get('writable') !== false) throw new Error('Rollback requires reconciliation after v2 writes are enabled.');
      // Legacy records were never changed. Staged records and backup are retained for audit.
      tx.update(owner, { schemaVersion: 1, activeWorkspaceVersion: FieldValue.delete(), migration: { ...migration, status: 'rolled-back' } });
      tx.update(generation, { status: 'rolled-back' });
      return { status: 'rolled-back', version: migration.version };
    });
  }
  if ((profile.schemaVersion ?? 1) === 2) return { status: 'already-current', version: profile.activeWorkspaceVersion };
  if ((profile.schemaVersion ?? 1) !== 1) throw new Error('Unsupported source schema.');
  const source = await readSource(owner);
  const plan = planMigration(source, uid, profile.migration?.status === 'copying' ? profile.migration.openingDate : openingDate);
  const report = { sourceCount: plan.sourceCount, targetCount: plan.rows.length, totals: plan.totals, warnings: plan.warnings, sourceHash: plan.sourceHash, openingDate: plan.openingDate };
  if (mode === 'dry-run') return { status: 'dry-run', ...report };
  const version = `v2_${fingerprint({ source: plan.sourceHash, openingDate: plan.openingDate }).slice(0, 24)}`;
  const generation = owner.collection('workspaceVersions').doc(version);
  await db.runTransaction(async tx => {
    const current = await tx.get(owner);
    const manifest = await tx.get(generation);
    const fresh = await readSource(owner, tx);
    const deliveries = await tx.get(db.collection('reminderDeliveries').where('uid', '==', uid).limit(241));
    if (deliveries.size > 240 || deliveries.docs.some(item => item.get('status') === 'processing')) throw new Error('Wait for reminder deliveries to finish before migration.');
    if ((current.get('schemaVersion') ?? 1) !== 1) throw new Error('Workspace schema changed; run again.');
    if (current.get('migration.status') === 'copying' && current.get('migration.version') !== version) throw new Error('Another migration holds the workspace lock.');
    if (fingerprint(fresh) !== plan.sourceHash) throw new Error('Workspace changed after dry run. Run migration again.');
    if (!manifest.exists || manifest.get('status') === 'rolled-back') {
      tx.set(generation, { ...report, status: 'copying', writable: false, progress: 0, version, backupProfile: current.data() });
    }
    tx.update(owner, { migration: { status: 'copying', version, openingDate: plan.openingDate } });
  });
  const backups = Object.entries(source).flatMap(([collection, items]) => items.map(row => ({
    ref: generation.collection('backupRecords').doc(`${collection}_${row.id}`), data: { collection, id: row.id, data: row.data },
  })));
  const writes = [...backups, ...plan.rows.map(row => ({ ref: generation.collection(row.collection).doc(row.id), data: row.data }))];
  // A checkpoint and its batch commit together. Resume safely repeats identical documents.
  const progress = (await generation.get()).get('progress') || 0;
  for (let offset = progress; offset < writes.length; offset += BATCH_SIZE) {
    await db.runTransaction(async tx => {
      const current = await tx.get(owner);
      if (current.get('migration.status') !== 'copying' || current.get('migration.version') !== version) throw new Error('Migration lock was released.');
      for (const item of writes.slice(offset, offset + BATCH_SIZE)) tx.set(item.ref, item.data);
      tx.update(generation, { progress: Math.min(offset + BATCH_SIZE, writes.length) });
    });
    await afterBatch?.(offset);
  }
  // Verify every copied document, including the backup, before publishing the pointer.
  for(let offset=0;offset<writes.length;offset+=100){
    const expected=writes.slice(offset,offset+100);
    const copied=await db.getAll(...expected.map(item=>item.ref));
    if(copied.some((snapshot,i)=>!snapshot.exists||fingerprint(snapshot.data())!==fingerprint(expected[i].data)))throw new Error('Migration copy verification failed; workspace remains locked.');
  }
  await db.runTransaction(async tx => {
    const current = await tx.get(owner);
    const fresh = await readSource(owner, tx);
    if (current.get('migration.status') !== 'copying' || current.get('migration.version') !== version || fingerprint(fresh) !== plan.sourceHash) throw new Error('Migration source or lock changed before activation.');
    tx.update(generation, { status: 'ready' });
    tx.update(owner, { schemaVersion: 2, activeWorkspaceVersion: version, migration: { status: 'ready', version, openingDate: plan.openingDate } });
  });
  return { status: 'ready', version, ...report };
}
