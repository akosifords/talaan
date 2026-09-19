import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, Timestamp as ClientTimestamp } from 'firebase/firestore';
import { migrateWorkspace, fingerprint } from '../functions/src/workspaceMigration.js';
import { generateRule } from '../functions/src/scheduleGeneration.js';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const projectId = 'demo-talaan';
const app = initializeApp({ projectId }, 'backend-test');
const db = getFirestore(app);
let env;
test.before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:backend');
  env = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
});
test.after(async () => { await env?.cleanup(); await deleteApp(app); });
const rawEvent = { ownerId: 'migrate', name: 'Rent', type: 'expense', category: 'Bills', currency: 'usd', amountCents: 12500, status: 'completed', date: Timestamp.fromDate(new Date('2026-01-31T12:00:00Z')) };

test('empty account preparation is idempotent and refuses existing legacy data', async () => {
  const { prepareWorkspace } = await import('../functions/src/prepareWorkspace.js');
  const uid = `prepare_${Date.now()}`;
  const first = await prepareWorkspace(db, uid, { email: 'controlled@example.com', name: 'Test' });
  assert.deepEqual(await prepareWorkspace(db, uid), first);
  const profile = await db.doc(`users/${uid}`).get();
  assert.equal(profile.get('ownerId'), uid);
  assert.equal(profile.get('schemaVersion'), 2);
  await db.doc(`users/${uid}_legacy/events/existing`).set(rawEvent);
  await assert.rejects(prepareWorkspace(db, `${uid}_legacy`), { code: 'failed-precondition' });
  assert.equal((await db.doc(`users/${uid}_legacy`).get()).exists, false);
});

test('every v2 business collection denies cross-user reads and direct client writes', async () => {
  const { BUSINESS_COLLECTIONS } = await import('../functions/src/domain/commands.js');
  const { prepareWorkspace } = await import('../functions/src/prepareWorkspace.js');
  const uid = `ownership_${Date.now()}`;
  const { generation } = await prepareWorkspace(db, uid);
  const owner = env.authenticatedContext(uid).firestore();
  const stranger = env.authenticatedContext('foreign-owner').firestore();
  for (const collection of BUSINESS_COLLECTIONS) {
    const path = `users/${uid}/workspaceVersions/${generation}/${collection}/record`;
    await db.doc(path).set({ schemaVersion: 2 });
    await assertSucceeds(getDoc(doc(owner, path)));
    await assertFails(getDoc(doc(stranger, path)));
    await assertFails(setDoc(doc(owner, path), { schemaVersion: 2 }));
  }
});
async function seed(uid, extra = {}) {
  const owner = db.collection('users').doc(uid);
  await owner.set({ ownerId: uid, email: `${uid}@example.com`, currency: 'usd', timezone: 'Asia/Manila', startPage: 'overview', ...extra });
  await owner.collection('events').doc('rent').set({ ...rawEvent, ownerId: uid });
  await owner.collection('goals').doc('g').set({ ownerId: uid, name: 'Savings', targetCents: 10000, currentCents: 15000, currency: 'usd', status: 'completed', contributions: [{ amountCents: 5000, date: '2026-01-01' }] });
  return owner;
}

