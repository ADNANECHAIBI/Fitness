/**
 * rules/analytics/index.js — the three analytics rule sets.
 *
 * The analytics engine fits trends; these rules say what the trends mean.
 * All three run through `applyAll` and append findings — none of them
 * replaces another, because a window can plateau on one figure, improve on a
 * second and be risky on a third at the same time, and reporting only the
 * loudest of the three would hide the other two.
 *
 *   plateau    a figure that has stopped moving where movement was the point
 *   progress   the direction of travel — improvement, and its opposite
 *   risk       shapes across weeks that no single week can see
 *
 * A finding without evidence is refused by the engine, whichever rule
 * produced it, and the refusal is counted.
 */

export { plateauRules } from './plateau-rules.js';
export { progressRules } from './progress-rules.js';
export { riskRules } from './risk-rules.js';

import { plateauRules } from './plateau-rules.js';
import { progressRules } from './progress-rules.js';
import { riskRules } from './risk-rules.js';

export const ANALYTICS_RULE_SETS = Object.freeze({
  plateau: plateauRules,
  progress: progressRules,
  risk: riskRules,
});

export function allAnalyticsRules() {
  return Object.values(ANALYTICS_RULE_SETS).flat();
}
