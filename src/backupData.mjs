export function validBackup(data){
 const positive=n=>Number.isFinite(n)&&n>0&&n<=999999999;
 const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 if(data?.version!==2||!Array.isArray(data.entries)||!Array.isArray(data.goals)||!data.profile||typeof data.profile.name!=='string'||!['overview','schedule','goals'].includes(data.profile.startPage))return false;
 if(!data.entries.every(e=>e&&typeof e.id==='string'&&typeof e.name==='string'&&typeof e.category==='string'&&['income','expense'].includes(e.type)&&positive(e.amount)&&validDate(e.date)&&(!e.status||['planned','completed'].includes(e.status))))return false;
 if(!data.goals.every(g=>g&&typeof g.id==='string'&&typeof g.name==='string'&&positive(g.target)&&Number.isFinite(g.saved)&&g.saved>=0&&(!g.contributions||(Array.isArray(g.contributions)&&g.contributions.every(c=>positive(c.amount)&&validDate(c.date))))))return false;
 return new Set(data.entries.map(e=>e.id)).size===data.entries.length&&new Set(data.goals.map(g=>g.id)).size===data.goals.length;
}
