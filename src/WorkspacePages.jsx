import Backup from "./Backup";
import { callWorkspaceFunction } from "./data/repositories";
import { useEffect, useState } from "react";

const cash = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);

export function Insights({ entries, month, onSchedule }) {
  const rows = entries.filter((entry) => entry.date.startsWith(month));
  const income = rows.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.amount, 0);
  const expense = rows.filter((entry) => entry.type !== "income").reduce((sum, entry) => sum + entry.amount, 0);
  const groups = Object.entries(
    rows.filter((entry) => entry.type !== "income").reduce(
      (result, entry) => ({
        ...result,
        [entry.category || "Uncategorized"]:
          (result[entry.category || "Uncategorized"] || 0) + entry.amount,
      }),
      {},
    ),
  ).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <p className="page-lede">A clearer picture of your monthly plan. Totals include scheduled items, not confirmed bank activity.</p>
      {!rows.length ? (
        <div className="empty-panel"><h2>A fresh month.</h2><p>Add money events to see your breakdown.</p><button className="ledger-add" onClick={onSchedule}>Go to Schedule</button></div>
      ) : (
        <>
          <div className="insight-totals"><div><span>Planned income</span><strong>{cash(income)}</strong></div><div><span>Planned out</span><strong>{cash(expense)}</strong></div></div>
          <section className="report-section"><span className="report-kicker">[01] ALLOCATION</span><h2>Where the plan goes.</h2>
            {groups.map(([name, total], index) => <div className="report-category" key={name}><div><span>{name}</span><strong>{cash(total)}</strong></div><progress className={`report-bar bar-${index}`} value={total} max={Math.max(1, expense)} /><small>{Math.round(total / expense * 100)}% of planned outflow</small></div>)}
          </section>
        </>
      )}
      <button className="text-action" onClick={onSchedule}>Review events ↗</button>
    </>
  );
}

function SupportForm() {
  const [form, setForm] = useState({ subject: "", message: "" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      await callWorkspaceFunction("sendSupportMessage", form);
      setForm({ subject: "", message: "" });
      setStatus("Your message was sent. We’ll get back to you soon.");
    } catch {
      setStatus("We could not send that message. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return <form className="settings-form" onSubmit={submit}><label>Subject<input required maxLength="120" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label><label>Message<textarea required rows="6" maxLength="5000" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></label><button className="ledger-save" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>{status && <p role={status.startsWith("We could") ? "alert" : "status"}>{status}</p>}</form>;
}

export function MorePages({ page, onNavigate, workspace }) {
  const [profile, setProfile] = useState(workspace.profile);
  const [settings, setSettings] = useState(workspace.settings);
  const [status, setStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setProfile(workspace.profile), [workspace.profile]);
  useEffect(() => setSettings(workspace.settings), [workspace.settings]);
  const save = async (work, message) => {
    setBusy(true); setStatus(""); setSaveError("");
    try {
      await work();
      setStatus(message);
    } catch (error) {
      setSaveError(error?.message || "Your changes could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  if (page === "profile") return <><p className="page-lede">Make this workspace yours.</p><form className="settings-form" onSubmit={(e) => { e.preventDefault(); void save(() => workspace.saveProfile({ ...profile, name: profile.name.trim() }), "Profile saved."); }}><label>Display name<input maxLength="60" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label><button className="ledger-save" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>{status && <p role="status">{status}</p>}{saveError && <p role="alert">{saveError}</p>}</form></>;
  if (page === "settings") {
    const guardrails = settings.guardrails || {};
    const reminders = settings.reminders || {};
    return <><p className="page-lede">Your workspace, your preferences.</p><form className="settings-form" onSubmit={(e) => { e.preventDefault(); void save(async () => { await workspace.saveProfile(profile); await workspace.saveSettings(settings); }, "Preferences saved."); }}>
      <section className="settings-block"><h2>Preferences</h2><label>Open dashboard on<select value={profile.startPage} onChange={(e) => setProfile({ ...profile, startPage: e.target.value })}><option value="overview">Overview</option><option value="schedule">Schedule</option><option value="goals">Goals</option></select></label></section>
      <section className="settings-block"><h2>Spending guardrail</h2><label className="check-label"><input type="checkbox" checked={Boolean(guardrails.enabled)} onChange={(e) => setSettings({ ...settings, guardrails: { ...guardrails, enabled: e.target.checked } })} /> Warn me when planned monthly outflow exceeds my limit</label><label>Monthly limit (USD)<input type="number" min="0.01" step="0.01" required={guardrails.enabled} value={guardrails.monthlyLimit || ""} onChange={(e) => setSettings({ ...settings, guardrails: { ...guardrails, monthlyLimit: e.target.value } })} /></label></section>
      <section className="settings-block"><h2>Reminders</h2><label className="check-label"><input type="checkbox" checked={Boolean(reminders.enabled)} onChange={(e) => setSettings({ ...settings, reminders: { ...reminders, enabled: e.target.checked } })} /> Send bill reminders</label><label>Timezone<input required value={reminders.timezone || ""} onChange={(e) => setSettings({ ...settings, reminders: { ...reminders, timezone: e.target.value } })} /></label><div className="entry-fields"><label>Reminder hour<select value={reminders.hour ?? 9} onChange={(e) => setSettings({ ...settings, reminders: { ...reminders, hour: Number(e.target.value) } })}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label><label>Lead days<input type="number" min="0" max="30" step="1" value={reminders.leadDays ?? 3} onChange={(e) => setSettings({ ...settings, reminders: { ...reminders, leadDays: Number(e.target.value) } })} /></label></div></section>
      <button className="ledger-save" disabled={busy}>{busy ? "Saving…" : "Save preferences"}</button>{status && <p role="status">{status}</p>}{saveError && <p role="alert">{saveError}</p>}
    </form><Backup workspace={workspace} /></>;
  }
  if (page === "help") return <><p className="page-lede">A little guidance, when you need it.</p><div className="help-list">{[["How do I start?", "Open Schedule and add a payday or expense."], ["Where is my data stored?", workspace.isCloud ? "Your signed-in workspace synchronizes with Firestore in real time." : "This workspace stays in this browser."]].map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div><div className="info-panel"><h2>Need a hand?</h2><SupportForm /></div></>;
  return <><div className="profile-summary"><div className="profile-avatar">{workspace.profile.name?.[0]?.toUpperCase() || "T"}</div><div><h2>{workspace.profile.name || "Your workspace"}</h2><p>{workspace.isCloud ? "Synced workspace" : "Local workspace"}{workspace.supporter?.active ? " · Supporter" : ""}</p></div></div><div className="more-links">{[["insights", "Insights", "Review your plan"], ["profile", "Profile", "Your name and workspace"], ["settings", "Settings & data", "Guardrails, reminders, and backup"], ["help", "Help & support", "Learn or send a message"], ["design-review", "Design review", "Inspect screen states"]].map(([id, title, description], index) => <button key={id} onClick={() => onNavigate(id)}><span className="more-index">[0{index + 1}]</span><span><strong>{title}</strong><small>{description}</small></span><b>↗</b></button>)}</div></>;
}
