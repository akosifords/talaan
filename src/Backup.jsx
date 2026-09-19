import { validateBackup } from "./data/backupClient";
import { validBackup } from "./backupData.mjs";
import { useState } from "react";

function validCloudBackup(data) {
  return Boolean(
    data?.version === 1 &&
      data.profile &&
      ["events", "goals", "recurringRules", "guardrails"].every(
        (name) =>
          Array.isArray(data[name]) &&
          data[name].every(
            (row) =>
              row &&
              typeof row.id === "string" &&
              /^[A-Za-z0-9_-]{1,128}$/.test(row.id) &&
              row.data &&
              typeof row.data === "object",
          ),
      ),
  );
}

function download(data) {
  if (data?.url) {
    location.assign(data.url);
    return;
  }
  const payload = data?.backup || data;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "talaan-backup.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Backup({ workspace }) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setBusy(true); setError(""); setStatus("");
    try {
      download(await workspace.exportWorkspace());
      setStatus("Your backup is ready.");
    } catch {
      setError("Could not create a backup. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function read(file) {
    setError(""); setPending(null); setStatus("");
    if (!file) return;
    try {
      if (file.size > 20000000) throw new Error();
      const data = JSON.parse(await file.text());
      if (workspace.capabilities?.schemaVersion===2) await validateBackup(data);
      else if (!(workspace.isCloud ? validCloudBackup(data) : validBackup(data))) throw new Error();
      setPending(data);
    } catch {
      setError(`Choose a valid Talaan ${workspace.isCloud ? "cloud" : "local"} backup, smaller than 20 MB.`);
    }
  }

  async function restore() {
    setBusy(true); setError("");
    try {
      await workspace.restore(pending);
      setPending(null);
      setStatus("Backup restored successfully.");
    } catch (reason) {
      setError(`${reason.message || "Restore interrupted."} Retry this backup to resume, or cancel the pending operation. Your current workspace stays intact until activation.`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Permanently delete this workspace and all its data?")) return;
    setBusy(true); setError("");
    try {
      await workspace.removeWorkspace();
      setStatus("Workspace data deleted.");
    } catch {
      setError("Workspace deletion failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="settings-block" aria-busy={busy}><h2>Backup & restore</h2><p>{workspace.isCloud ? "Cloud exports, restores, and deletion are processed securely by the backend." : "A full backup includes this local workspace."}</p><button className="ledger-add" disabled={busy} onClick={exportData}>{busy ? "Working…" : "Download full backup"}</button><label className="restore-label">Restore a backup<input type="file" accept="application/json,.json" disabled={busy} onChange={(event) => read(event.target.files[0])} /></label>{error && <><p role="alert">{error}</p>{workspace.isCloud&&<button className="text-action" onClick={async()=>{try{await workspace.cancelBackup();setError("");setStatus("Pending operation cancelled.");}catch(reason){setError(reason.message);}}}>Cancel pending backup operation</button>}</>}{status && <p role="status">{status}</p>}{pending && <div className="info-panel"><h3>Review before restoring</h3><p>{pending.manifest?.recordCount ?? ((pending.entries?.length || pending.events?.length || 0)+(pending.goals?.length||0))} records</p><p>This replaces this workspace’s data.</p><button className="ledger-add" disabled={busy} onClick={restore}>Replace with this backup</button><button className="text-action" onClick={() => setPending(null)}>Cancel</button></div>}<div className="danger-zone"><h3>Delete workspace</h3><p>This cannot be undone. Download a backup first if needed.</p><button className="ledger-delete" type="button" disabled={busy} onClick={remove}>Delete all workspace data</button></div></section>;
}