test('dry run, interrupted migration, resume, no-op and rollback preserve all originals and isolate users', async () => {
  const uid = `migration_${Date.now()}`;
  const owner = await seed(uid);
  const client = env.authenticatedContext(uid, { email: `${uid}@example.com` }).firestore();
  const stranger = env.authenticatedContext('stranger').firestore();
  const before = fingerprint((await owner.collection('events').doc('rent').get()).data());
  const options = { openingDate: '2026-09-14' };
  const dry = await migrateWorkspace(db, uid, options);
  assert.equal(dry.status, 'dry-run'); assert.equal(dry.totals.goalCents, 15000);
  assert.equal((await owner.get()).get('migration'), undefined);
  await assertSucceeds(getDoc(doc(client, `users/${uid}/events/rent`)));
  await assert.rejects(migrateWorkspace(db, uid, { ...options, mode: 'apply', afterBatch: () => { throw new Error('Interrupted'); } }), /Interrupted/);
  const locked = await owner.get(); const version = locked.get('migration.version');
  assert.equal(locked.get('migration.status'), 'copying');
  await assertFails(updateDoc(doc(client, `users/${uid}/events/rent`), { status: 'planned' }));
  await assertFails(getDoc(doc(client, `users/${uid}/workspaceVersions/${version}/events/rent`)));
  const resumed = await migrateWorkspace(db, uid, { mode: 'apply' });
  assert.equal(resumed.status, 'ready');
  const migratedPath = `users/${uid}/workspaceVersions/${version}`;
  const event = await assertSucceeds(getDoc(doc(client, `${migratedPath}/events/rent`)));
  assert.equal(event.data().localDate, '2026-01-31'); assert.equal(event.data().amountCents, 12500);
  const goal = (await db.doc(`${migratedPath}/goals/g`).get()).data();
  assert.equal(goal.openingCents, 15000); assert.equal(goal.currentCents, 15000); assert.equal(goal.contributions.length, 1);
  assert.equal((await db.collection(`${migratedPath}/events`).get()).size, 1, 'History never creates a second cash event');
  assert.equal((await db.collection(`${migratedPath}/backupRecords`).get()).size, 2);
  assert.equal(fingerprint((await owner.collection('events').doc('rent').get()).data()), before);
  await assertFails(getDoc(doc(stranger, `${migratedPath}/events/rent`)));
  await assertFails(getDoc(doc(client, `${migratedPath}/backupRecords/events_rent`)));
  await assertFails(updateDoc(doc(client, `${migratedPath}/events/rent`), { amountCents: 1 }));
  await assertFails(updateDoc(doc(client, `users/${uid}/events/rent`), { status: 'planned' }));
  await assertFails(updateDoc(doc(client, `users/${uid}`), { schemaVersion: 1 }));
  assert.equal((await migrateWorkspace(db, uid, { mode: 'apply' })).status, 'already-current');
  assert.equal((await migrateWorkspace(db, uid, { mode: 'rollback' })).status, 'rolled-back');
  await assertSucceeds(updateDoc(doc(client, `users/${uid}/events/rent`), { status: 'planned' }));
  await assertFails(getDoc(doc(client, `${migratedPath}/events/rent`)));
});

test('ambiguous history and active reminder claims block migration without changing data', async () => {
  const uid = `ambiguous_${Date.now()}`; const owner = await seed(uid);
  await owner.collection('goals').doc('g').update({ currentCents: 100 });
  await assert.rejects(migrateWorkspace(db, uid, { mode: 'apply', openingDate: '2026-09-14' }), /Reconciliation required/);
  assert.equal((await owner.get()).get('migration'), undefined);
  await owner.collection('goals').doc('g').update({ currentCents: 15000 });
  await db.collection('reminderDeliveries').doc(uid).set({ uid, status: 'processing' });
  await assert.rejects(migrateWorkspace(db, uid, { mode: 'apply', openingDate: '2026-09-14' }), /deliveries/);
});

test('concurrent scheduler runs preserve edits, advance once, and respect migration lock', async () => {
  const uid = `scheduler_${Date.now()}`; const owner = await seed(uid);
  const rule = owner.collection('recurringRules').doc('rent');
  const date = new Date('2026-02-28T12:00:00Z');
  await rule.set({ ownerId: uid, enabled: true, frequency: 'monthly', interval: 1, anchorDay: 31, anchorMonth: 0, nextRunAt: Timestamp.fromDate(date), event: { name: 'Rent', type: 'expense', amountCents: 100, currency: 'usd', category: 'Bills' } });
  const generated = owner.collection('events').doc(`rent_${date.getTime()}`);
  await generated.set({ ...rawEvent, ownerId: uid, name: 'Edited occurrence', amountCents: 999, status: 'completed' });
  const horizon = new Date('2026-03-31T12:00:00Z');
  await Promise.all([generateRule(db, rule, horizon), generateRule(db, rule, horizon)]);
  assert.equal((await generated.get()).get('amountCents'), 999);
  assert.equal((await generated.get()).get('status'), 'completed');
  assert.equal((await owner.collection('events').get()).size, 3);
  assert.equal((await rule.get()).get('nextRunAt').toDate().toISOString().slice(0, 10), '2026-04-30');
  await owner.update({ migration: { status: 'copying' } });
  assert.equal(await generateRule(db, rule, new Date('2026-06-30')), 0);
});

