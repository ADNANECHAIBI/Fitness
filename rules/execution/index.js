/**
 * rules/execution/index.js — the execution rule sets.
 *
 *   completion → one verdict per session          (one wins)
 *   failure    → per exercise, may progression build on it (stack)
 *   pr         → per exercise, which records fell (stack)
 */

export { completionRules, VERDICT, PROGRESSABLE_VERDICTS, statusFor } from './completion-rules.js';
export { failureRules, judgeSet } from './failure-rules.js';
export { prRules, RECORD_TYPE, sessionNumbers } from './pr-rules.js';

import { completionRules } from './completion-rules.js';
import { failureRules } from './failure-rules.js';
import { prRules } from './pr-rules.js';

export const EXECUTION_RULE_SETS = Object.freeze({
  completion: completionRules,
  failure: failureRules,
  pr: prRules,
});

export function allExecutionRules() {
  return Object.values(EXECUTION_RULE_SETS).flat();
}
