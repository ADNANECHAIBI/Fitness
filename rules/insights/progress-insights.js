/**
 * progress-insights.js — what the direction of travel says.
 *
 * Every rule reads a figure the reports engine already produced. None of them
 * touch a formula: `paceTrend` is the running progress engine's, the weight
 * rate is the body engine's, the deltas are the report's own comparison with
 * the week before.
 */

import { defineRule } from '../rule.js';
import {
  INSIGHT_CATEGORY, INSIGHT_SEVERITY, INSIGHTS, REPORTS, WARNING,
} from '../../engines/constants.js';

const add = (draft, insight) => ({ insights: [...(draft.insights ?? []), insight] });

export const progressInsightRules = [
  defineRule({
    id: 'insight.performance-improving',
    name: 'Performance is improving',
    scope: 'insight',
    priority: 80,
    when: (context) => context.improvingSignals.length >= 2,
    apply: (context, draft) => {
      const evidence = {
        signals: context.improvingSignals,
        paceTrend: context.report.progress.paceTrend?.direction ?? null,
        paceSecPerKmPerWeek: context.report.progress.paceTrend?.secPerKmPerWeek ?? null,
        volumeChangeKg: context.report.progress.volumeChangeKg,
        adherenceChange: context.report.progress.adherenceChange,
        records: context.report.progress.strengthRecords,
      };

      const reason = `${context.improvingSignals.length} independent measures moved the same way this week: ${context.improvingSignals.join(', ')}. One number rising is noise; several rising together is a direction.`;

      return {
        patch: add(draft, {
          id: 'insight.performance-improving',
          key: 'progress.improving',
          category: INSIGHT_CATEGORY.PROGRESS,
          severity: INSIGHT_SEVERITY.POSITIVE,
          priority: INSIGHTS.PRIORITY.HIGH,
          title: 'Performance is moving forward',
          summary: `Several measures improved at once: ${context.improvingSignals.join(', ')}.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'reports-engine + running-progress-engine',
          date: context.date,
          relatedData: { explanations: ['progress.volumeChangeKg', 'adherence.overall'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.performance-declining',
    name: 'Performance is declining',
    scope: 'insight',
    priority: 85,
    when: (context) => context.decliningSignals.length >= 2,
    apply: (context, draft) => {
      const evidence = {
        signals: context.decliningSignals,
        paceTrend: context.report.progress.paceTrend?.direction ?? null,
        volumeChangeKg: context.report.progress.volumeChangeKg,
        distanceChangeKm: context.report.progress.distanceChangeKm,
        adherenceChange: context.report.progress.adherenceChange,
        deload: context.report.recovery.deload?.detected ?? false,
      };

      const reason = `${context.decliningSignals.length} measures fell together: ${context.decliningSignals.join(', ')}.${evidence.deload ? ' The week was a deload, so a fall is what was planned rather than a problem.' : ' Nothing in the plan asked for that.'}`;

      return {
        patch: add(draft, {
          id: 'insight.performance-declining',
          key: 'progress.declining',
          category: INSIGHT_CATEGORY.PROGRESS,
          severity: evidence.deload ? INSIGHT_SEVERITY.NEUTRAL : INSIGHT_SEVERITY.WARNING,
          priority: evidence.deload ? INSIGHTS.PRIORITY.LOW : INSIGHTS.PRIORITY.HIGH,
          title: evidence.deload ? 'Output fell, as the deload intended' : 'Performance is sliding',
          summary: `${context.decliningSignals.join(', ')} all moved down this week.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'reports-engine',
          date: context.date,
          relatedData: { explanations: ['progress.volumeChangeKg'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.weight-stalled-from-warning',
    name: 'The scale has stopped (from the report warning)',
    scope: 'insight',
    priority: 78,
    when: (context) => context.warned(WARNING.WEIGHT_STALLED),
    apply: (context, draft) => {
      const warning = context.warning(WARNING.WEIGHT_STALLED);
      const reason = `The reports engine raised a stall: ${warning.evidence.weeks} weeks inside ±${REPORTS.WEIGHT_STALL_KG} kg per week while the goal is ${warning.evidence.goal}.`;

      return {
        patch: add(draft, {
          id: 'insight.weight-stalled-from-warning',
          key: 'weight.stalled',
          category: INSIGHT_CATEGORY.WEIGHT,
          severity: INSIGHT_SEVERITY.WARNING,
          priority: INSIGHTS.PRIORITY.HIGH,
          title: 'Weight has stopped moving',
          summary: `${warning.evidence.weeks} weeks with the trend inside ±${REPORTS.WEIGHT_STALL_KG} kg per week on a ${warning.evidence.goal} goal.`,
          reason,
          evidence: warning.evidence,
          confidence: context.confidence(),
          sourceEngine: 'body-engine',
          date: context.date,
          relatedData: { warning: WARNING.WEIGHT_STALLED, explanations: ['weight.weeklyChangeKg', 'weight.flatWeeks'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.weight-stalled-from-trend',
    name: 'The scale has stopped (from the trend rate)',
    scope: 'insight',
    priority: 77,
    /* The same idea reached a second way. Both are kept deliberately: the
       merge step folds them and keeps whichever carries more evidence, which
       is how a conclusion drawn twice ends up stated once.

       It still needs more than one flat week. A single week's rate inside the
       band is what an ordinary week looks like — water, gut content and two
       weigh-ins — and calling that a stall would fire on almost every week. */
    when: (context) =>
      context.report.weight.weeklyChangeKg !== null &&
      Math.abs(context.report.weight.weeklyChangeKg) < REPORTS.WEIGHT_STALL_KG &&
      context.flatWeightWeeks >= REPORTS.WEIGHT_STALL_WEEKS - 1 &&
      context.directionalGoal,
    apply: (context, draft) => {
      const evidence = {
        weeklyChangeKg: context.report.weight.weeklyChangeKg,
        readings: context.report.weight.readings,
        flatWeeks: context.flatWeightWeeks,
        goal: context.report.goal,
        thresholdKg: REPORTS.WEIGHT_STALL_KG,
      };

      const reason = `The body engine's trend puts the rate at ${evidence.weeklyChangeKg} kg per week across ${evidence.readings} weigh-ins, inside the flat band for ${evidence.flatWeeks} weeks running, while the goal is ${evidence.goal}.`;

      return {
        patch: add(draft, {
          id: 'insight.weight-stalled-from-trend',
          key: 'weight.stalled',
          category: INSIGHT_CATEGORY.WEIGHT,
          severity: INSIGHT_SEVERITY.WARNING,
          priority: INSIGHTS.PRIORITY.MEDIUM,
          title: 'Weight has stopped moving',
          summary: `The trend rate is ${evidence.weeklyChangeKg} kg per week against a ${evidence.goal} goal.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'body-engine',
          date: context.date,
          relatedData: { explanations: ['weight.weeklyChangeKg'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.approaching-goal',
    name: 'The goal weight is close',
    scope: 'insight',
    priority: 70,
    when: (context) =>
      context.report.weight.progressPercent !== null &&
      context.report.weight.progressPercent >= INSIGHTS.GOAL_NEAR_PERCENT,
    apply: (context, draft) => {
      const evidence = {
        progressPercent: context.report.weight.progressPercent,
        currentKg: context.report.weight.lastKg,
        goalKg: context.report.weight.goalKg,
        rateKgPerWeek: context.report.weight.weeklyChangeKg,
        threshold: INSIGHTS.GOAL_NEAR_PERCENT,
      };

      const reason = `The body engine puts progress at ${evidence.progressPercent}% of the distance from the starting weight to ${evidence.goalKg} kg, with the scale at ${evidence.currentKg} kg.`;

      return {
        patch: add(draft, {
          id: 'insight.approaching-goal',
          key: 'weight.approaching-goal',
          category: INSIGHT_CATEGORY.WEIGHT,
          severity: INSIGHT_SEVERITY.POSITIVE,
          priority: INSIGHTS.PRIORITY.HIGH,
          title: 'The goal weight is within reach',
          summary: `${evidence.progressPercent}% of the way from the starting weight to ${evidence.goalKg} kg.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'body-engine',
          date: context.date,
          relatedData: { explanations: ['weight.progressPercent'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.weight-on-track',
    name: 'The scale is doing what the plan asked',
    scope: 'insight',
    priority: 30,
    when: (context) =>
      context.directionalGoal &&
      context.report.weight.weeklyChangeKg !== null &&
      Math.abs(context.report.weight.weeklyChangeKg) >= REPORTS.WEIGHT_STALL_KG,
    apply: (context, draft) => {
      const evidence = {
        weeklyChangeKg: context.report.weight.weeklyChangeKg,
        goal: context.report.goal,
        readings: context.report.weight.readings,
      };

      const reason = `The trend is moving at ${evidence.weeklyChangeKg} kg per week on a ${evidence.goal} goal. Whether that rate is the right one is the adjustment engine's judgement, not this one's.`;

      return {
        patch: add(draft, {
          id: 'insight.weight-on-track',
          key: 'weight.moving',
          category: INSIGHT_CATEGORY.WEIGHT,
          severity: INSIGHT_SEVERITY.NEUTRAL,
          priority: INSIGHTS.PRIORITY.BACKGROUND,
          title: 'The scale is moving',
          summary: `${evidence.weeklyChangeKg} kg per week on a ${evidence.goal} goal.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'body-engine',
          date: context.date,
          relatedData: { explanations: ['weight.weeklyChangeKg'] },
        }),
        message: reason,
      };
    },
  }),
];
