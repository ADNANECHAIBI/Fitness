/**
 * rules/running/index.js — the running rule sets, in pipeline order.
 *
 *   recovery    → intensity ceilings and the impact readout   (stack)
 *   load        → the week's distance budget                  (stack)
 *   progression → is anything improving                       (one wins)
 *   sessionType → per slot, what kind of run                  (one wins)
 */

export { loadRules } from './load-rules.js';
export { sessionTypeRules, QUALITY_TYPES } from './session-type-rules.js';
export { runningRecoveryRules } from './recovery-rules.js';
export { progressionRules } from './progression-rules.js';

import { loadRules } from './load-rules.js';
import { sessionTypeRules } from './session-type-rules.js';
import { runningRecoveryRules } from './recovery-rules.js';
import { progressionRules } from './progression-rules.js';

/**
 * The impact readout is split out because it reports on the distance rather
 * than setting it: it has to run after the load rules, or it describes a week
 * that has not been decided yet.
 */
const CEILING_RULES = runningRecoveryRules.filter(
  (rule) => rule.id !== 'running-recovery.impact-on-lifting');
const IMPACT_RULES = runningRecoveryRules.filter(
  (rule) => rule.id === 'running-recovery.impact-on-lifting');

export const RUNNING_RULE_SETS = Object.freeze({
  recovery: CEILING_RULES,
  load: loadRules,
  impact: IMPACT_RULES,
  progression: progressionRules,
  sessionType: sessionTypeRules,
});

export function allRunningRules() {
  return Object.values(RUNNING_RULE_SETS).flat();
}
