import { eventPayload } from "./backendAdapter.js";
import { toCents } from "../../functions/src/domain/workspace.js";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import {
  callWorkspaceFunction,
  createCloudRepository,
  createLocalRepository,
} from "./repositories";
import { readValidatedPersonalWorkspace } from "./validators";

const emptyState = {
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
  loading: true,
  capabilities: { write: false, planning: false },
};

export default function useWorkspace({ user, storageId, seeds }) {
  const pending = useRef(new Map());
  const [state, setState] = useState(emptyState);
  const [error, setError] = useState("");
  const [connectionAttempt,setConnectionAttempt]=useState(0);
  const [migration, setMigration] = useState(null);
  const repository = useMemo(
    () =>
      user
        ? createCloudRepository(user)
        : createLocalRepository(storageId, seeds),
    [user?.uid, storageId],
  );

  useEffect(() => {
    let active = true;
    setState(emptyState);
    setMigration(null);
    setError("");
    const unsubscribe = repository.subscribe(
      (next) => {
        if (!active) return;
        setError("");
        setState(next);
        if (
          repository.kind === "cloud" &&
          next.cloudEmpty &&
          !sessionStorage.getItem(`talaan-migration-prompted-${user.uid}`)
        ) {
          if (localStorage.getItem('talaan-backend-v2-personal')) {
            createLocalRepository('personal').exportModern().then(backup=>{if(active)setMigration({modern:true,backup,entries:[],goals:[]});}).catch(reason=>{if(active)setError(reason.message);});
            sessionStorage.setItem(`talaan-migration-prompted-${user.uid}`, '1');
            return;
          }
          const personal = readValidatedPersonalWorkspace();
          if (
            personal &&
            (personal.entries.length ||
              personal.goals.length ||
              personal.profile.name)
          ) {
            setMigration(personal);
          }
          sessionStorage.setItem(`talaan-migration-prompted-${user.uid}`, "1");
        }
      },
      (reason) => {
        if (!active) return;
        setState({ ...emptyState, loading: false });
        setError(reason?.message || "Cloud sync is unavailable. Check your connection and retry.");
      },
    );
    return () => { active = false; unsubscribe(); };
  }, [repository, user?.uid, connectionAttempt]);

  const action = useCallback(
    async (work) => {
      setError("");
      try {
        return await work();
      } catch (reason) {
        setError(reason?.message || "That change could not be saved.");
        throw reason;
      }
    },
    [],
  );

  const command = (type, entityId, payload, expectedRevision = 0) => action(async () => {
    const intent = { generation: state.generation, type, entityId, payload, expectedRevision };
    const key = JSON.stringify(intent);
    const storageKey = `talaan-pending-command-${user?.uid || storageId}`;
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(storageKey)); } catch { /* no saved request */ }
    const request = pending.current.get(key) || (saved?.intent === key ? saved.request : { ...intent, requestId: crypto.randomUUID() });
    pending.current.set(key, request); sessionStorage.setItem(storageKey, JSON.stringify({ intent: key, request }));
    const result = await repository.command(request);
    sessionStorage.removeItem(storageKey);
    return result;
  });
  const modern = state.capabilities?.schemaVersion === 2;
  const saveGoal = (value, contribution = 0, date) => {
    const existing = Boolean(value.revision);
    return command('goals.save', value.id, { name: value.name, targetCents: toCents(value.target),
      ...(existing ? {} : { openingCents: toCents(value.saved), openingDate: date || new Date().toISOString().slice(0, 10) }),
      ...(contribution ? { contributionCents: toCents(contribution), contributionDate: date } : {}) }, value.revision || 0);
  };
  const savePreferences = (profile, settings) => command('preferences.save','main',{
    name:profile.name,startPage:profile.startPage,timezone:settings.reminders.timezone,
    reminderEnabled:Boolean(settings.reminders.enabled),reminderHour:Number(settings.reminders.hour),reminderLeadDays:Number(settings.reminders.leadDays),
    guardrailEnabled:Boolean(settings.guardrails.enabled),guardrailCents:toCents(Number(settings.guardrails.monthlyLimit)||0),
  },state.preferenceRevision||0);
  return {
    ...state,
    command,
    upgrade: date => action(() => repository.upgrade(date)),
    error,
    clearError: () => setError(""),
    retry: () => setConnectionAttempt(value=>value+1),
    isCloud: repository.kind === "cloud",
    migration,
    dismissMigration: () => setMigration(null),
    migratePersonal: () =>
      action(async () => {
        if(modern || migration.modern) {
          if(!modern)await repository.upgrade();
          const personal=createLocalRepository('personal');
          if(!migration.modern)await personal.upgrade(new Date().toISOString().slice(0,10));
          await repository.importModern(migration.backup || await personal.exportModern());
        } else await repository.migrate(migration);
        setMigration(null);
      }),
    saveEvent: (value) => modern ? command('events.save', value.id, eventPayload(value, state.categories), value.revision || 0) : action(() => repository.saveEvent(value)),
    deleteEvent: (id) => modern ? command('events.remove', id, {}, state.entries.find(row => row.id === id)?.revision || 0) : action(() => repository.deleteEvent(id)),
    saveGoal: (value, contribution, date) => modern ? saveGoal(value, contribution, date) : action(() => repository.saveGoal(value)),
    deleteGoal: (id) => modern ? command('goals.remove', id, {}, state.goals.find(row => row.id === id)?.revision || 0) : action(() => repository.deleteGoal(id)),
    saveProfile: (value) => modern ? savePreferences(value,state.settings) : action(() => repository.saveProfile(value)),
    saveSettings: (value) => modern ? savePreferences(state.profile,value) : action(() => repository.saveSettings(value)),
    cancelBackup: () => action(() => repository.cancelBackup?.()),
    restore: (value) =>
      action(() => modern ? repository.restoreModern(value) :
        repository.kind === "cloud"
          ? callWorkspaceFunction("restoreWorkspace", { backup: value })
          : repository.restore(value),
      ),
    removeWorkspace: () =>
      action(async () => {
        if (repository.kind === "cloud") {
          const result = await callWorkspaceFunction("deleteAccount");
          for(const key of [`talaan-event-draft-${user.uid}`,`talaan-pending-command-${user.uid}`,`talaan-backup-job-${user.uid}`])sessionStorage.removeItem(key);
          if (auth) await signOut(auth);
          location.hash = "home";
          return result;
        }
        await repository.removeWorkspace();
        for(const key of [`talaan-event-draft-${storageId}`,`talaan-pending-command-${storageId}`,`talaan-backup-job-${storageId}`])sessionStorage.removeItem(key);
      }),
    exportWorkspace: () =>
      action(() => modern ? repository.exportModern() :
        repository.kind === "cloud"
          ? callWorkspaceFunction("exportWorkspace")
          : Promise.resolve({
              version: 2,
              entries: state.entries,
              goals: state.goals,
              profile: state.profile,
              settings: state.settings,
            }),
      ),
  };
}
