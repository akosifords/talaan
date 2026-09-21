// Package the workspace callables separately while external provider setup is pending.
// Copies the same tested sources; it does not replace the full Functions entry point.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.firebase/staging-workspace-functions');
await mkdir(output, { recursive: true });
await cp(path.join(root, 'functions/src'), path.join(output, 'src'), { recursive: true });
const manifest = JSON.parse(await readFile(path.join(root, 'functions/package.json'), 'utf8'));
manifest.main = 'src/workspace-entry.js';
await writeFile(path.join(output, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
await cp(path.join(root, 'functions/package-lock.json'), path.join(output, 'package-lock.json'));
await cp(path.join(root, 'functions/.env.talaan-staging-fordan'), path.join(output, '.env.talaan-staging-fordan'));
await writeFile(path.join(output, 'src/workspace-entry.js'), `import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';
initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 2 });
export { workspaceCommand, loadWorkspace, workspaceBackup, enableWorkspace } from './backendCallables.js';
`);
await writeFile(path.join(root, '.firebase/workspace-deploy.json'), JSON.stringify({functions:{source:'staging-workspace-functions',runtime:'nodejs22'}}, null, 2)+'\n');
console.log('Prepared staging workspace Functions package under .firebase.');