test('rules permit over-target goals and completed-to-planned writes for legacy clients', async () => {
  const uid = `legacy_${Date.now()}`;
  const client = env.authenticatedContext(uid).firestore();
  await assertSucceeds(setDoc(doc(client, `users/${uid}/goals/g`), { ownerId: uid, name: 'Goal', targetCents: 100, currentCents: 200, currency: 'usd', status: 'completed' }));
  const ref = doc(client, `users/${uid}/events/e`);
  await assertSucceeds(setDoc(ref, { ...rawEvent, ownerId: uid, date: ClientTimestamp.now(), goalId: null }));
  await assertSucceeds(updateDoc(ref, { status: 'planned' }));
  assert.equal((await getDoc(ref)).get('status'), 'planned');
});

test('financial commands are atomic, retry-safe, revision checked, reversible and generation scoped', async () => {
  const { executeCommand } = await import('../functions/src/commands.js');
  const uid = `commands_${Date.now()}`; const owner = await seed(uid);
  const migration = await migrateWorkspace(db, uid, { mode: 'apply', openingDate: '2026-09-01' });
  await owner.update({ backendEnabled: true });
  const command = (type, entityId, payload, expectedRevision = 0) => ({ requestId: crypto.randomUUID(), generation: migration.version, type, entityId, payload, expectedRevision });
  const save = command('goals.save', 'g', { name: 'Savings', targetCents: 10000, contributionCents: 1000, contributionDate: '2026-09-14' }, 1);
  const [first, retried] = await Promise.all([executeCommand(db, uid, save), executeCommand(db, uid, save)]);
  assert.deepEqual(first, retried);
  const root = owner.collection('workspaceVersions').doc(migration.version);
  assert.equal((await root.collection('goals').doc('g').get()).get('currentCents'), 16000);
  await assert.rejects(executeCommand(db, uid, { ...save, payload: { ...save.payload, contributionCents: 2000 } }), { code: 'already-exists' });
  await assert.rejects(executeCommand(db, uid, { ...save, requestId: crypto.randomUUID() }), { code: 'aborted' });
  const eventId = `contribution_${save.requestId}`;
  const contribution = (await root.collection('events').doc(eventId).get()).data();
  const payload = { name: contribution.name, type: 'saving', amountCents: 1000, localDate: '2026-09-14', categoryId: 'savings', goalId: 'g', status: 'planned' };
  await executeCommand(db, uid, command('events.save', eventId, payload, 1));
  assert.equal((await root.collection('goals').doc('g').get()).get('currentCents'), 15000);
  await executeCommand(db, uid, command('events.save', eventId, { ...payload, status: 'completed' }, 2));
  await executeCommand(db, uid, command('events.remove', eventId, {}, 3));
  assert.equal((await root.collection('goals').doc('g').get()).get('currentCents'), 15000);
  await executeCommand(db, uid, command('events.save', eventId, { ...payload, status: 'completed' }, 4));
  assert.equal((await root.collection('goals').doc('g').get()).get('currentCents'), 16000);
  await assert.rejects(executeCommand(db, uid, { ...command('events.save', 'foreign', payload), generation: 'old-version' }), { code: 'failed-precondition' });
  await assert.rejects(migrateWorkspace(db, uid, { mode: 'rollback' }), /reconciliation/);
});

