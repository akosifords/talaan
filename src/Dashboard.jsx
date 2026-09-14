import { containDialogFocus } from './dialogFocus';
import DesignReview from './DesignReview';
import useSampleHousehold from './useSampleHousehold';
import { sampleToday, monthSummary, householdCategories } from './sampleHousehold';
import { categories as sampleCategories } from './planningData';
import WorkspaceGoals from './WorkspaceGoals';
import { createPlanningToolsState, planningToolsReducer } from './planningToolsState';
import useRoute from "./useRoute";
import { Insights, MorePages } from "./WorkspacePages";
import WorkspaceShell from "./WorkspaceShell";
import { resolveWorkspaceRoute, routes } from "./workspaceRoutes";
import PlanningStudio from "./PlanningStudio";
const planningIds = Object.keys(routes).filter(id => routes[id].preview);
import useWorkspace from "./data/useWorkspace";
import WorkspaceOverview from './WorkspaceOverview';
import WorkspaceSchedule from './WorkspaceSchedule';
import './WorkspaceDashboard.css';
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';

const categories = ['Bills & subscriptions', 'Everyday spending', 'Savings'];
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
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
export default function Dashboard({ storageId = 'demo', user = null, onAccount }) {
  const storedWorkspace=useWorkspace({user,storageId,seeds:{}});
  const sample = useSampleHousehold();
  const isSample = storageId === 'demo' && !user;
  const workspace = isSample ? { ...storedWorkspace, ...sample } : storedWorkspace;
  const model = sample;
  const baseEvents = model.entries.filter(event => event.date.startsWith('2026-09'));
  const planningModel = { entries: model.entries, categories: householdCategories(baseEvents), plan: monthSummary(baseEvents) };
  const [analysis, setAnalysis] = useState({ days: 30, date: 0, month: '2026-08', category: null });
  const [planningState, planningDispatch] = useReducer(planningToolsReducer, undefined, createPlanningToolsState);
  const [flowState, setFlowState] = useState({ goal: null, monthly: {}, subscription: null, paused: [], filter: 'All' });
  const entries=workspace.entries;
  const scope=user?'workspace':storageId==='personal'?'personal':'dashboard';
  const [rawTab,setTab]=useRoute(scope,workspace.profile.startPage||'overview');
  const tab=resolveWorkspaceRoute(rawTab);
  const [query,setQuery]=useState('');
  const [kind,setKind]=useState('all');
  const [status,setStatus]=useState('all');
  const [editorError,setEditorError]=useState('');
  const opener=useRef(null);
  const [form,setForm]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(`talaan-event-draft-${storageId}`))||null;}catch{return null;}});
  const [removed,setRemoved]=useState(null);
  const [busy,setBusy]=useState(false);
  const dialog=useRef(null);
  const originalForm=useRef(null);
  const today=isSample?sampleToday:dateKey(new Date());
  const [month,setMonth]=useState(today.slice(0,7));
  const monthly=entries.filter(e=>e.date.startsWith(month));
  const income=monthly.filter(e=>e.type==='income').reduce((a,e)=>a+Math.round(e.amount*100),0)/100;
  const out=monthly.filter(e=>e.type==='expense').reduce((a,e)=>a+Math.round(e.amount*100),0)/100;
  const available=Math.round((income-out)*100)/100;
  const guardrail=workspace.settings.guardrails||{};
  const overGuardrail=guardrail.enabled&&Number(guardrail.monthlyLimit)>0&&out>Number(guardrail.monthlyLimit);
  const mood=!monthly.length?'No plan yet':available<0?'Over budget':available<income*.1?'Getting tight':'Room to breathe';
  const scheduled=monthly.filter(e=>(kind==='all'||e.type===kind)&&(status==='all'||(status==='completed'?e.status==='completed':status==='unconfirmed'?e.date<today&&e.status!=='completed':e.status!=='completed'))&&`${e.name} ${e.category}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.date.localeCompare(b.date));
  useEffect(()=>{window.scrollTo(0,0);if(!form)document.getElementById('workspace-content')?.focus({preventScroll:true});},[tab]);
  useLayoutEffect(()=>{if(!form||workspace.loading)return;const previous=opener.current;const x=window.scrollX;const y=window.scrollY;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';originalForm.current=JSON.stringify(form);dialog.current.showModal();dialog.current.querySelector('input')?.focus({preventScroll:true});return()=>{document.body.style.overflow=overflow;(previous?.isConnected?previous:document.getElementById('workspace-content'))?.focus({preventScroll:true});window.scrollTo(x,y);};},[Boolean(form),workspace.loading]);
  useEffect(()=>{try{form?sessionStorage.setItem(`talaan-event-draft-${storageId}`,JSON.stringify(form)):sessionStorage.removeItem(`talaan-event-draft-${storageId}`);}catch{}},[form,storageId]);
  function closeEditor(){if(busy)return;if(form&&JSON.stringify(form)!==originalForm.current&&!window.confirm('Discard unsaved event changes?'))return;setForm(null);}
  useEffect(()=>{if(!form)return;const warn=e=>{if(JSON.stringify(form)!==originalForm.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[form]);
  function openEditor(entry,trigger){opener.current=trigger||document.activeElement;setEditorError('');setForm({...entry});}
  function add(category=isSample?'Home & bills':categories[0]) {opener.current=document.activeElement;setEditorError('');setForm({name:'',amount:'',date:month===today.slice(0,7)?today:`${month}-01`,type:'expense',category});}
  async function remove(entry) {setBusy(true);try{await workspace.deleteEvent(entry.id);setRemoved(entry);setForm(null);}catch(error){setEditorError(error.message||'Could not remove this event. Please try again.');}finally{setBusy(false);}}
  async function save(event) {event.preventDefault();const amount=Number(form.amount);if(!form.name.trim()||!Number.isFinite(amount)||amount<=0)return;const entry={...form,name:form.name.trim(),amount:Math.round(amount*100)/100,id:form.id||crypto.randomUUID()};if(!entry.recurring?.frequency)delete entry.recurring;setBusy(true);try{await workspace.saveEvent(entry);setMonth(entry.date.slice(0,7));setForm(null);}catch(error){setEditorError(error.message||'Could not save changes. Please try again.');}finally{setBusy(false);}}
  if(workspace.loading)return <section className="dashboard-page" aria-live="polite"><p>Loading your workspace…</p></section>;
  return <WorkspaceShell sampleReset={isSample&&tab!=='design-review'?()=>{sample.reset();planningDispatch({type:'resetLimits'});planningDispatch({type:'resetScenario'});setFlowState({goal:null,monthly:{},subscription:null,paused:[],filter:'All'});setAnalysis({days:30,date:0,month:'2026-08',category:null});setMonth('2026-09');setQuery('');setKind('all');setStatus('all');setRemoved(null);}:undefined} page={tab} scope={scope} identity={storageId==='demo'?'Sample workspace':workspace.isCloud?'Synced workspace':'Local workspace'} onAccount={onAccount} signedIn={Boolean(user)} month={month} onMonth={setMonth} busy={busy} action={['schedule','overview'].includes(tab)?<button className="ledger-add" onClick={()=>add()}>+ Add event</button>:null}>

    {workspace.error&&<p className="status-message status-error" role="alert">{workspace.error}</p>}
    {workspace.migration&&<section className="migration-panel" aria-labelledby="migration-title"><h2 id="migration-title">Bring this device’s plan with you?</h2><p>We found {workspace.migration.entries.length} validated personal events and {workspace.migration.goals.length} goals. Nothing from the sample demo will be copied.</p><div><button className="ledger-add" disabled={busy} onClick={async()=>{setBusy(true);try{await workspace.migratePersonal();}finally{setBusy(false);}}}>Migrate my personal plan</button><button className="text-action" onClick={workspace.dismissMigration}>Not now</button></div></section>}
    {removed&&<div className="undo-bar" role="status">Removed {removed.name}<button disabled={busy} onClick={async()=>{setBusy(true);try{await workspace.saveEvent(removed);setRemoved(null);}finally{setBusy(false);}}}>Undo</button></div>}
    {overGuardrail&&<p className="guardrail-warning" role="status">Guardrail warning: planned outflow is {money(out-Number(guardrail.monthlyLimit))} above your {money(Number(guardrail.monthlyLimit))} monthly limit.</p>}
    {tab==='design-review'?<DesignReview/>:tab==='overview'?<WorkspaceOverview monthly={monthly} goals={workspace.goals} income={income} out={out} available={available} mood={mood} face={<Smiley mood={mood}/>} today={today} onEdit={openEditor} onNavigate={setTab}/>:['goals','roadmap'].includes(tab)?<WorkspaceGoals today={today} workspace={workspace} page={tab} state={flowState} setState={setFlowState} onNavigate={setTab}/>:planningIds.includes(tab)?<PlanningStudio key={tab} page={tab} model={planningModel} analysis={analysis} setAnalysis={setAnalysis} flowState={flowState} setFlowState={setFlowState} planningState={planningState} planningDispatch={planningDispatch} onNavigate={setTab}/>:tab==='allocation'?<Insights entries={entries} month={month} onSchedule={()=>setTab('schedule')}/>:['more','profile','settings','help'].includes(tab)?<MorePages key={tab} page={tab} onNavigate={setTab} workspace={workspace}/>:<WorkspaceSchedule entries={scheduled} today={today} query={query} onQuery={setQuery} kind={kind} onKind={setKind} status={status} onStatus={setStatus} onEdit={openEditor} totalCount={monthly.length}/>}

    {form&&<dialog onKeyDown={containDialogFocus} className="entry-dialog event-editor" aria-label={form.id ? "Edit event" : "Add event"} ref={dialog} onCancel={e=>{e.preventDefault();closeEditor();}}><form onSubmit={save}><div className="event-editor-body"><div className="entry-heading"><h2>{form.id?'Edit event':'New event'}</h2><button type="button" aria-label="Close editor" onClick={closeEditor}>×</button></div><p className="drawer-description">Keep the details clear. Your monthly plan updates when you save.</p>{editorError&&<p className="drawer-error" role="alert">{editorError}</p>}<div className="entry-type">{['expense','income'].map(type=><button type="button" key={type} aria-pressed={form.type===type} onClick={()=>setForm({...form,type,category:form.category||categories[0]})}>{type==='income'?'+ Money in':'− Money out'}</button>)}</div><label>Name<input autoFocus required maxLength={80} value={form.name} placeholder={form.type==='income'?'e.g. Freelance payment':'e.g. Internet bill'} onChange={e=>setForm({...form,name:e.target.value})}/></label><div className="entry-fields"><label>Amount (USD)<input required type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><label>Date<input required type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label></div>{form.type==='expense'&&<label>Category<select value={form.category||categories[0]} onChange={e=>setForm({...form,category:e.target.value})}>{(isSample?[...sampleCategories.map(item=>item.name),'Savings']:categories).map(c=><option key={c}>{c}</option>)}</select></label>}<label>Repeat<select value={form.recurring?.frequency||''} onChange={e=>setForm({...form,recurring:e.target.value?{frequency:e.target.value,interval:1}:null})}><option value="">Does not repeat</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option></select></label>{form.recurring?.frequency&&<div className="entry-fields"><label>Repeat every<input type="number" min="1" max="99" step="1" value={form.recurring.interval||1} onChange={e=>setForm({...form,recurring:{...form.recurring,interval:Number(e.target.value)}})}/></label><label>End date (optional)<input type="date" min={form.date} value={form.recurring.endDate||''} onChange={e=>setForm({...form,recurring:{...form.recurring,endDate:e.target.value||undefined}})}/></label></div>}{!workspace.isCloud&&<label>Status<select value={form.status||'planned'} onChange={e=>setForm({...form,status:e.target.value})}><option value="planned">Planned</option><option value="completed">{form.type==='income'?'Received':'Paid'}</option></select></label>}{form.recurring?.frequency&&<p className="ledger-footnote">{workspace.isCloud?"Future events repeat at this amount until the end date, if set.":"Sign in to generate future events automatically."}</p>}</div><div className="event-editor-actions"><button disabled={busy} className="ledger-save" type="submit">{busy?'Saving…':form.id?'Save changes':'Add event'}</button><div className="drawer-secondary"><button type="button" disabled={busy} onClick={closeEditor}>Cancel</button>{form.id&&<button disabled={busy} className="ledger-delete" type="button" onClick={()=>remove(form)}>Remove event</button>}</div></div></form></dialog>}
  </WorkspaceShell>;
}
