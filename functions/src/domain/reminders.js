import { validTimezone, DomainError } from './workspace.js';
export function reminderInstant(occurrence, reminders) {
  const timezone=reminders.timezone||'UTC';
  if(!validTimezone(timezone))throw new DomainError('invalid-argument','Invalid reminder timezone.');
  const desired=Date.UTC(occurrence.getUTCFullYear(),occurrence.getUTCMonth(),occurrence.getUTCDate()-Number(reminders.leadDays||0),Number(reminders.hour??9));
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const represented=instant=>{
    const parts=Object.fromEntries(formatter.formatToParts(new Date(instant)).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
    return Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
  };
  const candidates=[...new Set([-2,0,2].map(days=>{const probe=desired+days*86400000;return desired-(represented(probe)-probe);}))];
  const exact=candidates.filter(instant=>represented(instant)===desired);
  // Fall-back overlap: first occurrence. Spring gap: next valid local time.
  if(exact.length)return new Date(Math.min(...exact));
  const later=candidates.filter(instant=>represented(instant)>desired).sort((a,b)=>represented(a)-represented(b)||a-b);
  if(later.length)return new Date(later[0]);
  throw new DomainError('invalid-argument','Could not resolve reminder time.');
}
// Legacy rules store a nonnegative lead offset; v2 stores the actual resolved instant.
export function reminderOffsetMinutes(occurrence,reminders) {
  return Math.min(43200,Math.max(0,Math.round((occurrence.getTime()-reminderInstant(occurrence,reminders).getTime())/60000)));
}
