import WorkspaceSubscriptions from './WorkspaceSubscriptions';
import { CategoryBudgets, WhatIfScenarios } from './PlanningTools';
import { CashFlow, MonthlyReview } from './WorkspaceAnalysis';
import './PlanningStudio.css';

export default function PlanningStudio({ page, planningState, planningDispatch, onNavigate, flowState, setFlowState, model, analysis, setAnalysis }) {
  const views = { forecast: CashFlow, budgets: CategoryBudgets, scenarios: WhatIfScenarios, subscriptions: WorkspaceSubscriptions, review: MonthlyReview };
  const View = views[page];
  return <div className="planning-studio"><View model={model} analysis={analysis} setAnalysis={setAnalysis} state={page === 'subscriptions' ? flowState : planningState} setState={setFlowState} dispatch={planningDispatch} onNavigate={onNavigate}/></div>;
}
