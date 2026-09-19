import { DomainError } from './domain/workspace.js';
export async function deleteWorkspaceData(db,uid) {
  const owner=db.collection('users').doc(uid);
  await db.runTransaction(async tx=>{
    const profile=await tx.get(owner);
    const deliveries=await tx.get(db.collection('reminderDeliveries').where('uid','==',uid).where('status','==','processing').limit(1));
    if(!deliveries.empty)throw new DomainError('failed-precondition','Wait for active reminders to finish before deleting this workspace.');
    if(profile.exists)tx.update(owner,{workspaceLock:{kind:'delete',jobId:'delete'},backendEnabled:false});
  });
  const related=await Promise.all(['donations','supportRequests','reminderDeliveries'].map(name=>db.collection(name).where('uid','==',uid).get()));
  const writer=db.bulkWriter();
  related.forEach(snapshot=>snapshot.docs.forEach(document=>writer.delete(document.ref)));
  writer.delete(db.collection('rateLimits').doc(`donation_${uid}`));writer.delete(db.collection('rateLimits').doc(`support_${uid}`));
  await writer.close();await db.recursiveDelete(owner);
}
