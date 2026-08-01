/**
 * rules/insights/index.js — the insight rule sets.
 *
 * Four files, split by what they read rather than by what they conclude:
 *
 *   progress     the direction of travel — trends, deltas, the scale
 *   training     lifting, running, load and recovery
 *   nutrition    intake, macros, meals and cost
 *   consistency  whether the plan was followed, and whether enough was logged
 *
 * Every set runs against the same context — one weekly report — and appends
 * insight drafts. None of them may decide anything about training: this whole
 * folder observes, and the reports engine's recommendations remain the only
 * place the app tells anyone to do something.
 */

export { progressInsightRules } from './progress-insights.js';
export { trainingInsightRules } from './training-insights.js';
export { nutritionInsightRules } from './nutrition-insights.js';
export { consistencyInsightRules } from './consistency-insights.js';

import { progressInsightRules } from './progress-insights.js';
import { trainingInsightRules } from './training-insights.js';
import { nutritionInsightRules } from './nutrition-insights.js';
import { consistencyInsightRules } from './consistency-insights.js';

export const INSIGHT_RULE_SETS = Object.freeze({
  progress: progressInsightRules,
  training: trainingInsightRules,
  nutrition: nutritionInsightRules,
  consistency: consistencyInsightRules,
});

export function allInsightRules() {
  return Object.values(INSIGHT_RULE_SETS).flat();
}
