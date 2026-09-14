import { useState } from 'react';
import { createSampleHousehold, updateSampleEvent } from './sampleHousehold';
import { validateEvent, validateGoal } from './data/validators';
export default function useSampleHousehold() {
  const [data,setData]=useState(createSampleHousehold);
  return { ...data, loading:false, reset:()=>setData(createSampleHousehold()),
    saveEvent:async event=>{if(!validateEvent(event))throw new Error('Check the event fields.');setData(old=>updateSampleEvent(old,event));},
    deleteEvent:async id=>setData(old=>updateSampleEvent(old,null,id)),
    saveGoal:async goal=>{if(!validateGoal(goal))throw new Error('Check the goal fields.');setData(old=>{
      const fresh=(goal.contributions||[]).map(item=>item.eventId?item:{...item,eventId:`goal-${crypto.randomUUID()}`});
      const added=fresh.filter(item=>!old.entries.some(event=>event.id===item.eventId)).map(item=>({id:item.eventId,name:`${goal.name} contribution`,amount:item.amount,date:item.date,category:'Savings',type:'expense',status:'completed',goalId:goal.id}));
      const next={...goal,contributions:fresh};
      return {...old,entries:[...old.entries,...added],goals:old.goals.some(row=>row.id===goal.id)?old.goals.map(row=>row.id===goal.id?next:row):[...old.goals,next]};
    });},
    deleteGoal:async id=>setData(old=>({...old,goals:old.goals.filter(row=>row.id!==id)})),
  };
}