test('budgets, scenarios, subscriptions and scheduled reminders use real isolated records', async () => {
  const { executeCommand }=await import('../functions/src/commands.js');
  const { deliverReminder }=await import('../functions/src/reminderDelivery.js');
  const uid=`planning_${Date.now()}`,owner=await seed(uid);
  const {version}=await migrateWorkspace(db,uid,{mode:'apply',openingDate:'2026-09-01'});
  await owner.update({backendEnabled:true,reminderEnabled:true,reminderHour:9,reminderLeadDays:0,timezone:'America/New_York'});
  const root=owner.collection('workspaceVersions').doc(version);
  const command=(type,entityId,payload,expectedRevision=0)=>({requestId:crypto.randomUUID(),generation:version,type,entityId,payload,expectedRevision});
  await executeCommand(db,uid,command('categories.save','bills',{name:'Bills',archived:false}));
  await executeCommand(db,uid,command('budgets.save','2026-09',{period:'2026-09',limits:{bills:10000}}));
  await executeCommand(db,uid,command('scenarios.save','trial',{name:'Trial',period:'2026-09',incomeCents:100,expenseCents:0,savingCents:0,baselineRevision:0}));
  assert.equal((await root.collection('events').get()).size,1,'Trial edits never post ledger entries');
  await executeCommand(db,uid,command('subscriptions.save','service',{name:'Service',amountCents:1200,categoryId:'bills',frequency:'monthly',startDate:'2026-09-15',endDate:'',status:'active',timezone:'America/New_York'}));
  const rule=root.collection('recurringRules').doc('subscription_service');
  await Promise.all([generateRule(db,rule,new Date('2026-09-16T00:00:00Z')),generateRule(db,rule,new Date('2026-09-16T00:00:00Z'))]);
  const records=await root.collection('events').get();assert.equal(records.size,2);
  const event=records.docs.find(row=>row.id!=='rent');assert.equal(event.get('localDate'),'2026-09-15');
  let deliveries=0;
  const now=Timestamp.fromDate(new Date('2026-09-16T12:00:00Z'));
  await Promise.all([deliverReminder(db,event.ref,now,async()=>{deliveries++;}),deliverReminder(db,event.ref,now,async()=>{deliveries++;})]);
  assert.equal(deliveries,1);
  await assert.rejects(executeCommand(db,uid,command('scenarios.save','trial',{name:'Trial',period:'2026-09',incomeCents:100,expenseCents:0,savingCents:0,baselineRevision:0},1)),{code:'aborted'});
  await executeCommand(db,uid,command('subscriptions.save','service',{name:'Service',amountCents:1400,categoryId:'bills',frequency:'monthly',startDate:'2026-09-15',endDate:'2026-10-01',status:'cancelled',timezone:'America/New_York'},1));
  assert.equal(await generateRule(db,rule,new Date('2027-01-01')),0);
  assert.equal((await event.ref.get()).get('amountCents'),1200,'Price changes preserve existing occurrences');
});

