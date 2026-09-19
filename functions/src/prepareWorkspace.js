import { FieldValue } from 'firebase-admin/firestore';
import { DomainError } from './domain/workspace.js';
export async function prepareWorkspace(db,uid,identity={}) {
  const owner=db.collection('users').doc(uid);
  return db.runTransaction(async tx=>{
    const profile=await tx.get(owner);
    if(profile.get('schemaVersion')===2)return {generation:profile.get('activeWorkspaceVersion')};
    if(profile.get('migration.status')==='copying'||profile.get('workspaceLock'))throw new DomainError('failed-precondition','Workspace is not ready.');
    const records=await Promise.all(['events','goals','recurringRules','guardrails'].map(name=>tx.get(owner.collection(name).limit(1))));
    if(records.some(snapshot=>!snapshot.empty))throw new DomainError('failed-precondition','This workspace needs the verified legacy migration before enabling v2.');
    const generation='initial-v2';
    tx.create(owner.collection('workspaceVersions').doc(generation),{status:'ready',writable:false,createdAt:FieldValue.serverTimestamp()});
    tx.set(owner,{...(profile.exists?{}:{ownerId:uid,email:identity.email||'',displayName:(identity.name||'').slice(0,60),currency:'usd',timezone:'UTC',startPage:'overview'}),schemaVersion:2,backendEnabled:true,activeWorkspaceVersion:generation,migration:{status:'ready',version:generation},workspaceRevision:0,ledgerRevision:0},{merge:true});
    return {generation};
  });
}
