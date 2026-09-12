import useRoute from "./useRoute";
import { Goals, Insights, MorePages } from "./WorkspacePages";
import NavIcon from "./NavIcon";
import useWorkspace from "./data/useWorkspace";
import { useEffect, useRef, useState } from 'react';

const categories = ['Bills & subscriptions', 'Everyday spending', 'Savings'];
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
function seed() {
  const now = new Date();
  const date = day => dateKey(new Date(now.getFullYear(),now.getMonth(),day));
  return [
    ['Rent',1200,'expense',categories[0],1],['Utilities',250,'expense',categories[0],4],
    ['Subscriptions',450,'expense',categories[0],20],['Groceries',600,'expense',categories[1],10],
    ['Transport',310,'expense',categories[1],22],['Emergency fund',570,'expense',categories[2],28],
    ['Payday',1900,'income','',15],['Payday',1900,'income','',new Date(now.getFullYear(),now.getMonth()+1,0).getDate()],
  ].map(([name,amount,type,category,day],i)=>({id:`sample-${i}`,name,amount,type,category,date:date(day)}));
}
function Smiley({ mood }) {
  const worried = mood === 'Over budget';
  const cautious = mood === 'Getting tight' || mood === 'No plan yet';
  return <svg className="budget-face" viewBox="0 0 100 100" role="img" aria-label={mood}>
    <path d="M89 52C89 76 73 92 50 92S10 77 10 52 25 10 50 10 89 28 89 52Z" fill="#a83e29"/>
    <path d="M86 47C86 70 70 87 47 87S7 71 7 47 23 6 47 6 86 23 86 47Z" fill="#efdfb5" stroke="#25231f" strokeWidth="2.5"/>
    <path d={worried ? 'M25 27l12 5M55 32l12-5' : 'M24 27q6-6 13-2M54 25q7-4 13 2'} fill="none" stroke="#25231f" strokeWidth="2.5" strokeLinecap="round"/>
    <ellipse cx="33" cy="40" rx="6" ry="10" fill="#25231f"/><ellipse cx="59" cy="40" rx="6" ry="10" fill="#25231f"/>
    <path d="M29 31l6 8-9-1M55 31l6 8-9-1" fill="#efdfb5"/>
    <path d="M45 43q-6 10 4 9" fill="none" stroke="#25231f" strokeWidth="2" strokeLinecap="round"/>
    {worried ? <path d="M29 67q18-18 36 0" fill="none" stroke="#25231f" strokeWidth="3" strokeLinecap="round"/> : cautious ? <path d="M31 64q16 4 32-1" fill="none" stroke="#25231f" strokeWidth="3" strokeLinecap="round"/> : <><path d="M26 57q20 10 42-1Q61 79 46 77 32 75 26 57Z" fill="#25231f"/><path d="M30 59q17 7 34-1l-4 7q-14 5-26-1Z" fill="#fff6df"/><path d="M39 74q8-10 18-2-8 7-18 2Z" fill="#bd543a"/></>}
    <path d="M20 54l6-2M69 51l6 2" stroke="#25231f" strokeWidth="2" strokeLinecap="round"/>
  </svg>;
}
export default function Dashboard({ storageId = 'demo', user = null }) {
  const workspace=useWorkspace({user,storageId,seeds:{entries:seed()}});
  const entries=workspace.entries;
  const [tab,setTab]=useRoute(user?'workspace':storageId==='personal'?'personal':'dashboard',workspace.profile.startPage||'overview');
  const [query,setQuery]=useState('');
  const [kind,setKind]=useState('all');
  const [form,setForm]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(`talaan-event-draft-${storageId}`))||null;}catch{return null;}});
  const [removed,setRemoved]=useState(null);
  const [busy,setBusy]=useState(false);
  const dialog=useRef(null);
  const originalForm=useRef(null);
  const today=dateKey(new Date());
  const [month,setMonth]=useState(today.slice(0,7));
  const monthly=entries.filter(e=>e.date.startsWith(month));
  const income=monthly.filter(e=>e.type==='income').reduce((a,e)=>a+Math.round(e.amount*100),0)/100;
  const out=monthly.filter(e=>e.type==='expense').reduce((a,e)=>a+Math.round(e.amount*100),0)/100;
  const available=Math.round((income-out)*100)/100;
  const guardrail=workspace.settings.guardrails||{};
  const overGuardrail=guardrail.enabled&&Number(guardrail.monthlyLimit)>0&&out>Number(guardrail.monthlyLimit);
  const mood=!monthly.length?'No plan yet':available<0?'Over budget':available<income*.1?'Getting tight':'Room to breathe';
  const scheduled=monthly.filter(e=>(kind==='all'||e.type===kind)&&`${e.name} ${e.category}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.date.localeCompare(b.date));
  const next=monthly.filter(e=>e.date>=today&&e.status!=='completed').sort((a,b)=>a.date.localeCompare(b.date))[0];
  useEffect(()=>{window.scrollTo(0,0);},[tab]);
  useEffect(()=>{if(!form)return;const previous=document.activeElement;originalForm.current=JSON.stringify(form);dialog.current.showModal();return()=>previous?.focus();},[Boolean(form)]);
  useEffect(()=>{try{form?sessionStorage.setItem(`talaan-event-draft-${storageId}`,JSON.stringify(form)):sessionStorage.removeItem(`talaan-event-draft-${storageId}`);}catch{}},[form,storageId]);
  function closeEditor(){if(form&&JSON.stringify(form)!==originalForm.current&&!window.confirm('Discard unsaved event changes?'))return;setForm(null);}
  useEffect(()=>{if(!form)return;const warn=e=>{if(JSON.stringify(form)!==originalForm.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[form]);
  function add(category=categories[0]) {setForm({name:'',amount:'',date:month===today.slice(0,7)?today:`${month}-01`,type:'expense',category});}
  async function remove(entry) {setBusy(true);try{await workspace.deleteEvent(entry.id);setRemoved(entry);setForm(null);}finally{setBusy(false);}}
  async function save(event) {event.preventDefault();const amount=Number(form.amount);if(!form.name.trim()||!Number.isFinite(amount)||amount<=0)return;const entry={...form,name:form.name.trim(),amount:Math.round(amount*100)/100,id:form.id||crypto.randomUUID()};if(!entry.recurring?.frequency)delete entry.recurring;setBusy(true);try{await workspace.saveEvent(entry);setMonth(entry.date.slice(0,7));setForm(null);}finally{setBusy(false);}}
  function eventRow(entry) {return <button className="ledger-event" key={entry.id} onClick={()=>setForm({...entry})}><span className="ledger-date">{new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span><span><strong>{entry.name}</strong><small>{entry.status==='completed'?(entry.type==='income'?'Received':'Paid'):entry.date<today?'Past date · unconfirmed':entry.date===today?'Today · planned':'Planned'} · {entry.type==='income'?'Money in':entry.category}</small></span><b>{entry.type==='income'?'+':'−'}{money(entry.amount)}</b><span aria-hidden="true">›</span></button>;}
  if(workspace.loading)return <section className="dashboard-page" aria-live="polite"><p>Loading your workspace…</p></section>;
  return <section className="dashboard-page ledger-dashboard" aria-label="Talaan dashboard" aria-busy={busy}>
    <div className="ledger-context"><span>{storageId==='demo'?'Sample plan':workspace.isCloud?'Your plan · synced securely':'Your plan · saved locally'}</span>{['overview','schedule','insights'].includes(tab)&&<label><span className="sr-only">Budget month</span><input aria-label="Budget month" type="month" value={month} required onChange={e=>e.target.value&&setMonth(e.target.value)}/></label>}</div>
    <div className="ledger-heading"><h1>{{overview:'Your overview.',schedule:'Your schedule.',goals:'Your goals.',more:'Your space.',insights:'Insights.',profile:'Your profile.',settings:'Settings.',help:'A little help.'}[tab]}</h1>{tab==='schedule'&&<button className="ledger-add" onClick={()=>add()}>+ Add event</button>}</div>
    {['insights','profile','settings','help'].includes(tab)&&<button className="back-to-more" onClick={()=>setTab('more')}>← Back to More</button>}
    {workspace.error&&<p className="status-message status-error" role="alert">{workspace.error}</p>}
    {workspace.migration&&<section className="migration-panel" aria-labelledby="migration-title"><h2 id="migration-title">Bring this device’s plan with you?</h2><p>We found {workspace.migration.entries.length} validated personal events and {workspace.migration.goals.length} goals. Nothing from the sample demo will be copied.</p><div><button className="ledger-add" disabled={busy} onClick={async()=>{setBusy(true);try{await workspace.migratePersonal();}finally{setBusy(false);}}}>Migrate my personal plan</button><button className="text-action" onClick={workspace.dismissMigration}>Not now</button></div></section>}
    {removed&&<div className="undo-bar" role="status">Removed {removed.name}<button disabled={busy} onClick={async()=>{setBusy(true);try{await workspace.saveEvent(removed);setRemoved(null);}finally{setBusy(false);}}}>Undo</button></div>}
    {overGuardrail&&<p className="guardrail-warning" role="status">Guardrail warning: planned outflow is {money(out-Number(guardrail.monthlyLimit))} above your {money(Number(guardrail.monthlyLimit))} monthly limit.</p>}
    {tab==='overview'?<>
      <section className="balance-panel" aria-label="Monthly budget summary"><div className="workspace-label"><span>MONTHLY PLAN</span><span>USD</span></div><div className="balance-with-face"><div><p className="balance-caption">{available<0?'Over budget by':'Planned remaining'}</p><div className="ledger-balance">{money(Math.abs(available))}</div></div><Smiley mood={mood}/></div><p className="balance-note">{mood} · Includes future income; not your bank balance.</p><details className="mood-help"><summary>How is this mood decided?</summary><p>No events: no assessment. A negative remainder: over budget. Less than 10% of planned income left: getting tight. Otherwise: room to breathe. This is a plan indicator, not a financial health score.</p></details><div className="balance-breakdown"><div><span>Income</span><strong>{money(income)}</strong></div><div><span>Planned out</span><strong>{money(out)}</strong></div></div></section>
      <div className="ledger-section-heading"><h2>Up next</h2><button onClick={()=>setTab('schedule')}>See schedule ↗</button></div>{next?eventRow(next):<p className="ledger-empty">Nothing else scheduled this month.</p>}
    </>:tab==='goals'?<Goals workspace={workspace}/>:tab==='insights'?<Insights entries={entries} month={month} onSchedule={()=>setTab('schedule')}/>:['more','profile','settings','help'].includes(tab)?<MorePages key={tab} page={tab} onNavigate={setTab} workspace={workspace}/>:<><div className="schedule-search"><label className="sr-only" htmlFor="event-search">Search events</label><input id="event-search" type="search" placeholder="Search events or categories" value={query} onChange={e=>setQuery(e.target.value)}/><label className="sr-only" htmlFor="event-kind">Event type</label><select id="event-kind" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">All events</option><option value="income">Money in</option><option value="expense">Money out</option></select></div><div className="ledger-events">{scheduled.length?scheduled.map((entry,index)=><div key={entry.id}>{(index===0||scheduled[index-1].date!==entry.date)&&<h2 className="date-group">{entry.date===today?'Today':new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</h2>}{eventRow(entry)}</div>):<p className="ledger-empty">{query||kind!=='all'?'No matching events. Try another search or filter.':'No events this month. Add a payday, bill, or other money event.'}</p>}</div></>}
    <nav className="dashboard-stage-control" aria-label="Dashboard navigation">{['overview','schedule','goals','more'].map(value=><button key={value} className={`stage-dot ${(tab===value||(value==='more'&&['insights','profile','settings','help'].includes(tab)))?'active-stage':''}`} aria-current={(tab===value||(value==='more'&&['insights','profile','settings','help'].includes(tab)))?'page':undefined} onClick={()=>setTab(value)}><NavIcon name={value}/>{value[0].toUpperCase()+value.slice(1)}</button>)}</nav>
    {form&&<dialog className="entry-dialog" aria-label={form.id ? "Edit event" : "Add event"} ref={dialog} onCancel={e=>{e.preventDefault();closeEditor();}}><form onSubmit={save}><div className="entry-heading"><h2>{form.id?'Edit event':'New event'}</h2><button type="button" aria-label="Close editor" onClick={closeEditor}>×</button></div><div className="entry-type">{['expense','income'].map(type=><button type="button" key={type} aria-pressed={form.type===type} onClick={()=>setForm({...form,type,category:form.category||categories[0]})}>{type==='income'?'+ Money in':'− Money out'}</button>)}</div><label>Name<input autoFocus required maxLength={80} value={form.name} placeholder={form.type==='income'?'e.g. Freelance payment':'e.g. Internet bill'} onChange={e=>setForm({...form,name:e.target.value})}/></label><div className="entry-fields"><label>Amount (USD)<input required type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><label>Date<input required type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label></div>{form.type==='expense'&&<label>Category<select value={form.category||categories[0]} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>}<label>Repeat<select value={form.recurring?.frequency||''} onChange={e=>setForm({...form,recurring:e.target.value?{frequency:e.target.value,interval:1}:null})}><option value="">Does not repeat</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option></select></label>{form.recurring?.frequency&&<div className="entry-fields"><label>Repeat every<input type="number" min="1" max="99" step="1" value={form.recurring.interval||1} onChange={e=>setForm({...form,recurring:{...form.recurring,interval:Number(e.target.value)}})}/></label><label>End date (optional)<input type="date" min={form.date} value={form.recurring.endDate||''} onChange={e=>setForm({...form,recurring:{...form.recurring,endDate:e.target.value||undefined}})}/></label></div>}{!workspace.isCloud&&<label>Status<select value={form.status||'planned'} onChange={e=>setForm({...form,status:e.target.value})}><option value="planned">Planned</option><option value="completed">{form.type==='income'?'Received':'Paid'}</option></select></label>}<p className="ledger-footnote">Recurring rules are synchronized with the event. The backend creates future occurrences without changing this amount.</p><button disabled={busy} className="ledger-save" type="submit">{busy?'Saving…':form.id?'Save changes':'Add event'}</button>{form.id&&<button disabled={busy} className="ledger-delete" type="button" onClick={()=>remove(form)}>Remove event</button>}</form></dialog>}
  </section>;
}
