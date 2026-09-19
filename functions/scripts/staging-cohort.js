import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const [uid,mode]=process.argv.slice(2);
const projectId=process.env.TALAAN_STAGING_PROJECT_ID;
if(!projectId||process.env.GCLOUD_PROJECT!==projectId||!['enable','disable'].includes(mode)||!process.env.TALAAN_STAGING_TEST_UIDS?.split(',').map(value=>value.trim()).includes(uid))throw new Error('Provide the exact staging project and an approved test UID.');
initializeApp({projectId});
const owner=getFirestore().collection('users').doc(uid);
await getFirestore().runTransaction(async tx=>{const profile=await tx.get(owner);if(profile.get('schemaVersion')!==2||profile.get('migration.status')!=='ready'||profile.get('workspaceLock'))throw new Error('Workspace must be verified and unlocked.');tx.update(owner,{backendEnabled:mode==='enable'});});
console.log(`Staging cohort ${mode} completed.`);
