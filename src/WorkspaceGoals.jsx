import { containDialogFocus } from './dialogFocus';
import { recordGoalContribution } from './goalPlanning';
import { useLayoutEffect, useRef, useState } from 'react';
import { money } from './WorkspaceSchedule';
import { monthsToGoal } from './planningData';
import './WorkspaceFlows.css';

export default function WorkspaceGoals({ workspace, today, page, state, setState, onNavigate }) {
  const goals = workspace.goals;
  const selected = goals.find(goal => goal.id === state.goal) || goals[0];
  const [form, setForm] = useState(null);
  const [contribution, setContribution] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef(null);
  const detail = useRef(null);
  const opener = useRef(null);
  const original = useRef('');
  useLayoutEffect(() => {
    if (!form) return;
    const trigger = opener.current;
    const y = window.scrollY;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current.showModal();
    dialog.current.querySelector('input')?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = overflow; (trigger?.isConnected ? trigger : document.getElementById('workspace-content'))?.focus({ preventScroll: true }); window.scrollTo(0, y); };
  }, [Boolean(form)]);
  function edit(goal, trigger) {
    opener.current = trigger;
    const next = { ...goal, contributions: goal.contributions || [] };
    original.current = JSON.stringify(next);
    setContribution(''); setError(''); setForm(next);
  }
  function close() {
    if (busy) return;
    if ((original.current !== JSON.stringify(form) || Number(contribution) > 0) && !window.confirm('Discard unsaved goal changes?')) return;
    setForm(null);
  }
  async function save(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    const amount = Number(contribution || 0);
    const now = new Date(`${today}T12:00:00`);
    const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const goal = { ...form, id: form.id || crypto.randomUUID(), name: form.name.trim(), target: Number(form.target), saved: Number(form.saved) };
    setBusy(true); setError('');
    try { await workspace.saveGoal(recordGoalContribution(goal, amount, date)); setState(previous => ({ ...previous, goal: goal.id })); setForm(null); } catch (reason) { setError(reason.message || 'Could not save this goal. Try again.'); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try { await workspace.deleteGoal(form.id); setForm(null); } catch (reason) { setError(reason.message || 'Could not remove this goal. Try again.'); } finally { setBusy(false); }
  }
  const monthly = selected ? state.monthly[selected.id] || 0 : 0;
  const months = selected ? selected.saved >= selected.target ? 0 : monthsToGoal(selected, monthly) : null;
  const finish = months === null ? null : new Date(Number(today.slice(0,4)), Number(today.slice(5,7)) - 1 + months, 1);
  return <section className="workspace-flows" aria-label="Savings goals"><div className="flow-toolbar"><p>{goals.length} savings {goals.length === 1 ? 'goal' : 'goals'} · {money(goals.reduce((sum, goal) => sum + goal.saved, 0))} saved</p><button className="ledger-add" onClick={event => edit({ name: '', target: '', saved: 0 }, event.currentTarget)}>+ New goal</button></div>{!goals.length ? <div className="schedule-empty"><h2>Your next goal starts here.</h2><p>Create a goal to track contributions and explore a savings timeline.</p></div> : <div className="flow-workbench"><nav className="flow-list" aria-label="Select a savings goal">{goals.map(goal => <button key={goal.id} aria-current={selected.id === goal.id ? 'true' : undefined} onClick={() => { setState(previous => ({ ...previous, goal: goal.id })); if (window.matchMedia('(max-width: 767px)').matches) { detail.current?.focus(); detail.current?.scrollIntoView({ block: 'start' }); } }}><span>{goal.saved >= goal.target ? 'Reached' : 'In progress'}</span><strong>{goal.name}</strong><p>{money(goal.saved)} <small>of {money(goal.target)}</small></p><progress aria-label={`${goal.name} savings progress`} max={goal.target} value={Math.min(goal.saved, goal.target)}/></button>)}</nav><section ref={detail} tabIndex={-1} className="flow-detail" aria-label={`${selected.name} details`}><div className="flow-heading"><div><span className="planning-kicker">{page === 'roadmap' ? 'SAVINGS ROADMAP' : 'GOAL DETAILS'}</span><h2>{selected.name}</h2></div><button className="text-action" onClick={event => edit(selected, event.currentTarget)}>Edit / contribute</button></div><div className="flow-metrics"><div><span>Already saved</span><strong>{money(selected.saved)}</strong></div><div><span>Still to go</span><strong>{money(Math.max(0, selected.target - selected.saved))}</strong></div></div><div className="flow-tabs" role="group" aria-label="Goal detail view"><button aria-pressed={page !== 'roadmap'} onClick={() => onNavigate('goals')}>Contributions</button><button aria-pressed={page === 'roadmap'} onClick={() => onNavigate('roadmap')}>Explore roadmap</button></div>{page === 'roadmap' ? <><h3>A steady path forward.</h3><p className="planning-caption">Try a monthly contribution. This estimate does not schedule payments or change your saved balance.</p><label className="planning-field">Trial monthly contribution (whole USD)<input type="number" min="0" max="100000" step="1" value={monthly} onChange={event => setState(previous => ({ ...previous, monthly: { ...previous.monthly, [selected.id]: Math.round(Math.max(0, Math.min(100000, Number(event.target.value) || 0))) } }))}/></label><div className="flow-outcome" role="status"><strong>{months === 0 ? 'Goal reached.' : finish ? `${finish.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · ${months} months` : 'Choose a contribution to see your timeline.'}</strong><p>Estimate from this month, with fixed contributions and no interest or investment returns.</p></div><button className="text-action" onClick={() => setState(previous => ({ ...previous, monthly: { ...previous.monthly, [selected.id]: 0 } }))}>Reset this estimate</button><p className="planning-caption">Trial amounts stay while you browse this workspace and reset on reload.</p></> : <><h3>Contribution history.</h3>{selected.contributions?.length ? <table className="flow-table"><caption className="sr-only">Contributions to {selected.name}</caption><thead><tr><th scope="col">Date</th><th scope="col">Amount</th></tr></thead><tbody>{[...selected.contributions].sort((a,b) => b.date.localeCompare(a.date)).map((item,index) => <tr key={`${item.date}-${index}`}><td><time dateTime={item.date}>{item.date}</time></td><td>{money(item.amount)}</td></tr>)}</tbody></table> : <p className="planning-caption">No contributions recorded yet. Any starting savings are included in the balance above.</p>}<p className="planning-caption">Contributions are recorded entries, not bank transfers.</p><button className="text-action" onClick={() => onNavigate('roadmap')}>See when you could reach this goal ↗</button></>}</section></div>}{form && <dialog onKeyDown={containDialogFocus} ref={dialog} className="entry-dialog event-editor" aria-label="Goal editor" onCancel={event => { event.preventDefault(); close(); }}><form onSubmit={save}><div className="event-editor-body"><div className="entry-heading"><h2>{form.id ? 'Edit goal' : 'New goal'}</h2><button type="button" aria-label="Close goal editor" onClick={close}>×</button></div>{error && <p role="alert" className="drawer-error">{error}</p>}<label>Goal name<input required maxLength="60" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label><label>Target (USD)<input required type="number" min="0.01" max="1000000" step="0.01" value={form.target} onChange={event => setForm({ ...form, target: event.target.value })}/></label><label>Already saved (USD)<input required type="number" min="0" max="1000000" step="0.01" value={form.saved} onChange={event => setForm({ ...form, saved: event.target.value })}/></label>{form.id && <label>Add contribution (USD)<input type="number" min="0" max="1000000" step="0.01" value={contribution} onChange={event => setContribution(event.target.value)}/></label>}<p className="planning-caption">Recording a contribution updates this goal’s saved balance. No money is transferred.</p></div><div className="event-editor-actions"><button className="ledger-save" disabled={busy}>{busy ? 'Saving…' : 'Save goal'}</button><div className="drawer-secondary"><button type="button" disabled={busy} onClick={close}>Cancel</button>{form.id && <button type="button" disabled={busy} onClick={remove}>Remove goal</button>}</div></div></form></dialog>}</section>;
}
