/**
 * risk-rules.js — how loudly the health summary should be read.
 *
 * "Risk level" is not a measurement and this file does not make it one. It is
 * a label over signals that already exist: the recovery status the recovery
 * snapshot assigned, the warnings the reports engine raised, and the severity
 * the insights engine gave what it found. Exactly one label applies, so these
 * run through `selectOne` in descending order of how bad the news is.
 *
 * Nothing here is a threshold of its own. Where a number appears it is the
 * one the engine that owns it already produced, and every band it is compared
 * against lives in constants.js.
 */

import { defineRule } from '../rule.js';
import {
  DASHBOARD_RISK, RECOVERY_STATUS, WARNING, INSIGHT_SEVERITY, RUNNING_LOAD,
} from '../../engines/constants.js';

/** Warnings that describe the body rather than the plan. */
const HEALTH_WARNINGS = [
  WARNING.UNDER_RECOVERY,
  WARNING.OVERREACHING,
  WARNING.HIGH_FATIGUE,
  WARNING.CALORIES_TOO_LOW,
];

const criticalInsights = (context) =>
  (context.insights?.all ?? []).filter((insight) => insight.severity === INSIGHT_SEVERITY.CRITICAL);

export const riskRules = [
  defineRule({
    id: 'risk.critical-insight',
    name: 'Something critical was found',
    scope: 'health',
    priority: 100,
    when: (context) => criticalInsights(context).length > 0,
    apply: (context) => {
      const found = criticalInsights(context);
      return {
        patch: { risk: DASHBOARD_RISK.HIGH },
        message: `The insights engine rated ${found.length} observation${found.length === 1 ? '' : 's'} critical this week — ${found.map((insight) => insight.key).join(', ')}. The severity is its judgement, carried through unchanged.`,
      };
    },
  }),

  defineRule({
    id: 'risk.under-recovery',
    name: 'Recovery and load disagree',
    scope: 'health',
    priority: 90,
    when: (context) => context.recoveryStatus === RECOVERY_STATUS.POOR &&
      HEALTH_WARNINGS.some((type) => context.warned(type)),
    apply: (context) => ({
      patch: { risk: DASHBOARD_RISK.HIGH },
      message: `Recovery reads ${context.recoveryStatus} at a strain index of ${context.strainIndex}, and the week's report raised ${HEALTH_WARNINGS.filter((type) => context.warned(type)).join(' and ')}. Two independent signals agreeing is what separates a hard week from a hole being dug.`,
    }),
  }),

  defineRule({
    id: 'risk.poor-recovery',
    name: 'Recovery is poor',
    scope: 'health',
    priority: 80,
    when: (context) => context.recoveryStatus === RECOVERY_STATUS.POOR,
    apply: (context) => ({
      patch: { risk: DASHBOARD_RISK.MODERATE },
      message: `The recovery snapshot reads ${context.recoveryStatus} at a strain index of ${context.strainIndex}. One signal, so it is reported as moderate rather than escalated on its own.`,
    }),
  }),

  defineRule({
    id: 'risk.load-spike',
    name: 'Running load is spiking',
    scope: 'health',
    priority: 70,
    when: (context) => context.recovery?.runningLoad?.verdict === RUNNING_LOAD.VERDICT.SPIKING,
    apply: (context) => ({
      patch: { risk: DASHBOARD_RISK.MODERATE },
      message: `Running load sits at ${context.recovery.runningLoad.ratio}× the recent average, which the running progress engine calls spiking. Recovery itself has not complained, so this is the earlier of the two warnings.`,
    }),
  }),

  defineRule({
    id: 'risk.health-warning',
    name: 'The week raised a health warning',
    scope: 'health',
    priority: 60,
    when: (context) => HEALTH_WARNINGS.some((type) => context.warned(type)),
    apply: (context) => ({
      patch: { risk: DASHBOARD_RISK.LOW },
      message: `The report raised ${HEALTH_WARNINGS.filter((type) => context.warned(type)).join(', ')} while recovery still reads ${context.recoveryStatus}. Worth naming, not worth alarm.`,
    }),
  }),

  defineRule({
    id: 'risk.unknown',
    name: 'Not enough to say',
    scope: 'health',
    priority: 20,
    when: (context) => context.recoveryStatus === RECOVERY_STATUS.UNKNOWN,
    apply: () => ({
      patch: { risk: DASHBOARD_RISK.UNKNOWN },
      message: 'There is no recovery reading yet, and a risk level guessed without one would be a made-up number wearing a label. It is reported as unknown instead.',
    }),
  }),

  defineRule({
    id: 'risk.none',
    name: 'Nothing is flagged',
    scope: 'health',
    priority: 10,
    when: () => true,
    apply: (context) => ({
      patch: { risk: DASHBOARD_RISK.NONE },
      message: `Recovery reads ${context.recoveryStatus} and no health warning was raised this week. Nothing is flagged, which is a result rather than an absence of one.`,
    }),
  }),
];
