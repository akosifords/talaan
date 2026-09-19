import { FieldPath, FieldValue } from 'firebase-admin/firestore';
// Separate v2 queries avoid frozen legacy/staged records starving active work.
// Rotating legacy cursors bound each run while eventually visiting every old workspace.
export async function scheduledPage(db,collection,flag,dateField,through) {
  const state=db.collection('schedulerState').doc(collection);
  const cursor=await state.get();
  const base=db.collectionGroup(collection).where(flag,'==',flag==='enabled').where(dateField,'<=',through);
  let legacyQuery=base.orderBy(dateField).orderBy(FieldPath.documentId()).limit(100);
  if(cursor.get('date')&&cursor.get('path'))legacyQuery=legacyQuery.startAfter(cursor.get('date'),db.doc(cursor.get('path')));
  let modernQuery=base.where('schemaVersion','==',2).orderBy(dateField).orderBy(FieldPath.documentId()).limit(100);
  if(cursor.get('modernDate')&&cursor.get('modernPath'))modernQuery=modernQuery.startAfter(cursor.get('modernDate'),db.doc(cursor.get('modernPath')));
  const [legacy,modern]=await Promise.all([legacyQuery.get(),modernQuery.get()]);
  const last=legacy.docs.at(-1);
  const modernLast=modern.docs.at(-1);
  await state.set({...(legacy.size===100?{date:last.get(dateField),path:last.ref.path}:{date:FieldValue.delete(),path:FieldValue.delete()}),...(modern.size===100?{modernDate:modernLast.get(dateField),modernPath:modernLast.ref.path}:{modernDate:FieldValue.delete(),modernPath:FieldValue.delete()})},{merge:true});
  const docs=[...new Map([...legacy.docs,...modern.docs].map(doc=>[doc.ref.path,doc])).values()];
  return {docs,size:docs.length,batchFull:legacy.size===100||modern.size===100};
}
