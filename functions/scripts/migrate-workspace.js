import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { migrateWorkspace } from '../src/workspaceMigration.js';
const [uid, mode = 'dry-run', openingDate] = process.argv.slice(2);
const projectId = process.env.GCLOUD_PROJECT || 'demo-talaan';
if (!(process.env.FIRESTORE_EMULATOR_HOST&&projectId.startsWith('demo-')) && !(process.env.TALAAN_ALLOW_STAGING_MIGRATION==='true'&&projectId===process.env.TALAAN_STAGING_PROJECT_ID)) throw new Error('Use a demo emulator or the explicitly approved staging project.');
initializeApp({ projectId });
try {
  console.log(JSON.stringify(await migrateWorkspace(getFirestore(), uid, { mode, openingDate }), null, 2));
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
