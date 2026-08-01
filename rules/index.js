/**
 * rules/index.js — every rule set the planner runs, in pipeline order.
 *
 * Adding a rule: write it in the right file with defineRule(), and it runs.
 * Nothing in the planner needs to change.
 *
 * Replacing a rule set wholesale: pass your own arrays into createPlanner().
 */

export { defineRule, selectOne, applyAll, applyToDay, makeReason } from './rule.js';

export { phaseRules } from './phase-rules.js';
export { recoveryRules } from './recovery-rules.js';
export { gymRules } from './gym-rules.js';
export { runningRules } from './running-rules.js';
export { nutritionRules, waterForDay } from './nutrition-rules.js';

import { phaseRules } from './phase-rules.js';
import { recoveryRules } from './recovery-rules.js';
import { gymRules } from './gym-rules.js';
import { runningRules } from './running-rules.js';
import { nutritionRules } from './nutrition-rules.js';

/** The default pipeline. Order matters: each stage reads what the last decided. */
export const DEFAULT_RULE_SETS = Object.freeze({
  phase: phaseRules,
  recovery: recoveryRules,
  gym: gymRules,
  running: runningRules,
  nutrition: nutritionRules,
});

/** Every rule, flattened — for a "which rules exist?" screen or a test. */
export function allRules() {
  return Object.values(DEFAULT_RULE_SETS).flat();
}
