import { nextOccurrence } from '../../functions/src/recurrence.js';
import { makeBackup, validateBackup } from "./backupClient.js";
import { executeTransactionCommand } from '../../functions/src/domain/executeCommand.js';
import { BUSINESS_COLLECTIONS } from '../../functions/src/domain/commands.js';
import { toCents, validDate } from '../../functions/src/domain/workspace.js';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const localFingerprint = value => JSON.stringify(canonical(value));
export function localBackend(id, legacyRead) {
  const key = `talaan-backend-v2-${id}`;
  const read = () => JSON.parse(localStorage.getItem(key) || 'null');
  const notify = () => window.dispatchEvent(new Event(`talaan:${id}`));
  const exclusive = work => {
    if (!navigator.locks) throw new Error('This browser cannot safely synchronize local edits. Use a browser with Web Locks support.');
    return navigator.locks.request(key, work);
  };
  const persist = data => { localStorage.setItem(key, JSON.stringify(data)); notify(); };
  return {
    read,
    async upgrade(openingDate) {
      return exclusive(async () => {
        if (read()) return;
        if (!validDate(openingDate)) throw new Error('An opening date is required.');
        const legacy = legacyRead();
        const generation = 'local-v2';
        const documents = {};
        const root = `users/${id}/workspaceVersions/${generation}`;
        const categories = [...new Set(legacy.entries.map(event => event.category || 'Uncategorized'))].sort();
        categories.forEach((name, index) => { documents[`${root}/categories/category-${index}`] = { ownerId: id, schemaVersion: 2, revision: 1, name, archived: false }; });
        legacy.entries.forEach(event => {
          documents[`${root}/events/${event.id}`] = { ...event, type: event.type === 'expense' && event.category === 'Savings' ? 'saving' : event.type, ownerId: id, schemaVersion: 2, revision: 1, currency: 'usd', amountCents: toCents(event.amount),
            ...(event.goalId&&event.status==='completed'?{legacyIncludedInOpening:true}:{}), localDate: event.date, date: `${event.date}T12:00:00Z`, categoryId: `category-${categories.indexOf(event.category || 'Uncategorized')}`, status: event.status || 'planned' };
        });
        legacy.entries.filter(event=>event.recurring?.frequency).forEach(event=>{
          const source=new Date(`${event.date}T12:00:00Z`);
          const template=documents[`${root}/events/${event.id}`];
          documents[`${root}/recurringRules/${event.id}`]={ownerId:id,schemaVersion:2,revision:1,enabled:true,frequency:event.recurring.frequency,interval:event.recurring.interval||1,anchorDay:source.getUTCDate(),anchorMonth:source.getUTCMonth(),nextRunAt:nextOccurrence(source,event.recurring.frequency,event.recurring.interval||1).toISOString(),endAt:event.recurring.endDate?`${event.recurring.endDate}T12:00:00Z`:null,timezone:legacy.settings.reminders.timezone,event:{name:template.name,type:template.type,amountCents:template.amountCents,currency:'usd',category:template.category||'Uncategorized',categoryId:template.categoryId,goalId:template.goalId||null}};
        });
        legacy.goals.forEach(goal => {
          if ((goal.contributions || []).reduce((sum, row) => sum + toCents(row.amount), 0) > toCents(goal.saved)) throw new Error(`Reconcile ${goal.name}: contribution history exceeds the saved balance.`);
          documents[`${root}/goals/${goal.id}`] = { ownerId: id, schemaVersion: 2, revision: 1, name: goal.name, currency: 'usd', targetCents: toCents(goal.target),
            currentCents: toCents(goal.saved), openingCents: toCents(goal.saved), openingDate, archived: false, historyMode: 'legacy-included-in-opening',
            contributions: (goal.contributions || []).map(row => ({ amountCents: toCents(row.amount), date: row.date })) };
        });
        documents[`users/${id}`] = { schemaVersion: 2, activeWorkspaceVersion: generation, backendEnabled: true, migration: { status: 'ready' }, workspaceRevision: 0, timezone: legacy.settings.reminders?.timezone || 'UTC' };
        localStorage.setItem(`${key}-legacy-backup`, JSON.stringify(legacy));
        persist({ generation, documents });
      });
    },
    async command(command) {
      return exclusive(async () => {
        const data = read(); if (!data) throw new Error('Enable the new workspace first.');
        const documents = structuredClone(data.documents);
        const ref = path => ({ path, collection: name => ref(`${path}/${name}`), doc: name => ref(`${path}/${name}`) });
        const snapshot = reference => ({ exists: Boolean(documents[reference.path]), data: () => documents[reference.path], get: field => field.split('.').reduce((value, part) => value?.[part], documents[reference.path]) });
        const db = { collection: ref, runTransaction: work => work({
          get: async reference => snapshot(reference), getAll: async (...refs) => refs.map(snapshot),
          set: (reference, value, options) => { documents[reference.path] = options?.merge ? { ...documents[reference.path], ...value } : value; },
          update: (reference, value) => { documents[reference.path] = { ...documents[reference.path], ...value }; },
          create: (reference, value) => { if (documents[reference.path]) throw new Error('Record already exists.'); documents[reference.path] = value; },
        }) };
        const result = await executeTransactionCommand(db, id, command, { fingerprint: localFingerprint, timestamp: date => date.toISOString(), serverTimestamp: () => new Date().toISOString() });
        persist({ ...data, documents }); return result;
      });
    },
    collections() {
      const data = read(); if (!data) return null;
      const root = `users/${id}/workspaceVersions/${data.generation}`;
      return { generation: data.generation, metadata: data.documents[`users/${id}`], collections: Object.fromEntries(BUSINESS_COLLECTIONS.map(name => [name,
        Object.entries(data.documents).filter(([path]) => path.startsWith(`${root}/${name}/`)).map(([path, value]) => ({ id: path.split('/').at(-1), data: value }))])) };
    },
    async export() {
      const data=read();if(!data)throw new Error('No upgraded workspace.');
      const root=`users/${id}/workspaceVersions/${data.generation}`;
      const rows=Object.entries(data.documents).filter(([path])=>BUSINESS_COLLECTIONS.some(name=>path.startsWith(`${root}/${name}/`))).map(([path,value])=>({collection:path.split('/').at(-2),id:path.split('/').at(-1),data:value}));
      const legacy=legacyRead();
      const meta=data.documents[`users/${id}`];
      return makeBackup(rows,{displayName:meta.displayName??legacy.profile.name,startPage:meta.startPage??legacy.profile.startPage,currency:'usd',timezone:meta.timezone??legacy.settings.reminders.timezone,reminderEnabled:meta.reminderEnabled??legacy.settings.reminders.enabled,reminderHour:meta.reminderHour??legacy.settings.reminders.hour,reminderLeadDays:meta.reminderLeadDays??legacy.settings.reminders.leadDays});
    },
    async restore(value) {
      const rows=await validateBackup(value);
      return exclusive(()=>{
        const previous=read();if(!previous)throw new Error('Upgrade this workspace before restoring a v2 backup.');
        const generation=`restore_${crypto.randomUUID()}`;
        const documents={...previous.documents};
        for(const row of rows)documents[`users/${id}/workspaceVersions/${generation}/${row.collection}/${row.id}`]={...row.data,ownerId:id};
        documents[`users/${id}`]={...documents[`users/${id}`],...value.manifest.profile,activeWorkspaceVersion:generation,workspaceRevision:(documents[`users/${id}`].workspaceRevision||0)+1};
        localStorage.setItem(`${key}-restore-backup`,JSON.stringify(previous));
        persist({generation,documents});
      });
    },
    async remove() { return exclusive(()=>{localStorage.removeItem(key);localStorage.removeItem(`${key}-legacy-backup`);localStorage.removeItem(`${key}-restore-backup`);notify();}); },
  };
}
