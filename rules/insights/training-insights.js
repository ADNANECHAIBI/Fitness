/**
 * training-insights.js — what the lifting, the running and the recovery say.
 *
 * Strength gains are read from the records the execution engine detected and
 * the estimates the strength engine produced; volume from the report's own
 * tonnage; load from the running progress engine. Nothing is measured here.
 */

import { defineRule } from '../rule.js';
import {
  INSIGHT_CATEGORY, INSIGHT_SEVERITY, INSIGHTS, WARNING, LAYOFF, REPORTS,
} from '../../engines/constants.js';
import { round, divide } from '../../engines/calculation-engine.js';

const add = (draft, insight) => ({ insights: [...(draft.insights ?? []), insight] });

/** Share the tonnage moved against the week before, or null. */
function volumeShare(report) {
  const change = report.progress.volumeChangeKg;
  const now = report.gym.volumeKg;
  if (change === null || now === null) return null;

  const before = now - change;
  return before > 0 ? divide(change, before) : null;
}

export const trainingInsightRules = [
  defineRule({
    id: 'insight.strength-gain',
    name: 'Strength went up',
    scope: 'insight',
    priority: 82,
    when: (context) =>
      context.report.gym.records.length > 0 ||
      context.report.gym.estimated1RM.some((row) => (row.changeKg ?? 0) > 0),
    apply: (context, draft) => {
      const gains = context.report.gym.estimated1RM.filter((row) => (row.changeKg ?? 0) > 0);

      const evidence = {
        records: context.report.gym.records,
        recordCount: context.report.gym.records.length,
        estimatedGains: gains,
        bestGainKg: gains.length ? Math.max(...gains.map((row) => row.changeKg)) : null,
      };

      const reason = evidence.recordCount
        ? `The execution engine detected ${evidence.recordCount} record${evidence.recordCount === 1 ? '' : 's'} this week${gains.length ? `, with the largest estimated one-rep max gain at ${evidence.bestGainKg} kg` : ''}. Estimated maxima come from a formula, not from a lift performed.`
        : `Estimated one-rep max rose on ${gains.length} exercise${gains.length === 1 ? '' : 's'}, the largest by ${evidence.bestGainKg} kg. These are formula estimates from the best working set, not tested maxima.`;

      return {
        patch: add(draft, {
          id: 'insight.strength-gain',
          key: 'strength.gain',
          category: INSIGHT_CATEGORY.STRENGTH,
          severity: INSIGHT_SEVERITY.POSITIVE,
          priority: INSIGHTS.PRIORITY.HIGH,
          title: 'Strength is up',
          summary: evidence.recordCount
            ? `${evidence.recordCount} personal record${evidence.recordCount === 1 ? '' : 's'} this week.`
            : `Estimated one-rep max improved on ${gains.length} exercise${gains.length === 1 ? '' : 's'}.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'execution-engine + strength-engine',
          date: context.date,
          relatedData: { explanations: ['gym.estimated1RM'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.volume-increase',
    name: 'Training volume rose',
    scope: 'insight',
    priority: 60,
    when: (context) => (volumeShare(context.report) ?? 0) >= INSIGHTS.VOLUME_CHANGE_SHARE,
    apply: (context, draft) => {
      const share = volumeShare(context.report);
      const evidence = {
        volumeKg: context.report.gym.volumeKg,
        changeKg: context.report.progress.volumeChangeKg,
        sharePercent: round(share * 100, 1),
        threshold: round(INSIGHTS.VOLUME_CHANGE_SHARE * 100, 0),
        sets: context.report.gym.sets,
        strainIndex: context.report.recovery.strainIndex,
      };

      const heavy = context.report.recovery.strainIndex !== null &&
        context.report.recovery.strainIndex >= 65;

      const reason = `Tonnage rose ${evidence.sharePercent}% on the week before, ${evidence.changeKg} kg more work.${heavy ? ` Strain is already at ${evidence.strainIndex}, so the rise is landing on a week that was not cheap.` : ' Recovery is not objecting to it.'}`;

      return {
        patch: add(draft, {
          id: 'insight.volume-increase',
          key: 'strength.volume-rise',
          category: INSIGHT_CATEGORY.STRENGTH,
          severity: heavy ? INSIGHT_SEVERITY.WARNING : INSIGHT_SEVERITY.NEUTRAL,
          priority: heavy ? INSIGHTS.PRIORITY.MEDIUM : INSIGHTS.PRIORITY.LOW,
          title: 'Training volume went up',
          summary: `${evidence.sharePercent}% more tonnage than the week before.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'strength-engine',
          date: context.date,
          relatedData: { explanations: ['gym.volumeKg', 'progress.volumeChangeKg'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.layoff',
    name: 'Nothing was trained',
    scope: 'insight',
    priority: 95,
    /* A week with nothing in it at all is not a layoff — it is an app that
       has not been used. The thin-data insight covers that case; this one
       needs either a plan that went unmet or some other evidence that the
       week happened. */
    when: (context) =>
      context.report.gym.sessions === 0 &&
      context.report.running.runs === 0 &&
      !context.report.quality.unreadableWeek &&
      (Boolean(context.report.quality.hasPlan) || !context.report.quality.empty),
    apply: (context, draft) => {
      const evidence = {
        sessions: context.report.gym.sessions,
        runs: context.report.running.runs,
        plannedSessions: context.report.gym.plannedSessions,
        plannedRuns: context.report.running.plannedRuns,
        daysWithData: context.report.coverage.daysWithData,
        breakAfterDays: LAYOFF.DAYS_TO_COUNT_AS_BREAK,
      };

      const planned = (evidence.plannedSessions ?? 0) + (evidence.plannedRuns ?? 0);

      const reason = `No session and no run was logged across the whole week${planned ? `, against ${planned} planned` : ''}. Seven days is the point the planner treats as a break, so the next week back is a return, not a continuation. Whether the training stopped or only the logging did, the data cannot say.`;

      return {
        patch: add(draft, {
          id: 'insight.layoff',
          key: 'consistency.layoff',
          category: INSIGHT_CATEGORY.CONSISTENCY,
          severity: INSIGHT_SEVERITY.CRITICAL,
          priority: INSIGHTS.PRIORITY.CRITICAL,
          title: 'A full week without training',
          summary: 'No lifting session and no run was logged this week.',
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'execution-engine + reports-engine',
          date: context.date,
          relatedData: { explanations: ['coverage.ratio'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.high-fatigue',
    name: 'Fatigue is high',
    scope: 'insight',
    priority: 80,
    when: (context) => context.warned(WARNING.HIGH_FATIGUE),
    apply: (context, draft) => {
      const warning = context.warning(WARNING.HIGH_FATIGUE);
      const evidence = {
        ...warning.evidence,
        strainIndex: context.report.recovery.strainIndex,
        recoveryStatus: context.report.recovery.status,
        deload: context.report.recovery.deload?.detected ?? false,
      };

      const reason = `Sessions averaged ${evidence.avgFatigue}/10 across ${evidence.sessions} logged session${evidence.sessions === 1 ? '' : 's'}, at or above the ${evidence.threshold} line, with strain at ${evidence.strainIndex ?? 'unknown'}. Fatigue is self-reported: it is how the week felt, which is evidence but not measurement.`;

      return {
        patch: add(draft, {
          id: 'insight.high-fatigue',
          key: 'recovery.fatigue',
          category: INSIGHT_CATEGORY.RECOVERY,
          severity: INSIGHT_SEVERITY.WARNING,
          priority: INSIGHTS.PRIORITY.HIGH,
          title: 'Sessions are feeling hard',
          summary: `Average reported fatigue was ${evidence.avgFatigue}/10.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'execution-engine',
          date: context.date,
          relatedData: { warning: WARNING.HIGH_FATIGUE, explanations: ['recovery.avgFatigue'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.under-recovery',
    name: 'Recovery is behind',
    scope: 'insight',
    priority: 90,
    when: (context) => context.warned(WARNING.UNDER_RECOVERY),
    apply: (context, draft) => {
      const warning = context.warning(WARNING.UNDER_RECOVERY);
      const evidence = { ...warning.evidence, deload: context.report.recovery.deload?.detected ?? false };

      const reason = `Recovery reads ${evidence.status ?? context.report.recovery.status}${evidence.score ? ` at ${evidence.score}/10` : ''} with the planner's strain index at ${evidence.strainIndex ?? 'unknown'}${evidence.sleepHours ? ` and sleep set to ${evidence.sleepHours} hours` : ''}.${evidence.deload ? ' A deload is already in place.' : ''}`;

      return {
        patch: add(draft, {
          id: 'insight.under-recovery',
          key: 'recovery.under-recovered',
          category: INSIGHT_CATEGORY.RECOVERY,
          severity: evidence.deload ? INSIGHT_SEVERITY.WARNING : INSIGHT_SEVERITY.CRITICAL,
          priority: INSIGHTS.PRIORITY.CRITICAL,
          title: 'Recovery is behind the training',
          summary: `Recovery is ${evidence.status ?? context.report.recovery.status} with strain at ${evidence.strainIndex ?? 'unknown'}.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'planner-engine',
          date: context.date,
          relatedData: { warning: WARNING.UNDER_RECOVERY, explanations: ['recovery.strainIndex'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.running-load',
    name: 'Running load is outside its band',
    scope: 'insight',
    priority: 85,
    when: (context) => context.warned(WARNING.OVERREACHING),
    apply: (context, draft) => {
      const warning = context.warning(WARNING.OVERREACHING);
      const evidence = { ...warning.evidence, distanceKm: context.report.running.distanceKm };

      const reason = `The running progress engine puts the last week at ${evidence.ratio}× the four-week average, outside the ${evidence.safeBand.join('–')} band, over ${evidence.distanceKm} km. The ratio is an association with injury risk in the literature, not a prediction about this week.`;

      return {
        patch: add(draft, {
          id: 'insight.running-load',
          key: 'running.load-spike',
          category: INSIGHT_CATEGORY.RUNNING,
          severity: INSIGHT_SEVERITY.WARNING,
          priority: INSIGHTS.PRIORITY.HIGH,
          title: 'Running load jumped',
          summary: `Acute load is ${evidence.ratio}× the four-week average.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'running-progress-engine',
          date: context.date,
          relatedData: { warning: WARNING.OVERREACHING, explanations: ['running.trainingLoad'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.deload',
    name: 'The week was a deload',
    scope: 'insight',
    priority: 40,
    when: (context) => context.report.recovery.deload?.detected === true,
    apply: (context, draft) => {
      const deload = context.report.recovery.deload;
      const evidence = {
        planned: deload.planned,
        volumeDropRatio: deload.volumeDropRatio,
        volumeKg: context.report.gym.volumeKg,
        dropThreshold: REPORTS.DELOAD_VOLUME_DROP,
      };

      const reason = deload.planned
        ? 'The plan for this week was generated as a deload, so lower output is the intention rather than a fall.'
        : `Tonnage fell by ${round((deload.volumeDropRatio ?? 0) * 100, 0)}% against the week before, at or past the ${round(REPORTS.DELOAD_VOLUME_DROP * 100, 0)}% line the reports engine reads as a deload. Nothing in the plan asked for it, so it is a deload by behaviour rather than by design.`;

      return {
        patch: add(draft, {
          id: 'insight.deload',
          key: 'recovery.deload',
          category: INSIGHT_CATEGORY.RECOVERY,
          severity: INSIGHT_SEVERITY.NEUTRAL,
          priority: INSIGHTS.PRIORITY.LOW,
          title: deload.planned ? 'A planned deload week' : 'An unplanned drop in load',
          summary: deload.planned ? 'The plan called for a deload.' : 'Tonnage fell far enough to read as a deload.',
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'reports-engine',
          date: context.date,
          relatedData: { explanations: ['recovery.deload'] },
        }),
        message: reason,
      };
    },
  }),
];
