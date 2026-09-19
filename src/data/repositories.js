import { cloudBackupClient } from "./backupClient.js";
import { localBackend } from "./localBackend.js";
import { backendState } from "./backendAdapter.js";
import { assertLegacyWritable, capabilities, validId, validateV2Event } from "../../functions/src/domain/workspace.js";
import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  limit,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import {
  eventConverter,
  goalConverter,
  guardrailToFirestore,
  profileToFirestore,
  reminderOffsetMinutes,
  recurringRule,
  toDateKey,
  toDollars,
} from "./converters";
import {
  validateEvent,
  validateGoal,
  validateProfile,
  validateSettings,
  validatedWorkspace,
} from "./validators";

const base = {
  entries: [],
  goals: [],
  profile: { name: "", startPage: "overview" },
  settings: {
    guardrails: { enabled: false, monthlyLimit: "" },
    reminders: {
      enabled: false,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      hour: 9,
      leadDays: 3,
    },
  },
  supporter: { active: false },
};
const keys = (id) => ({
  entries: `talaan-budget-v1-${id}`,
  goals: `talaan-goals-${id}`,
  profile: `talaan-profile-${id}`,
  settings: `talaan-settings-${id}`,
});
const parse = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const withReminder = (event, reminders = {}) => {
  if (
    !reminders.enabled ||
    event.type !== "expense" ||
    event.status === "completed"
  ) {
    return { ...event, reminderAt: null };
  }
  const occurrence = new Date(`${event.date}T12:00:00Z`);
  const offset = reminderOffsetMinutes(occurrence, reminders);
  return {
    ...event,
    reminderAt: new Date(occurrence.getTime() - offset * 60_000),
  };
};

export function createLocalRepository(id, seeds = {}) {
  const names = keys(id);
  const read = () => validatedWorkspace({
    entries: parse(names.entries, seeds.entries || []),
    goals: parse(names.goals, id === "demo" ? seeds.goals || [] : []),
    profile: parse(names.profile, base.profile),
    settings: parse(names.settings, base.settings),
  });
  const notify = () => window.dispatchEvent(new Event(`talaan:${id}`));
  const write = (field, value) => { localStorage.setItem(names[field], JSON.stringify(value)); notify(); };
  const strictRead = () => {
    const readJson = (field,fallback) => { const value=localStorage.getItem(names[field]); return value === null ? fallback : JSON.parse(value); };
    const raw={entries:readJson('entries',[]),goals:readJson('goals',[]),profile:readJson('profile',base.profile),settings:readJson('settings',base.settings)};
    if(!Array.isArray(raw.entries)||raw.entries.some(row=>!validateEvent(row))||!Array.isArray(raw.goals)||raw.goals.some(row=>!validateGoal(row))||!validateProfile(raw.profile)||!validateSettings(raw.settings))throw new Error('Local records need reconciliation before upgrade. No records were omitted or changed.');
    return raw;
  };
  const backend = localBackend(id, strictRead);
  return {
    kind: "local",
    command: value => backend.command(value),
    upgrade: date => backend.upgrade(date),
    exportModern: () => backend.export(),
    restoreModern: value => backend.restore(value),
    capabilities: capabilities(id === "demo" ? "sample" : "local"),
    subscribe(callback) {
      const emit = () => {
        const upgraded = backend.collections();
        callback({ ...base, ...read(), ...(upgraded ? backendState(upgraded, id) : {}),
          capabilities: capabilities(id === 'demo' ? 'sample' : 'local', upgraded?.metadata), loading: false });
      };
      emit(); window.addEventListener(`talaan:${id}`, emit); window.addEventListener("storage", emit);
      return () => { window.removeEventListener(`talaan:${id}`, emit); window.removeEventListener("storage", emit); };
    },
    async saveEvent(value) {
      if (!validateEvent(value)) throw new Error("Check the event fields.");
      const rows = read().entries;
      write("entries", rows.some((row) => row.id === value.id) ? rows.map((row) => row.id === value.id ? value : row) : [...rows, value]);
    },
    async deleteEvent(idToDelete) { write("entries", read().entries.filter((row) => row.id !== idToDelete)); },
    async saveGoal(value) {
      if (!validateGoal(value)) throw new Error("Check the goal fields.");
      const rows = read().goals;
      write("goals", rows.some((row) => row.id === value.id) ? rows.map((row) => row.id === value.id ? value : row) : [...rows, value]);
    },
    async deleteGoal(idToDelete) { write("goals", read().goals.filter((row) => row.id !== idToDelete)); },
    async saveProfile(value) { if (!validateProfile(value)) throw new Error("Check the profile."); write("profile", value); },
    async saveSettings(value) { if (!validateSettings(value)) throw new Error("Check settings."); write("settings", value); },
    async restore(value) {
      const checked = validatedWorkspace(value);
      Object.entries(names).forEach(([field, key]) => localStorage.setItem(key, JSON.stringify(checked[field])));
      notify();
    },
    async removeWorkspace() { await backend.remove(); Object.values(names).forEach((key) => localStorage.removeItem(key)); notify(); },
  };
}

