import { categories, subscriptions, goals } from './planningData.js';
export const sampleToday = '2026-09-13';
export const openingCash = 1240;
const cents = value => Math.round(value * 100);
export function sampleEvents(month = '2026-09') {
  const previous = month < '2026-09';
  const day = number => `${month}-${String(number).padStart(2,'0')}`;
  const last = new Date(Number(month.slice(0,4)), Number(month.slice(5)), 0).getDate();
  const rows = [
    ['rent', 'Rent', 1200, 'Home & bills', 1],
    ['utilities', 'Utilities', previous ? 220 : 250, 'Home & bills', 4],
    ['everyday', 'Everyday spending', previous ? 720 : 640, 'Everyday spending', 10],
    ['transport', 'Getting around', previous ? 210 : 180, 'Getting around', 22],
    ['extras', 'Little extras', previous ? 165 : 210, 'Little extras', 24],
    ...subscriptions.map(item => [item.id, item.name, item.amount, 'Subscriptions', item.day, item.id]),
  ].map(([id,name,amount,category,date,subscriptionId]) => ({ id:`${month}-${id}`, name, amount, category, date:day(date), type:'expense', ...(subscriptionId ? { subscriptionId } : {}) }));
  goals.forEach(goal => rows.push({id:`${month}-${goal.id}`,name:`${goal.name} contribution`,amount:goal.monthly,category:'Savings',date:day(28),type:'expense',goalId:goal.id}));
  [15,last].forEach((date,index) => rows.push({id:`${month}-pay-${index}`,name:'Payday',amount:1900,category:'',date:day(date),type:'income'}));
  return rows.map(row => ({...row,status:row.date < sampleToday ? 'completed' : 'planned'})).sort((a,b)=>a.date.localeCompare(b.date));
}
export function createSampleHousehold() {
  const archive=sampleEvents('2026-08');
  return { entries: [...archive,...sampleEvents()], goals: goals.map(goal=>({...goal, contributions:archive.filter(event=>event.goalId===goal.id).map(event=>({amount:event.amount,date:event.date,eventId:event.id}))})) };
}
export function monthSummary(entries) {
  const sum = predicate => entries.filter(predicate).reduce((total,event)=>total+cents(event.amount),0)/100;
  return { income:sum(event=>event.type==='income'), spending:sum(event=>event.type==='expense'&&event.category!=='Savings'), savings:sum(event=>event.type==='expense'&&event.category==='Savings') };
}
export function householdCategories(entries) {
  return categories.map(category=>({...category,spent:entries.filter(event=>event.type==='expense'&&event.category===category.name).reduce((sum,event)=>sum+cents(event.amount),0)/100}));
}
export function cashTimeline(entries, start='2026-09-01', days=30, opening=openingCash) {
  let balance = cents(opening);
  return Array.from({length:days},(_,index)=>{
    const date = new Date(`${start}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+index);
    const key=date.toISOString().slice(0,10);
    const events=entries.filter(event=>event.date===key);
    balance+=events.reduce((sum,event)=>sum+(event.type==='income'?1:-1)*cents(event.amount),0);
    return {date:key,balance:balance/100,events};
  });
}
export function forecastEntries(entries, days) {
  // September is the editable base; later months repeat its dated plan.
  const result=[...entries.filter(event=>event.date.startsWith('2026-09'))];
  const months=Math.ceil(days/30);
  for(let offset=1;offset<months;offset++) {
    const date=new Date(Date.UTC(2026,8+offset,1));
    const month=date.toISOString().slice(0,7);
    const last=new Date(Date.UTC(2026,9+offset,0)).getUTCDate();
    entries.filter(event=>event.date.startsWith('2026-09')).forEach(event=>result.push({...event,id:`${month}-${event.id}`,date:`${month}-${String(event.date.endsWith('-30')&&event.type==='income'?last:Math.min(Number(event.date.slice(-2)),last)).padStart(2,'0')}`,status:'planned'}));
  }
  return result;
}
export function updateSampleEvent(data, event, deletedId) {
  const id=deletedId||event.id;
  const previous=data.entries.find(row=>row.id===id);
  const completed=row=>row?.goalId&&row.type==='expense'&&row.category==='Savings'&&row.status==='completed';
  const nextGoals=data.goals.map(goal=>{
    const subtract=completed(previous)&&previous.goalId===goal.id?cents(previous.amount):0;
    const add=!deletedId&&completed(event)&&event.goalId===goal.id?cents(event.amount):0;
    return {...goal,saved:Math.max(0,(cents(goal.saved)-subtract+add)/100),contributions:[...(goal.contributions||[]).filter(item=>item.eventId!==id),...(add?[{amount:add/100,date:event.date,eventId:id}]:[])]};
  });
  return {...data,goals:nextGoals,entries:deletedId?data.entries.filter(row=>row.id!==id):previous?data.entries.map(row=>row.id===id?event:row):[...data.entries,event]};
}
