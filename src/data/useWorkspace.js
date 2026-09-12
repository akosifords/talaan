import { useCallback, useEffect, useMemo, useState } from "react";
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
};

export default function useWorkspace({ user, storageId, seeds }) {
  const [state, setState] = useState(emptyState);
  const [error, setError] = useState("");
  const [migration, setMigration] = useState(null);
  const repository = useMemo(
    () =>
      user
        ? createCloudRepository(user)
        : createLocalRepository(storageId, seeds),
    [user?.uid, storageId],
  );

  useEffect(() => {
    setState(emptyState);
    setError("");
    return repository.subscribe(
      (next) => {
        setState(next);
        if (
          repository.kind === "cloud" &&
          next.cloudEmpty &&
          !sessionStorage.getItem(`talaan-migration-prompted-${user.uid}`)
        ) {
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
      () => setError("Cloud sync is unavailable. Check your connection and retry."),
    );
  }, [repository, user?.uid]);

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

  return {
    ...state,
    error,
    clearError: () => setError(""),
    isCloud: repository.kind === "cloud",
    migration,
    dismissMigration: () => setMigration(null),
    migratePersonal: () =>
      action(async () => {
        await repository.migrate(migration);
        setMigration(null);
      }),
    saveEvent: (value) => action(() => repository.saveEvent(value)),
    deleteEvent: (id) => action(() => repository.deleteEvent(id)),
    saveGoal: (value) => action(() => repository.saveGoal(value)),
    deleteGoal: (id) => action(() => repository.deleteGoal(id)),
    saveProfile: (value) => action(() => repository.saveProfile(value)),
    saveSettings: (value) => action(() => repository.saveSettings(value)),
    restore: (value) =>
      action(() =>
        repository.kind === "cloud"
          ? callWorkspaceFunction("restoreWorkspace", { backup: value })
          : repository.restore(value),
      ),
    removeWorkspace: () =>
      action(async () => {
        if (repository.kind === "cloud") {
          const result = await callWorkspaceFunction("deleteAccount");
          if (auth) await signOut(auth);
          location.hash = "home";
          return result;
        }
        return repository.removeWorkspace();
      }),
    exportWorkspace: () =>
      action(() =>
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
