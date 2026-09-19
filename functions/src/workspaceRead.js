import { FieldPath } from 'firebase-admin/firestore';
import { BUSINESS_COLLECTIONS } from './domain/commands.js';
import { DomainError, validId } from './domain/workspace.js';
import { encodeFirestore } from './validation.js';
// Cursor pagination avoids a single unbounded Firestore query. Never silently truncate.
export async function readCollection(ref, maximum = 10000) {
  const records = []; let after;
  while (true) {
    let query = ref.orderBy(FieldPath.documentId()).limit(200);
    if (after) query = query.startAfter(after);
    const page = await query.get();
    records.push(...page.docs.map(doc => ({ id: doc.id, data: doc.data() })));
    if (records.length > maximum) throw new DomainError('resource-exhausted', `This operation supports at most ${maximum} records per collection. No partial result was returned.`);
    if (page.size < 200) return records;
    after = page.docs.at(-1);
  }
}
export async function readWorkspace(db, uid) {
  const owner = db.collection('users').doc(uid);
  for (let attempt = 0; attempt < 3; attempt++) {
    const profile = await owner.get();
    const generation = profile.get('activeWorkspaceVersion');
    if (profile.get('schemaVersion') !== 2 || !validId(generation) || profile.get('migration.status') !== 'ready') throw new DomainError('failed-precondition', 'Workspace is not ready.');
    const root = owner.collection('workspaceVersions').doc(generation);
    const collections = Object.fromEntries(await Promise.all(BUSINESS_COLLECTIONS.map(async name => [name, await readCollection(root.collection(name))])));
    const after = await owner.get();
    if (after.get('workspaceRevision') !== profile.get('workspaceRevision') || after.get('activeWorkspaceVersion') !== generation || after.get('migration.status') !== 'ready') continue;
    return { generation, workspaceRevision: profile.get('workspaceRevision') || 0, baselineRevision: profile.get('ledgerRevision') || 0, collections: encodeFirestore(collections) };
  }
  throw new DomainError('aborted', 'The workspace changed during loading. Retry to get a consistent view.');
}
