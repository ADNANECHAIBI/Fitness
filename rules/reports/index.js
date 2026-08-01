/**
 * rules/reports/index.js — the report rule sets.
 *
 *   achievement → what the week did well            (stack, all that match)
 *   warning     → what crossed a threshold          (stack)
 *   recommend   → what to do about it               (stack, evidence required)
 *
 * The order matters at run time, not here: warnings are produced before
 * recommendations, because the recommendation rules read them. The reports
 * engine enforces that sequence; these lists know nothing about it.
 */

export { achievementRules } from './achievement-rules.js';
export { warningRules } from './warning-rules.js';
export { recommendationRules } from './recommendation-rules.js';

import { achievementRules } from './achievement-rules.js';
import { warningRules } from './warning-rules.js';
import { recommendationRules } from './recommendation-rules.js';

export const REPORT_RULE_SETS = Object.freeze({
  achievement: achievementRules,
  warning: warningRules,
  recommend: recommendationRules,
});

export function allReportRules() {
  return Object.values(REPORT_RULE_SETS).flat();
}
