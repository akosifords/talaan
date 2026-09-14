export function recordGoalContribution(goal, amount, date) {
  const cents = Math.round(Number(amount || 0) * 100);
  return {
    ...goal,
    saved: (Math.round(Number(goal.saved || 0) * 100) + cents) / 100,
    contributions: [...(goal.contributions || []), ...(cents > 0 ? [{ amount: cents / 100, date }] : [])],
  };
}
