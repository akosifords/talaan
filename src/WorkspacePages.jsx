import Backup from "./Backup";
import { callWorkspaceFunction } from "./data/repositories";
import { useEffect, useRef, useState } from "react";

const cash = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);

export function Goals({ workspace }) {
  const { goals } = workspace;
  const [form, setForm] = useState(null);
  const [contribution, setContribution] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef(null);
  useEffect(() => {
    if (form && !dialog.current?.open) dialog.current?.showModal();
  }, [Boolean(form)]);

  async function save(event) {
    event.preventDefault();
    const contributionValue = Number(contribution || 0);
    const goal = {
      ...form,
      id: form.id || crypto.randomUUID(),
      name: form.name.trim(),
      target: Number(form.target),
      saved:
        Math.round((Number(form.saved || 0) + contributionValue) * 100) / 100,
      contributions: [
        ...(form.contributions || []),
        ...(contributionValue > 0
          ? [{ amount: contributionValue, date: new Date().toISOString().slice(0, 10) }]
          : []),
      ],
    };
    setBusy(true);
    try {
      await workspace.saveGoal(goal);
      setForm(null);
      setContribution("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="page-lede">
        Make room for what matters. Track savings targets at your own pace.
      </p>
      <div className="page-toolbar">
        <span>{goals.length} savings goals</span>
        <button
          className="ledger-add"
          onClick={() => setForm({ name: "", target: "", saved: 0 })}
        >
          + New goal
        </button>
      </div>
      <div className="goal-grid">
        {goals.map((goal) => (
          <button
            className="goal-card"
            key={goal.id}
            onClick={() => setForm({ ...goal, contributions: goal.contributions || [] })}
          >
            <div><span className="goal-mark">↗</span><span>{goal.saved >= goal.target ? "Reached" : "In progress"}</span></div>
            <h2>{goal.name}</h2>
            <strong>{cash(goal.saved)}<small> of {cash(goal.target)}</small></strong>
            <progress value={Math.min(goal.saved, goal.target)} max={goal.target} />
            <footer><span>{cash(Math.max(0, goal.target - goal.saved))} to go</span><span>Edit goal ›</span></footer>
          </button>
        ))}
      </div>
      {!goals.length && <p className="ledger-empty">Your next goal starts here.</p>}
      {form && (
        <dialog ref={dialog} className="entry-dialog" aria-label="Goal editor">
          <form onSubmit={save}>
            <div className="entry-heading">
              <h2>{form.id ? "Edit goal" : "New goal"}</h2>
              <button type="button" aria-label="Close goal editor" onClick={() => setForm(null)}>×</button>
            </div>
            <label>Goal name<input required maxLength="60" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Target (USD)<input required type="number" min="0.01" step="0.01" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></label>
            <label>Already saved (USD)<input required type="number" min="0" step="0.01" value={form.saved} onChange={(e) => setForm({ ...form, saved: e.target.value })} /></label>
            {form.id && <label>Add contribution (USD)<input type="number" min="0" step="0.01" value={contribution} onChange={(e) => setContribution(e.target.value)} /></label>}
            <button className="ledger-save form-save" disabled={busy}>{busy ? "Saving…" : "Save goal"}</button>
            {form.id && <button className="ledger-delete" type="button" disabled={busy} onClick={async () => { setBusy(true); try { await workspace.deleteGoal(form.id); setForm(null); } finally { setBusy(false); } }}>Remove goal</button>}
          </form>
        </dialog>
      )}
    </>
  );
}

export function Insights({ entries, month, onSchedule }) {
  const rows = entries.filter((entry) => entry.date.startsWith(month));
  const income = rows.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.amount, 0);
  const expense = rows.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0);
  const groups = Object.entries(
    rows.filter((entry) => entry.type === "expense").reduce(
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
  return <><div className="profile-summary"><div className="profile-avatar">{workspace.profile.name?.[0]?.toUpperCase() || "T"}</div><div><h2>{workspace.profile.name || "Your workspace"}</h2><p>{workspace.isCloud ? "Synced workspace" : "Local workspace"}{workspace.supporter?.active ? " · Supporter" : ""}</p></div></div><div className="more-links">{[["insights", "Insights", "Review your plan"], ["profile", "Profile", "Your name and workspace"], ["settings", "Settings & data", "Guardrails, reminders, and backup"], ["help", "Help & support", "Learn or send a message"]].map(([id, title, description], index) => <button key={id} onClick={() => onNavigate(id)}><span className="more-index">[0{index + 1}]</span><span><strong>{title}</strong><small>{description}</small></span><b>↗</b></button>)}</div></>;
}