test('paged backup handles large workspaces, resumes restore, detects corruption and preserves receipts after cutover', async () => {
  const { backupJob }=await import('../functions/src/backupJobs.js');
  const { executeCommand }=await import('../functions/src/commands.js');
  const { deleteWorkspaceData }=await import('../functions/src/deleteWorkspace.js');
  const uid=`backup_${Date.now()}`,owner=await seed(uid);
  const {version}=await migrateWorkspace(db,uid,{mode:'apply',openingDate:'2026-09-01'});await owner.update({backendEnabled:true});
  const root=owner.collection('workspaceVersions').doc(version);
  const category=(await root.collection('categories').get()).docs[0].id;
  const batch=db.batch();for(let i=0;i<300;i++)batch.set(root.collection('events').doc(`large_${i}`),{ownerId:uid,schemaVersion:2,revision:1,name:'Entry',type:'expense',amountCents:100,localDate:'2026-09-14',date:Timestamp.now(),status:'planned',categoryId:category,currency:'usd'});await batch.commit();
  const command={requestId:'before-restore',generation:version,type:'categories.save',entityId:'extra',expectedRevision:0,payload:{name:'Extra',archived:false}};
  await executeCommand(db,uid,command);
  const exportId='export';await backupJob(db,uid,{jobId:exportId,action:'start-export'});
  await assert.rejects(executeCommand(db,uid,{...command,requestId:'locked'}),{code:'failed-precondition'});
  while((await backupJob(db,uid,{jobId:exportId,action:'export-page'})).status!=='ready'){ /* paginated progress */ }
  const {manifest}=await backupJob(db,uid,{jobId:exportId,action:'download'});assert.ok(manifest.recordCount>300);
  const pages=[];for(let page=0;page<manifest.pageHashes.length;page++)pages.push((await backupJob(db,uid,{jobId:exportId,action:'download',page})).page);
  const restoreId='restore';await backupJob(db,uid,{jobId:restoreId,action:'start-restore',manifest});
  await assert.rejects(backupJob(db,uid,{jobId:restoreId,action:'upload-page',page:0,rows:[]}),/checksum/);
  await backupJob(db,uid,{jobId:restoreId,action:'upload-page',page:0,rows:pages[0]});
  assert.equal((await owner.get()).get('activeWorkspaceVersion'),version);
  await assert.rejects(backupJob(db,uid,{jobId:restoreId,action:'finish-restore'}),/incomplete/);
  for(let page=0;page<pages.length;page++)await backupJob(db,uid,{jobId:restoreId,action:'upload-page',page,rows:pages[page]});
  const done=await backupJob(db,uid,{jobId:restoreId,action:'finish-restore'});assert.notEqual(done.generation,version);
  assert.equal((await owner.collection('workspaceVersions').doc(done.generation).collection('events').get()).size,301);
  await executeCommand(db,uid,command);
  await assert.rejects(executeCommand(db,uid,{...command,requestId:'after-restore'}),{code:'failed-precondition'});
  await deleteWorkspaceData(db,uid);
  assert.equal((await owner.get()).exists,false);assert.equal((await owner.collection('operations').get()).size,0);assert.equal((await root.collection('events').get()).size,0);
});

test('legacy migration resumes across pages beyond 240 records', async () => {
  const uid=`large_migration_${Date.now()}`,owner=await seed(uid);
  const batch=db.batch();for(let i=0;i<260;i++)batch.set(owner.collection('events').doc(`legacy_${i}`),{...rawEvent,ownerId:uid});await batch.commit();
  const options={mode:'apply',openingDate:'2026-09-15'};
  await assert.rejects(migrateWorkspace(db,uid,{...options,afterBatch:()=>{throw new Error('stop after checkpoint');}}),/checkpoint/);
  const result=await migrateWorkspace(db,uid,options);assert.equal(result.sourceCount,262);
  assert.equal((await owner.collection('workspaceVersions').doc(result.version).collection('events').get()).size,261);
});

test('reminder preference rebuild respects workspace locks and rewrites dates in bounded pages', async () => {
  const { rescheduleReminders }=await import('../functions/src/rescheduleReminders.js');
  const uid=`reschedule_${Date.now()}`,owner=await seed(uid);
  const {version}=await migrateWorkspace(db,uid,{mode:'apply',openingDate:'2026-09-15'});
  const event=owner.collection('workspaceVersions').doc(version).collection('events').doc('rent');
  await event.update({status:'planned'});
  await owner.update({reminderEnabled:true,reminderHour:9,reminderLeadDays:0,timezone:'Asia/Kolkata',reminderReschedule:true,workspaceLock:{jobId:'test'}});
  assert.equal(await rescheduleReminders(db,owner),0);
  const { FieldValue }=require('firebase-admin/firestore');await owner.update({workspaceLock:FieldValue.delete()});
  assert.equal(await rescheduleReminders(db,owner),1);
  assert.equal((await event.get()).get('reminderAt').toDate().toISOString(),'2026-01-31T03:30:00.000Z');
});
