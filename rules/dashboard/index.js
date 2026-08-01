/**
 * rules/dashboard/index.js — the dashboard's three rule sets.
 *
 * The dashboard engine aggregates; it does not judge. Where a judgement is
 * unavoidable — which task matters most today, how loudly the health summary
 * should read, what is worth a notification — it is a rule here rather than a
 * branch in the engine, for the same reason every other phase did it this
 * way: a policy in a rule can be read, tested and replaced on its own.
 *
 *   focus         exactly one wins — what to do first today
 *   risk          exactly one wins — the label over the health summary
 *   notification  every match runs — what is currently worth saying
 *
 * None of the three produces a number. Each reads figures other engines
 * already produced and decides only how to present them.
 */

export { focusRules } from './focus-rules.js';
export { riskRules } from './risk-rules.js';
export { notificationRules } from './notification-rules.js';

import { focusRules } from './focus-rules.js';
import { riskRules } from './risk-rules.js';
import { notificationRules } from './notification-rules.js';

export const DASHBOARD_RULE_SETS = Object.freeze({
  focus: focusRules,
  risk: riskRules,
  notification: notificationRules,
});

export function allDashboardRules() {
  return Object.values(DASHBOARD_RULE_SETS).flat();
}
