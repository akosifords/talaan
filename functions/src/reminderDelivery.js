import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { fingerprint } from './workspaceMigration.js';
import { assertLegacyWritable } from './domain/workspace.js';
export async function deliverReminder(db, eventRef, now, send) {
  const root=eventRef.parent.parent;
  const modern=root?.parent.id==='workspaceVersions';
  const owner=modern?root.parent.parent:root;
  if(!owner||owner.parent.id!=='users')return 'ignored';
  const eventSnapshot=await eventRef.get();
  if(!eventSnapshot.exists)return 'ignored';
  const key=fingerprint({path:eventRef.path,at:eventSnapshot.get('reminderAt')});
  const delivery=db.collection('reminderDeliveries').doc(key);
  const claimed=await db.runTransaction(async tx=>{
    const [profile,event,existing]=await tx.getAll(owner,eventRef,delivery);
    if(profile.get('workspaceLock'))return null;
    if(modern){if(profile.get('activeWorkspaceVersion')!==root.id||profile.get('migration.status')!=='ready'||!profile.get('backendEnabled'))return null;}
    else {try{assertLegacyWritable(profile.data());}catch{return null;}}
    if(!event.exists||event.get('deleted')||event.get('status')==='completed'||event.get('type')!=='expense'||event.get('reminderSent')||!event.get('reminderAt')||event.get('reminderAt').toMillis()>now.toMillis())return null;
    if(fingerprint({path:eventRef.path,at:event.get('reminderAt')})!==key)return null;
    if(event.get('subscriptionId')){
      const subscription=await tx.get(root.collection('subscriptions').doc(event.get('subscriptionId')));
      if(subscription.exists&&(subscription.get('archived')||(subscription.get('status')==='cancelled'&&event.get('localDate')>=(subscription.get('endDate')||subscription.get('startDate')))))return null;
    }
    if(['sent','suppressed'].includes(existing.get('status'))||(existing.get('status')==='processing'&&existing.get('leaseUntil')?.toMillis()>now.toMillis()))return null;
    tx.set(delivery,{uid:owner.id,eventPath:eventRef.path,status:'processing',leaseUntil:Timestamp.fromMillis(now.toMillis()+5*60_000),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {profile:profile.data(),event:event.data()};
  });
  if(!claimed)return 'ignored';
  try {
    const suppressed=!claimed.profile.email||claimed.profile.emailSuppressed||!claimed.profile.reminderEnabled;
    if(!suppressed)await send({key,email:claimed.profile.email,name:claimed.event.name,date:claimed.event.localDate||claimed.event.date.toDate().toISOString().slice(0,10)});
    await db.runTransaction(async tx=>{
      const event=await tx.get(eventRef);
      tx.update(delivery,{status:suppressed?'suppressed':'sent',leaseUntil:null,sentAt:FieldValue.serverTimestamp()});
      if(event.exists&&fingerprint({path:eventRef.path,at:event.get('reminderAt')})===key)tx.update(eventRef,{reminderSent:true,reminderSentAt:FieldValue.serverTimestamp()});
    });
    return suppressed?'suppressed':'sent';
  } catch(error){await delivery.update({status:'failed',leaseUntil:null,updatedAt:FieldValue.serverTimestamp()});throw error;}
}
