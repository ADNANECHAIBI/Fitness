/**
 * progress-rules.js — which way the long window is pointing.
 *
 * Two findings live here and they are deliberately asymmetric.
 *
 * **Improvement** needs agreement. One metric rising over a quarter is a
 * metric rising; two or more independent ones rising together is progress.
 * The threshold is `ANALYTICS.MIN_AGREEING_SIGNALS`, and the rule names which
 * signals agreed rather than asserting that things are going well.
 *
 * **Regression** does not need agreement. A single figure falling for long
 * enough is worth saying on its own, because the cost of missing it is higher
 * than the cost of naming a fortnight that turns out to be noise — and the
 * `weeks` in the evidence lets the reader judge that for themselves.
 *
 * Neither rule decides what to do about any of it. Recommendations belong to
 * the reports engine and nowhere else, which is the same line phases 17 and
 * 18 held.
 */

import { defineRule } from '../rule.js';
import {
  ANALYTICS, ANALYTICS_FINDING, ANALYTICS_DIRECTION,
} from '../../engines/constants.js';

const add = (draft, item) => ({ findings: [...(draft.findings ?? []), item] });

/** Metrics whose direction has a defined "better". */
const DIRECTIONAL = [
  'volumeKg', 'oneRepMaxKg', 'distanceKm', 'paceSecPerKm',
  'proteinG', 'adherencePercent', 'consistencyPercent', 'sleepHours',
];

export const progressRules = [
  defineRule({
    id: 'improvement.broad',
    name: 'Several independent measures are improving',
    scope: 'analytics',
    priority: 90,
    when: (context) => context.improving().length >= ANALYTICS.MIN_AGREEING_SIGNALS,
    apply: (context, draft) => {
      const metrics = context.improving();
      const trends = metrics.map((metric) => context.trend(metric));

      return {
        patch: add(draft, {
          key: 'improvement.broad',
          kind: ANALYTICS_FINDING.IMPROVEMENT,
          metric: null,
          title: `${metrics.length} measures improving together`,
          summary: trends.map((trend) => trend.label).join(', ') + '.',
          reason: `${metrics.length} independent figures moved the right way across the window: ${trends.map((trend) => `${trend.label} at ${trend.perWeek} ${trend.unit}`).join(', ')}. Agreement across measures that do not share an input is what separates progress from one number drifting.`,
          evidence: Object.fromEntries(trends.map((trend) => [trend.metric, trend.perWeek])),
          confidence: context.confidence(),
          sourceEngine: 'reports-engine',
        }),
        message: `Improvement was claimed on ${metrics.length} agreeing signals, above the ${ANALYTICS.MIN_AGREEING_SIGNALS} required.`,
      };
    },
  }),

  defineRule({
    id: 'improvement.single',
    name: 'One measure is improving',
    scope: 'analytics',
    priority: 70,
    when: (context) => context.improving().length === 1,
    apply: (context, draft) => {
      const trend = context.trend(context.improving()[0]);

      return {
        patch: add(draft, {
          key: `improvement.${trend.metric}`,
          kind: ANALYTICS_FINDING.IMPROVEMENT,
          metric: trend.metric,
          title: `${trend.label} is improving`,
          summary: `${trend.perWeek} ${trend.unit} across ${trend.weeks} weeks.`,
          reason: `${trend.label} moved from ${trend.first} to ${trend.last} across ${trend.weeks} weeks, a slope of ${trend.perWeek} ${trend.unit} — outside the ±${trend.band} band that reads as flat. It is the only measure moving this way, so it is reported as one figure improving rather than as progress overall.`,
          evidence: {
            perWeek: trend.perWeek, first: trend.first ?? null, last: trend.last ?? null,
            weeks: trend.weeks, flatBand: trend.band,
          },
          confidence: context.confidence(),
          sourceEngine: trend.source,
        }),
        message: `One measure improved and was reported as one measure, not as a direction of travel.`,
      };
    },
  }),

  defineRule({
    id: 'regression.declining',
    name: 'A measure is going backwards',
    scope: 'analytics',
    priority: 95,
    when: (context) => DIRECTIONAL.some((metric) =>
      context.trend(metric).direction === ANALYTICS_DIRECTION.DECLINING &&
      context.trend(metric).weeks >= ANALYTICS.REGRESSION_WEEKS),
    apply: (context, draft) => {
      const items = DIRECTIONAL
        .map((metric) => context.trend(metric))
        .filter((trend) => trend.direction === ANALYTICS_DIRECTION.DECLINING &&
          trend.weeks >= ANALYTICS.REGRESSION_WEEKS)
        .slice(0, ANALYTICS.MAX_PER_KIND)
        .map((trend) => ({
          key: `regression.${trend.metric}`,
          kind: ANALYTICS_FINDING.REGRESSION,
          metric: trend.metric,
          title: `${trend.label} is declining`,
          summary: `${trend.perWeek} ${trend.unit} across ${trend.weeks} weeks.`,
          reason: `${trend.label} went from ${trend.first} to ${trend.last} across ${trend.weeks} weeks, a slope of ${trend.perWeek} ${trend.unit} in the wrong direction and outside the ±${trend.band} flat band. ${trend.weeks} readings is past the ${ANALYTICS.REGRESSION_WEEKS} a regression needs before it is named.`,
          evidence: {
            perWeek: trend.perWeek, first: trend.first ?? null, last: trend.last ?? null,
            weeks: trend.weeks, flatBand: trend.band, better: trend.better,
          },
          confidence: context.confidence(),
          sourceEngine: trend.source,
        }));

      return {
        patch: { findings: [...(draft.findings ?? []), ...items] },
        message: `${items.length} measure${items.length === 1 ? '' : 's'} declined across the window: ${items.map((item) => item.metric).join(', ')}.`,
      };
    },
  }),

  defineRule({
    id: 'improvement.goal-approaching',
    name: 'The goal weight is being approached',
    scope: 'analytics',
    priority: 85,
    when: (context) => context.trend('weightKg').direction === ANALYTICS_DIRECTION.IMPROVING &&
      context.goalProgressPercent !== null,
    apply: (context, draft) => {
      const trend = context.trend('weightKg');

      return {
        patch: add(draft, {
          key: 'improvement.goal-weight',
          kind: ANALYTICS_FINDING.IMPROVEMENT,
          metric: 'weightKg',
          title: 'The scale is moving toward the goal',
          summary: `${context.goalProgressPercent}% of the way, at ${trend.perWeek} kg per week.`,
          reason: `The fitted slope through ${trend.weeks} weeks of weekly averages is ${trend.perWeek} kg per week, pointing toward the ${context.goal.goalKg} kg goal rather than away from it. The body engine put the journey at ${context.goalProgressPercent}% complete.`,
          evidence: {
            perWeek: trend.perWeek,
            weeks: trend.weeks,
            goalKg: context.goal.goalKg ?? null,
            progressPercent: context.goalProgressPercent,
          },
          confidence: context.confidence(),
          sourceEngine: 'body-engine',
        }),
        message: 'The scale is moving toward the goal, as the body engine already measured both the rate and the distance covered.',
      };
    },
  }),
];
