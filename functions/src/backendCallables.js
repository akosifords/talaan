import { getAuth } from 'firebase-admin/auth';
import { prepareWorkspace } from './prepareWorkspace.js';
import { backupJob } from './backupJobs.js';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { requireAuth } from './validation.js';
import { executeCommand } from './commands.js';
import { readWorkspace } from './workspaceRead.js';
const options = { enforceAppCheck: true };
const errorCode = code => ['invalid-argument','failed-precondition','aborted','already-exists','resource-exhausted','not-found','unauthenticated'].includes(code) ? code : 'internal';
export const workspaceCommand = onCall(options, async request => {
  const uid = requireAuth(request); const started = Date.now();
  try {
    const result = await executeCommand(getFirestore(), uid, request.data);
    logger.info('workspace.command', { operation: request.data?.type, outcome: 'ok', durationMs: Date.now() - started });
    return result;
  } catch (error) {
    const code = errorCode(error.code);
    logger.warn('workspace.command', { operation: request.data?.type, outcome: code, durationMs: Date.now() - started });
    throw new HttpsError(code, code === 'internal' ? 'This change could not be saved. Retry with the same request.' : error.message);
  }
});
export const loadWorkspace = onCall(options, async request => {
  const uid = requireAuth(request);
  try { return await readWorkspace(getFirestore(), uid); }
  catch (error) { throw new HttpsError(errorCode(error.code), error.message); }
});

export const workspaceBackup = onCall(options, async request => {
  const uid = requireAuth(request);
  try { return await backupJob(getFirestore(), uid, request.data); }
  catch (error) { logger.warn('workspace.backup', { action: request.data?.action, outcome: errorCode(error.code) }); throw new HttpsError(errorCode(error.code), error.message); }
});

export const enableWorkspace = onCall(options, async request => {
  const uid=requireAuth(request);
  if(process.env.FUNCTIONS_EMULATOR!=='true'&&(process.env.WORKSPACE_V2_ENABLED!=='true'||!process.env.WORKSPACE_V2_ALLOWED_UIDS?.split(',').map(value=>value.trim()).includes(uid)))throw new HttpsError('failed-precondition','The new backend is not enabled for this environment yet.');
  try{const user=await getAuth().getUser(uid);if(user.disabled)throw new HttpsError('permission-denied','This account is disabled.');return await prepareWorkspace(getFirestore(),uid,{email:user.email,name:user.displayName});}catch(error){throw new HttpsError(errorCode(error.code),error.message);}
});
