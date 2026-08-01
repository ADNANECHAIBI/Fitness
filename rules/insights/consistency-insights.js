/**
 * consistency-insights.js — whether the plan was actually followed, and
 * whether enough of the week is on record to say so.
 *
 * The data-quality rule is deliberately an insight and not only a warning:
 * "there is not enough here to conclude anything" is itself the most useful
 * observation a thin week can produce, and burying it would let every other
 * insight in the set be read as though the week were complete.
 */

import { defineRule } from '../rule.js';
import {
  INSIGHT_CATEGORY, INSIGHT_SEVERITY, INSIGHTS, WARNING, REPORTS, UNITS,
} from '../../engines/constants.js';

const add = (draft, insight) => ({ insights: [...(draft.insights ?? []), insight] });

export const consistencyInsightRules = [
  defineRule({
    id: 'insight.excellent-consistency',
    name: 'Consistency is excellent',
    scope: 'insight',
    priority: 75,
    when: (context) =>
      context.report.adherence.overall !== null &&
      (context.report.adherence.overall >= REPORTS.ADHERENCE_PERFECT ||
        context.streakWeeks >= INSIGHTS.EXCELLENT_STREAK_WEEKS),
    apply: (context, draft) => {
      const evidence = {
        adherencePercent: context.report.adherence.overall,
        components: context.report.adherence.componentsCounted,
        gym: context.report.adherence.gym,
        running: context.report.adherence.running,
        nutrition: context.report.adherence.nutrition,
        streakWeeks: context.streakWeeks,
        threshold: REPORTS.ADHERENCE_PERFECT,
      };

      const reason = evidence.streakWeeks >= INSIGHTS.EXCELLENT_STREAK_WEEKS
        ? `${evidence.streakWeeks} weeks in a row at or above ${REPORTS.ADHERENCE_LOW}% adherence, this one at ${evidence.adherencePercent}% across ${evidence.components.join(', ')}.`
        : `Adherence came out at ${evidence.adherencePercent}% across ${evidence.components.join(', ')}, at or above the ${evidence.threshold}% line.`;

      return {
        patch: add(draft, {
          id: 'insight.excellent-consistency',
          key: 'consistency.excellent',
          category: INSIGHT_CATEGORY.CONSISTENCY,
          severity: INSIGHT_SEVERITY.POSITIVE,
          priority: INSIGHTS.PRIORITY.HIGH,
          title: 'Consistency is holding',
          summary: `${evidence.adherencePercent}% adherence${evidence.streakWeeks > 1 ? ` over a ${evidence.streakWeeks}-week streak` : ''}.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'reports-engine',
          date: context.date,
          relatedData: { explanations: ['adherence.overall', 'streak.weeks'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.low-adherence',
    name: 'The plan is not being followed',
    scope: 'insight',
    priority: 88,
    when: (context) =>
      context.report.adherence.overall !== null &&
      context.report.adherence.overall < REPORTS.ADHERENCE_LOW,
    apply: (context, draft) => {
      const evidence = {
        adherencePercent: context.report.adherence.overall,
        gym: context.report.adherence.gym,
        running: context.report.adherence.running,
        nutrition: context.report.adherence.nutrition,
        missedSessions: context.report.gym.missedSessions,
        threshold: REPORTS.ADHERENCE_LOW,
        coverage: context.report.coverage.ratio,
      };

      const weakest = ['gym', 'running', 'nutrition']
        .filter((key) => evidence[key] !== null && evidence[key] !== undefined)
        .sort((a, b) => evidence[a] - evidence[b])[0] ?? null;

      const reason = `Adherence came out at ${evidence.adherencePercent}%, below the ${evidence.threshold}% line${weakest ? `, with ${weakest} the weakest component at ${evidence[weakest]}%` : ''}. With ${Math.round(evidence.coverage * 100)}% of the week logged, part of the gap may be logging rather than doing — the data cannot separate the two.`;

      return {
        patch: add(draft, {
          id: 'insight.low-adherence',
          key: 'consistency.low-adherence',
          category: INSIGHT_CATEGORY.CONSISTENCY,
          severity: INSIGHT_SEVERITY.WARNING,
          priority: INSIGHTS.PRIORITY.CRITICAL,
          title: 'The plan was not followed',
          summary: `${evidence.adherencePercent}% adherence${weakest ? `, weakest in ${weakest}` : ''}.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'reports-engine',
          date: context.date,
          relatedData: { explanations: ['adherence.overall', 'coverage.ratio'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.adherence-improving',
    name: 'Adherence is climbing',
    scope: 'insight',
    priority: 50,
    when: (context) =>
      (context.report.progress.adherenceChange ?? 0) >= INSIGHTS.ADHERENCE_CHANGE_POINTS,
    apply: (context, draft) => {
      const evidence = {
        adherenceChange: context.report.progress.adherenceChange,
        adherencePercent: context.report.adherence.overall,
        comparedWith: context.report.progress.comparedWith,
        threshold: INSIGHTS.ADHERENCE_CHANGE_POINTS,
      };

      const reason = `Adherence rose ${evidence.adherenceChange} points on the week starting ${evidence.comparedWith}, to ${evidence.adherencePercent}%.`;

      return {
        patch: add(draft, {
          id: 'insight.adherence-improving',
          key: 'consistency.improving',
          category: INSIGHT_CATEGORY.CONSISTENCY,
          severity: INSIGHT_SEVERITY.POSITIVE,
          priority: INSIGHTS.PRIORITY.MEDIUM,
          title: 'Adherence is climbing',
          summary: `Up ${evidence.adherenceChange} points on the week before.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'reports-engine',
          date: context.date,
          relatedData: { explanations: ['adherence.overall'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.adherence-falling',
    name: 'Adherence is falling',
    scope: 'insight',
    priority: 72,
    when: (context) =>
      (context.report.progress.adherenceChange ?? 0) <= -INSIGHTS.ADHERENCE_CHANGE_POINTS,
    apply: (context, draft) => {
      const evidence = {
        adherenceChange: context.report.progress.adherenceChange,
        adherencePercent: context.report.adherence.overall,
        comparedWith: context.report.progress.comparedWith,
        threshold: -INSIGHTS.ADHERENCE_CHANGE_POINTS,
      };

      const reason = `Adherence fell ${Math.abs(evidence.adherenceChange)} points against the week starting ${evidence.comparedWith}, down to ${evidence.adherencePercent}%.`;

      return {
        patch: add(draft, {
          id: 'insight.adherence-falling',
          key: 'consistency.falling',
          category: INSIGHT_CATEGORY.CONSISTENCY,
          severity: INSIGHT_SEVERITY.WARNING,
          priority: INSIGHTS.PRIORITY.HIGH,
          title: 'Adherence is slipping',
          summary: `Down ${Math.abs(evidence.adherenceChange)} points on the week before.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'reports-engine',
          date: context.date,
          relatedData: { explanations: ['adherence.overall'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.thin-data',
    name: 'Too little of the week is on record',
    scope: 'insight',
    priority: 92,
    when: (context) =>
      context.report.coverage.level === REPORTS.CONFIDENCE_LEVEL.LOW ||
      context.report.quality.dropped > 0,
    apply: (context, draft) => {
      const evidence = {
        coverage: context.report.coverage.ratio,
        daysWithData: context.report.coverage.daysWithData,
        daysInWeek: UNITS.DAYS_PER_WEEK,
        droppedRecords: context.report.quality.dropped,
        droppedBy: context.report.quality.droppedBy,
        unreadableWeek: context.report.quality.unreadableWeek ?? false,
      };

      const reason = `${evidence.daysWithData} of ${evidence.daysInWeek} days carry any log${evidence.droppedRecords ? `, and ${evidence.droppedRecords} record${evidence.droppedRecords === 1 ? ' was' : 's were'} unreadable and dropped` : ''}. Every other insight in this set is drawn from that subset, and none of them should be read as describing the whole week.`;

      return {
        patch: add(draft, {
          id: 'insight.thin-data',
          key: 'health.thin-data',
          category: INSIGHT_CATEGORY.HEALTH,
          severity: INSIGHT_SEVERITY.NEUTRAL,
          priority: INSIGHTS.PRIORITY.CRITICAL,
          title: 'The week is barely on record',
          summary: `${evidence.daysWithData} of ${evidence.daysInWeek} days logged${evidence.droppedRecords ? `, ${evidence.droppedRecords} records dropped` : ''}.`,
          reason,
          evidence,
          confidence: REPORTS.CONFIDENCE_LEVEL.HIGH,
          sourceEngine: 'reports-engine',
          date: context.date,
          relatedData: { warning: WARNING.DATA_MISSING, explanations: ['coverage.ratio'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.missed-sessions',
    name: 'Planned sessions were missed',
    scope: 'insight',
    priority: 70,
    when: (context) => context.warned(WARNING.MISSED_WORKOUTS),
    apply: (context, draft) => {
      const warning = context.warning(WARNING.MISSED_WORKOUTS);
      const evidence = { ...warning.evidence, repeatedWeeks: context.repeatedMissWeeks };

      const reason = `${evidence.missed} of ${evidence.planned} planned sessions were not completed${evidence.abandoned ? `, and ${evidence.abandoned} were started and abandoned` : ''}${evidence.repeatedWeeks > 1 ? `, the ${evidence.repeatedWeeks}th week in a row with a miss` : ''}.`;

      return {
        patch: add(draft, {
          id: 'insight.missed-sessions',
          key: 'consistency.missed-sessions',
          category: INSIGHT_CATEGORY.CONSISTENCY,
          severity: INSIGHT_SEVERITY.WARNING,
          priority: INSIGHTS.PRIORITY.HIGH,
          title: 'Sessions were missed',
          summary: `${evidence.missed} of ${evidence.planned} planned sessions not completed.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'execution-engine',
          date: context.date,
          relatedData: { warning: WARNING.MISSED_WORKOUTS, explanations: ['gym.adherencePercent'] },
        }),
        message: reason,
      };
    },
  }),
];
