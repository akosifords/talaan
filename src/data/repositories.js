import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
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
    goals: parse(names.goals, []),
    profile: parse(names.profile, base.profile),
    settings: parse(names.settings, base.settings),
  });
  const notify = () => window.dispatchEvent(new Event(`talaan:${id}`));
  const write = (field, value) => { localStorage.setItem(names[field], JSON.stringify(value)); notify(); };
  return {
    kind: "local",
    subscribe(callback) {
      const emit = () => callback({ ...base, ...read(), loading: false });
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
    async removeWorkspace() { Object.values(names).forEach((key) => localStorage.removeItem(key)); notify(); },
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
  let currentProfile = base.profile;
  let currentSettings = structuredClone(base.settings);
  return {
    kind: "cloud",
    subscribe(callback, fail) {
      const state = structuredClone(base);
      const ready = { user: false, events: false, goals: false, rules: false, guardrails: false };
      let recurring = new Map();
      const emit = () => {
        const loading = !Object.values(ready).every(Boolean);
        const entries = state.entries.map((entry) => recurring.has(entry.id) ? { ...entry, recurring: recurring.get(entry.id) } : entry);
        callback({ ...state, entries, loading, cloudEmpty: !loading && !entries.length && !state.goals.length });
      };
      const stops = [
        onSnapshot(userRef, (snapshot) => {
          const data = snapshot.data() || {};
          state.profile = { name: data.displayName || "", startPage: data.startPage || "overview" };
          currentProfile = state.profile;
          state.settings.reminders = {
            enabled: Boolean(data.reminderEnabled),
            timezone: data.timezone || state.settings.reminders.timezone,
            hour: Number.isInteger(data.reminderHour) ? data.reminderHour : 9,
            leadDays: Number.isInteger(data.reminderLeadDays)
              ? data.reminderLeadDays
              : 3,
          };
          currentSettings = structuredClone(state.settings);
          state.supporter = data.supporter || { active: Boolean(data.supporterSince) };
          ready.user = true; emit();
        }, fail),
        onSnapshot(events, (snapshot) => { state.entries = snapshot.docs.map((item) => item.data()).filter(validateEvent); ready.events = true; emit(); }, fail),
        onSnapshot(goals, (snapshot) => { state.goals = snapshot.docs.map((item) => item.data()).filter(validateGoal); ready.goals = true; emit(); }, fail),
        onSnapshot(rules, (snapshot) => {
          recurring = new Map(snapshot.docs.map((item) => {
            const value = item.data();
            return [item.id, { frequency: value.frequency, interval: value.interval, ...(value.endAt ? { endDate: toDateKey(value.endAt) } : {}) }];
          }));
          ready.rules = true; emit();
        }, fail),
        onSnapshot(guardrails, (snapshot) => {
          const item = snapshot.docs[0]?.data();
          state.settings.guardrails = item ? { enabled: item.enabled, monthlyLimit: toDollars(item.limitCents) } : { enabled: false, monthlyLimit: "" };
          currentSettings = structuredClone(state.settings);
          ready.guardrails = true; emit();
        }, fail),
      ];
      return () => stops.forEach((stop) => stop());
    },
    async saveEvent(value) {
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
      const batch = writeBatch(db); batch.delete(doc(events, id)); batch.delete(doc(rules, id)); await batch.commit();
    },
    async saveGoal(value) { await setDoc(doc(goals, value.id), value, { merge: true }); },
    async deleteGoal(id) { await deleteDoc(doc(goals, id)); },
    async saveProfile(profile) {
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
