import { validateManifest, reconcileBackup, PAGE_SIZE } from '../../functions/src/domain/backup.js';
export async function checksum(value) {
  const canonical = value => Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value))));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function makeBackup(rows, profile) {
  reconcileBackup(rows);
  const pages=Array.from({length:Math.ceil(rows.length/PAGE_SIZE)},(_,i)=>rows.slice(i*PAGE_SIZE,(i+1)*PAGE_SIZE));
  return {manifest:{format:'talaan-workspace',version:3,schemaVersion:2,recordCount:rows.length,pageHashes:await Promise.all(pages.map(checksum)),profile},pages};
}
export async function validateBackup(value) {
  validateManifest(value?.manifest);
  if(!Array.isArray(value.pages)||value.pages.length!==value.manifest.pageHashes.length)throw new Error('Backup pages are missing.');
  for(let i=0;i<value.pages.length;i++)if(!Array.isArray(value.pages[i])||value.pages[i].length>PAGE_SIZE||await checksum(value.pages[i])!==value.manifest.pageHashes[i])throw new Error('Backup checksum mismatch.');
  const rows=value.pages.flat();
  if(rows.length!==value.manifest.recordCount)throw new Error('Backup record count mismatch.');
  reconcileBackup(rows);return rows;
}
export function cloudBackupClient(call, uid) {
  const key=`talaan-backup-job-${uid}`;
  const operation=async(kind,manifest,requireEmpty=false)=>{
    let previous;try{previous=JSON.parse(sessionStorage.getItem(key));}catch{/* no pending job */}
    const intent=JSON.stringify({kind,manifest,requireEmpty});
    if(previous&&previous.intent!==intent)throw new Error('Resume or cancel the pending backup operation first.');
    const jobId=previous?.jobId||crypto.randomUUID();sessionStorage.setItem(key,JSON.stringify({jobId,intent}));
    await call('workspaceBackup',{jobId,action:kind==='export'?'start-export':'start-restore',...(manifest?{manifest,requireEmpty}:{})});
    return jobId;
  };
  return {
    async export() {
      const jobId=await operation('export');
      while((await call('workspaceBackup',{jobId,action:'export-page'})).status!=='ready'){/* Each call checkpoints progress. */}
      const {manifest}=await call('workspaceBackup',{jobId,action:'download'});
      const pages=[];for(let page=0;page<manifest.pageHashes.length;page++)pages.push((await call('workspaceBackup',{jobId,action:'download',page})).page);
      sessionStorage.removeItem(key);return {manifest,pages};
    },
    async restore(value,requireEmpty=false) {
      await validateBackup(value);
      const jobId=await operation('restore',value.manifest,requireEmpty);
      for(let page=0;page<value.pages.length;page++)await call('workspaceBackup',{jobId,action:'upload-page',page,rows:value.pages[page]});
      const result=await call('workspaceBackup',{jobId,action:'finish-restore'});sessionStorage.removeItem(key);return result;
    },
    async cancel() { const pending=JSON.parse(sessionStorage.getItem(key)||'null');if(pending){await call('workspaceBackup',{jobId:pending.jobId,action:'abort'});sessionStorage.removeItem(key);} },
  };
}
