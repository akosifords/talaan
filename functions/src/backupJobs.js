import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { fingerprint } from './workspaceMigration.js';
import { readCollection } from './workspaceRead.js';
import { encodeFirestore } from './validation.js';
import { BUSINESS_COLLECTIONS } from './domain/commands.js';
import { BACKUP_FORMAT, BACKUP_VERSION, PAGE_SIZE, validateManifest, validateBackupRecord, reconcileBackup } from './domain/backup.js';
import { DomainError, validId } from './domain/workspace.js';
const fail = message => { throw new DomainError('failed-precondition',message); };
const revive = value => value?.__type==='timestamp' ? Timestamp.fromDate(new Date(value.value)) : Array.isArray(value) ? value.map(revive)
  : value&&typeof value==='object' ? Object.fromEntries(Object.entries(value).map(([key,child])=>[key,['date','nextRunAt','endAt','reminderAt','createdAt','updatedAt','occurrenceAt','reminderSentAt'].includes(key)&&typeof child==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(child)?Timestamp.fromDate(new Date(child)):revive(child)])) : value;
const profileFields=['displayName','currency','timezone','startPage','reminderEnabled','reminderHour','reminderLeadDays'];
function profileBackup(profile){return Object.fromEntries(profileFields.filter(key=>profile[key]!==undefined).map(key=>[key,profile[key]]));}
export async function backupJob(db,uid,input) {
  const { jobId, action }=input||{};
  if(!validId(jobId)||jobId.length>80) throw new DomainError('invalid-argument','Invalid backup job ID.');
  const owner=db.collection('users').doc(uid),job=owner.collection('backupJobs').doc(jobId);
  if(action==='start-export'||action==='start-restore') {
    const manifest=action==='start-restore'?validateManifest(input.manifest):null;
    return db.runTransaction(async tx=>{
      const [user,existing]=await tx.getAll(owner,job);
      if(existing.exists) { if(existing.get('kind')!==(manifest?'restore':'export') || (manifest&&existing.get('manifestHash')!==fingerprint(manifest))) fail('Job ID already used.'); return {status:existing.get('status')}; }
      if(user.get('schemaVersion')!==2||user.get('migration.status')!=='ready'||user.get('workspaceLock')) fail('Workspace is busy or not ready.');
      if(manifest&&input.requireEmpty){const currentRoot=owner.collection('workspaceVersions').doc(user.get('activeWorkspaceVersion'));const collections=await Promise.all(BUSINESS_COLLECTIONS.map(name=>tx.get(currentRoot.collection(name).limit(1))));if(collections.some(snapshot=>!snapshot.empty))fail('Import requires an empty cloud workspace. Existing records were not replaced.');}
      const pending=await tx.get(db.collection('reminderDeliveries').where('uid','==',uid).where('status','==','processing').limit(1));
      if(!pending.empty) fail('Wait for reminder deliveries to finish.');
      const record={kind:manifest?'restore':'export',status:'working',source:user.get('activeWorkspaceVersion'),page:0,collectionIndex:0,cursor:null,recordCount:0,pageHashes:[],profile:profileBackup(user.data()),createdAt:FieldValue.serverTimestamp(),...(manifest?{manifest,manifestHash:fingerprint(manifest),target:`restore_${jobId}`}:{})};
      tx.create(job,record);tx.update(owner,{workspaceLock:{jobId,kind:record.kind}});
      return {status:'working'};
    });
  }
  if(action==='abort') return db.runTransaction(async tx=>{const [user,state]=await tx.getAll(owner,job);if(!state.exists)fail('Unknown job.');if(state.get('status')==='ready')fail('Completed jobs cannot be aborted.');if(user.get('workspaceLock.jobId')===jobId)tx.update(owner,{workspaceLock:FieldValue.delete()});tx.update(job,{status:'aborted'});return {status:'aborted'};});
  const state=await job.get();if(!state.exists)fail('Unknown backup job.');
  if(action==='status')return {status:state.get('status'),page:state.get('page'),recordCount:state.get('recordCount')};
  if(action==='download'){
    if(state.get('kind')!=='export'||state.get('status')!=='ready')fail('Export is not ready.');
    if(input.page===undefined)return {manifest:{format:BACKUP_FORMAT,version:BACKUP_VERSION,schemaVersion:2,pageHashes:state.get('pageHashes'),recordCount:state.get('recordCount'),profile:state.get('profile')}};
    if(!Number.isInteger(input.page)||input.page<0||input.page>=state.get('page'))throw new DomainError('invalid-argument','Invalid page.');
    return {page:(await job.collection('pages').doc(String(input.page)).get()).get('rows')};
  }
  if(action==='export-page')return db.runTransaction(async tx=>{
    const [user,current]=await tx.getAll(owner,job);if(current.get('status')==='ready')return {status:'ready'};
    if(user.get('workspaceLock.jobId')!==jobId||current.get('kind')!=='export')fail('Export lock missing.');
    const index=current.get('collectionIndex'),name=BUSINESS_COLLECTIONS[index];
    if(!name){tx.update(job,{status:'ready'});tx.update(owner,{workspaceLock:FieldValue.delete()});return {status:'ready'};}
    const root=owner.collection('workspaceVersions').doc(current.get('source'));
    let query=root.collection(name).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if(current.get('cursor'))query=query.startAfter(current.get('cursor'));
    const snapshot=await tx.get(query);
    const rows=snapshot.docs.map(doc=>({collection:name,id:doc.id,data:encodeFirestore(doc.data())}));
    if(rows.some(row=>!validateBackupRecord(row)))fail('Invalid record.');
    if(JSON.stringify(rows).length>800000)fail('This page exceeds the safe payload size. Abort and use an operator export.');
    const page=current.get('page'),hashes=current.get('pageHashes');
    if(rows.length){tx.create(job.collection('pages').doc(String(page)),{rows});hashes.push(fingerprint(rows));}
    const recordCount=current.get('recordCount')+rows.length;if(recordCount>100000)fail('Export exceeds the supported record count.');
    tx.update(job,{page:page+(rows.length?1:0),pageHashes:hashes,recordCount,cursor:snapshot.size===PAGE_SIZE?snapshot.docs.at(-1).id:null,collectionIndex:index+(snapshot.size<PAGE_SIZE?1:0)});
    return {status:'working',recordCount};
  });
  if(action==='upload-page'){
    const page=input.page,rows=input.rows;
    if(!Number.isInteger(page)||page<0||!Array.isArray(rows)||rows.length>PAGE_SIZE||JSON.stringify(rows).length>800000)throw new DomainError('invalid-argument','Invalid restore page.');
    rows.forEach(validateBackupRecord);
    return db.runTransaction(async tx=>{
      const [user,current,uploaded]=await tx.getAll(owner,job,job.collection('pages').doc(String(page)));
      if(current.get('kind')!=='restore'||fingerprint(rows)!==current.get('manifest.pageHashes')[page])fail('Restore checksum mismatch.');
      if(uploaded.exists)return {status:'uploaded'};
      if(user.get('workspaceLock.jobId')!==jobId||current.get('status')!=='working')fail('Restore lock missing.');
      const target=owner.collection('workspaceVersions').doc(current.get('target'));
      const refs=rows.map(row=>target.collection(row.collection).doc(row.id));
      const existing=refs.length?await tx.getAll(...refs):[];
      if(existing.some(doc=>doc.exists)||new Set(refs.map(ref=>ref.path)).size!==refs.length)fail('Duplicate restore record.');
      rows.forEach((row,i)=>tx.create(refs[i],{...revive(row.data),ownerId:uid}));
      tx.create(job.collection('pages').doc(String(page)),{checksum:fingerprint(rows)});
      tx.update(job,{page:current.get('page')+1,recordCount:current.get('recordCount')+rows.length});
      return {status:'uploaded'};
    });
  }
  if(action==='finish-restore'){
    if(state.get('kind')!=='restore')fail('Not a restore job.');
    if(state.get('status')==='ready')return {status:'ready'};
    if(state.get('page')!==state.get('manifest.pageHashes').length||state.get('recordCount')!==state.get('manifest.recordCount'))fail('Restore is incomplete.');
    const target=owner.collection('workspaceVersions').doc(state.get('target'));
    const rows=(await Promise.all(BUSINESS_COLLECTIONS.map(async name=>(await readCollection(target.collection(name))).map(row=>({...row,collection:name}))))).flat();
    reconcileBackup(rows);
    return db.runTransaction(async tx=>{
      const [user,current]=await tx.getAll(owner,job);
      if(user.get('workspaceLock.jobId')!==jobId||current.get('status')!=='working')fail('Restore lock missing.');
      tx.set(target,{status:'ready',writable:false,restoredFrom:jobId});
      tx.update(owner,{...profileBackup(current.get("manifest.profile")),activeWorkspaceVersion:target.id,reminderReschedule:true,reminderCursor:null,workspaceLock:FieldValue.delete(),workspaceRevision:(user.get('workspaceRevision')||0)+1,ledgerRevision:(user.get('ledgerRevision')||0)+1,migration:{status:'ready',version:target.id}});
      tx.update(job,{status:'ready'});return {status:'ready',generation:target.id};
    });
  }
  throw new DomainError('invalid-argument','Unknown backup action.');
}
