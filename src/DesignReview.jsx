import { useReducer, useState } from 'react';
import PlanningStudio from './PlanningStudio';
import { createSampleHousehold, householdCategories, monthSummary } from './sampleHousehold';
import { createPlanningToolsState, planningToolsReducer } from './planningToolsState';

export default function DesignReview() {
  const [page,setPage]=useState('forecast');
  const [example,setExample]=useState('populated');
  const [planningState,planningDispatch]=useReducer(planningToolsReducer,undefined,createPlanningToolsState);
  const [flowState,setFlowState]=useState({subscription:null,paused:[],filter:'All'});
  const [analysis,setAnalysis]=useState({days:30,date:0,month:'2026-08',category:null});
  const [sample]=useState(createSampleHousehold);
  const entries=sample.entries.filter(event=>event.date.startsWith('2026-09'));
  const model={entries:sample.entries,categories:householdCategories(entries),plan:monthSummary(entries)};
  return <div className="design-review"><section className="design-review-controls" aria-label="Design review controls"><p>Inspect design examples here. These controls use a separate sample and do not change your workspace.</p><label>Screen<select value={page} onChange={event=>setPage(event.target.value)}>{[['forecast','Cash flow'],['review','Monthly review'],['budgets','Category budgets'],['scenarios','What-if scenarios'],['subscriptions','Subscriptions']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><div className="planning-segments" role="group" aria-label="Display state">{['populated','empty','loading','error'].map(value=><button key={value} aria-pressed={example===value} onClick={()=>setExample(value)}>{value[0].toUpperCase()+value.slice(1)}</button>)}</div></section>{example==='populated'?<PlanningStudio page={page} planningState={planningState} planningDispatch={planningDispatch} flowState={flowState} setFlowState={setFlowState} model={model} analysis={analysis} setAnalysis={setAnalysis} onNavigate={setPage}/>:<section className="planning-state" aria-live="polite" aria-label={`${example} state example`}>{example==='loading'?<><div className="planning-skeleton" aria-hidden="true"/><h2>Putting your picture together.</h2><p>Loading example. No request is running.</p></>:example==='error'?<><h2>Your view couldn’t load.</h2><p>Your plan is still here. Give it another try.</p></>:<><h2>A little planning starts here.</h2><p>Once you have a plan, this space will help you see what’s next.</p></>}<button className="ledger-add" onClick={()=>setExample('populated')}>{example==='error'?'Try again':'Explore sample data'}</button></section>}</div>;
}
