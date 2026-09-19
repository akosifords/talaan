import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { reminderInstant } from './domain/reminders.js';
export async function rescheduleReminders(db,owner) {
  return db.runTransaction(async tx=>{
    const profile=await tx.get(owner);
    if(!profile.exists||!profile.get('reminderReschedule')||profile.get('workspaceLock')||profile.get('migration.status')!=='ready'||profile.get('schemaVersion')!==2)return 0;
    const root=owner.collection('workspaceVersions').doc(profile.get('activeWorkspaceVersion'));
    let query=root.collection('events').orderBy(FieldPath.documentId()).limit(100);
    if(profile.get('reminderCursor'))query=query.startAfter(profile.get('reminderCursor'));
    const snapshot=await tx.get(query);
    for(const event of snapshot.docs){
      const eligible=profile.get('reminderEnabled')&&!event.get('deleted')&&event.get('type')==='expense'&&event.get('status')!=='completed';
      const reminderAt=eligible?Timestamp.fromDate(reminderInstant(new Date(`${event.get('localDate')}T12:00:00Z`),{timezone:profile.get('timezone'),hour:profile.get('reminderHour'),leadDays:profile.get('reminderLeadDays')})):null;
      tx.update(event.ref,{reminderAt,...(eligible?{reminderSent:false}:{})});
    }
    tx.update(owner,{reminderReschedule:snapshot.size===100,reminderCursor:snapshot.size===100?snapshot.docs.at(-1).id:null});
    return snapshot.size;
  });
}