export function createCloudRepository(user) {
  if (!db) throw new Error("Cloud sync is not configured.");
  const uid = user.uid;
  const userRef = doc(db, "users", uid);
  const events = collection(userRef, "events").withConverter(eventConverter(uid));
  const goals = collection(userRef, "goals").withConverter(goalConverter(uid));
  const rules = collection(userRef, "recurringRules");
  const guardrails = collection(userRef, "guardrails");
  let currentMetadata = {};
  let currentProfile = base.profile;
  let currentSettings = structuredClone(base.settings);
  return {
    kind: "cloud",
    upgrade: () => callWorkspaceFunction("enableWorkspace"),
    command: value => callWorkspaceFunction("workspaceCommand", value),
    exportModern: () => cloudBackupClient(callWorkspaceFunction, uid).export(),
    restoreModern: value => cloudBackupClient(callWorkspaceFunction, uid).restore(value),
    cancelBackup: () => cloudBackupClient(callWorkspaceFunction, uid).cancel(),
    importModern: value => cloudBackupClient(callWorkspaceFunction, uid).restore(value,true),
    subscribe(callback, fail) {
      let alive = true;
      let epoch = 0;
      let sourceKey;
      let stops = [];
      let state = structuredClone(base);
      let ready = new Set();
      let recurring = new Map();
      let readError;
      const emit = () => {
        if (!alive) return;
        if (readError) { fail(readError); return; }
        const loading = ready.size < 4;
        const entries = state.entries.map(entry => recurring.has(entry.id) ? { ...entry, recurring: recurring.get(entry.id) } : entry);
        callback({ ...state, entries, capabilities: capabilities('cloud', currentMetadata), loading,
          cloudEmpty: !loading && !entries.length && !state.goals.length });
      };
      const reject = error => { readError=error; if (alive) fail(error); };
      const stopProfile = onSnapshot(userRef, snapshot => {
        if (!alive) return;
        const data = snapshot.data() || {};
        currentMetadata = data;
        const version = data.schemaVersion ?? 1;
        if (![1, 2].includes(version) || (version === 2 && (!validId(data.activeWorkspaceVersion) || data.migration?.status !== 'ready'))) {
          epoch++; stops.forEach(stop => stop()); stops = [];
          state = structuredClone(base); ready = new Set(); emit();
          reject(new Error('This workspace version is unsupported or not ready. Update the app or retry later.')); return;
        }
        const key = version === 2 ? `${data.activeWorkspaceVersion}:${data.workspaceRevision || 0}` : 'legacy';
        if (key !== sourceKey) {
          // Keep mounted editors and their drafts while refreshing the same generation.
          // Account/generation changes still clear the old workspace immediately.
          const sameGeneration = version === 2 && sourceKey?.startsWith(`${data.activeWorkspaceVersion}:`) && ready.size === 4;
          epoch++; stops.forEach(stop => stop()); stops = [];
          if (!sameGeneration) { state = structuredClone(base); ready = new Set(); recurring = new Map(); }
          sourceKey = key;
          const root = userRef;
          const token = epoch;
          if (version === 2) {
            callWorkspaceFunction('loadWorkspace').then(result => {
              if (!alive || token !== epoch) return;
              state = { ...state, ...backendState(result, uid) };
              ready = new Set(['events','goals','recurringRules','guardrails']); emit();
            }).catch(error => { if (alive && token === epoch) reject(error); });
          }

          for (const name of version === 2 ? [] : ['events', 'goals', 'recurringRules', 'guardrails']) {
            stops.push(onSnapshot(query(collection(root, name), limit(241)), rows => {
              if (!alive || token !== epoch) return;
              try {
                if (rows.size > 240) throw new Error('This workspace exceeds the current reader limit. No partial totals are displayed.');
                if (name === 'events' || name === 'goals') {
                  const converter = name === 'events' ? eventConverter(uid) : goalConverter(uid);
                  const validate = name === 'events' ? validateEvent : validateGoal;
                  const records = rows.docs.map(item => {
                    const raw = item.data();
                    if (version === 2 && (raw.schemaVersion !== 2 || (name === 'events' && !validateV2Event({ ...raw, id: item.id })))) throw new Error('A workspace record needs reconciliation.');
                    const record = converter.fromFirestore(item);
                    if (!validate(record)) throw new Error('A workspace record is invalid. No partial totals are displayed.');
                    return record;
                  });
                  state[name === 'events' ? 'entries' : 'goals'] = records;
                } else if (name === 'recurringRules') {
                  recurring = new Map(rows.docs.map(item => {
                    const rule = item.data();
                    return [item.id, { frequency: rule.frequency, interval: rule.interval, ...(rule.endAt ? { endDate: toDateKey(rule.endAt) } : {}) }];
                  }));
                } else {
                  const item = rows.docs[0]?.data();
                  state.settings.guardrails = item ? { enabled: item.enabled, monthlyLimit: toDollars(item.limitCents) } : { enabled: false, monthlyLimit: '' };
                  currentSettings = structuredClone(state.settings);
                }
                ready.add(name); emit();
              } catch (error) { reject(error); }
            }, reject));
          }
        }
        state.profile = { name: data.displayName || '', startPage: data.startPage || 'overview' };
        currentProfile = state.profile;
        state.settings.reminders = { enabled: Boolean(data.reminderEnabled), timezone: data.timezone || state.settings.reminders.timezone,
          hour: data.reminderHour ?? 9, leadDays: data.reminderLeadDays ?? 3 };
        currentSettings = structuredClone(state.settings);
        state.supporter = data.supporter || { active: Boolean(data.supporterSince) };
        emit();
      }, reject);
      return () => { alive = false; epoch++; stopProfile(); stops.forEach(stop => stop()); };
    },
    async saveEvent(value) {
      assertLegacyWritable(currentMetadata);
      if (!validateEvent(value)) throw new Error("Check the event fields.");
      const batch = writeBatch(db);
      batch.set(
        doc(events, value.id),
        withReminder(value, currentSettings.reminders),
        { merge: true },
      );
      const ruleRef = doc(rules, value.id);
      const rule = recurringRule(uid, value, currentSettings.reminders);
      if (rule) batch.set(ruleRef, rule, { merge: true }); else batch.delete(ruleRef);
      await batch.commit();
    },
    async deleteEvent(id) {
      assertLegacyWritable(currentMetadata);
      const batch = writeBatch(db); batch.delete(doc(events, id)); batch.delete(doc(rules, id)); await batch.commit();
    },
    async saveGoal(value) { assertLegacyWritable(currentMetadata); await setDoc(doc(goals, value.id), value, { merge: true }); },
    async deleteGoal(id) { assertLegacyWritable(currentMetadata); await deleteDoc(doc(goals, id)); },
    async saveProfile(profile) {
      assertLegacyWritable(currentMetadata);
      if (!validateProfile(profile)) throw new Error("Check the profile.");
      await setDoc(
        userRef,
        profileToFirestore(
          uid,
          user,
          profile,
          currentSettings.reminders,
          false,
        ),
        { merge: true },
      );
    },
    async saveSettings(settings) {
      assertLegacyWritable(currentMetadata);
      if (!validateSettings(settings)) throw new Error("Check settings.");
      await setDoc(
        userRef,
        profileToFirestore(uid, user, currentProfile, settings.reminders),
        { merge: true },
      );
      if (settings.guardrails?.monthlyLimit) await setDoc(doc(guardrails, "monthly"), guardrailToFirestore(uid, settings.guardrails), { merge: true });
      else await deleteDoc(doc(guardrails, "monthly"));
      const [recurringSnapshot, eventSnapshot] = await Promise.all([
        getDocs(rules),
        getDocs(events),
      ]);
      if (!recurringSnapshot.empty || !eventSnapshot.empty) {
        const batch = writeBatch(db);
        eventSnapshot.docs.forEach((snapshot) => {
          batch.set(
            snapshot.ref,
            withReminder(snapshot.data(), settings.reminders),
            { merge: true },
          );
        });
        recurringSnapshot.docs.forEach((snapshot) => {
          batch.update(snapshot.ref, {
            reminderMinutesBefore: settings.reminders?.enabled
              ? reminderOffsetMinutes(
                  snapshot.data().nextRunAt.toDate(),
                  settings.reminders,
                )
              : deleteField(),
          });
        });
        await batch.commit();
      }
    },
    async migrate(value) {
      assertLegacyWritable(currentMetadata);
      const checked = validatedWorkspace(value);
      const recurringCount = checked.entries.filter(
        (item) => item.recurring?.frequency,
      ).length;
      const documentCount =
        checked.entries.length +
        checked.goals.length +
        recurringCount +
        (checked.settings.guardrails?.monthlyLimit ? 1 : 0);
      if (documentCount > 240) {
        throw new Error(
          "This plan is too large for automatic migration. Download a local backup first.",
        );
      }
      const batch = writeBatch(db);
      batch.set(
        userRef,
        profileToFirestore(
          uid,
          user,
          checked.profile,
          checked.settings.reminders,
        ),
        { merge: true },
      );
      checked.entries.forEach((item) => {
        batch.set(
          doc(events, item.id),
          withReminder(item, checked.settings.reminders),
        );
        const rule = recurringRule(uid, item, checked.settings.reminders); if (rule) batch.set(doc(rules, item.id), rule);
      });
      checked.goals.forEach((item) => batch.set(doc(goals, item.id), item));
      if (checked.settings.guardrails?.monthlyLimit) batch.set(doc(guardrails, "monthly"), guardrailToFirestore(uid, checked.settings.guardrails));
      await batch.commit();
    },
  };
}

export async function callWorkspaceFunction(name, payload = {}) {
  if (!functions) throw new Error("Cloud functions are not configured.");
  return (
    await httpsCallable(functions, name, {
      limitedUseAppCheckTokens: true,
    })(payload)
  ).data;
}
