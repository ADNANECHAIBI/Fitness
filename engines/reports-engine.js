/**
 * reports-engine.js — phase 16. What happened, assembled.
 *
 * The engine that measures nothing. Every number in a report was produced by
 * an engine that owns it — tonnage by the strength engine, pace and load by
 * the running engines, targets by the nutrition engine, cost by the meal
 * engine, session verdicts by the execution engine, the weight trend by the
 * body engine. This file reads those results, counts them, puts them beside
 * each other and lets the rules say what that means.
 *
 * Three properties it is built to hold:
 *
 *   1. **No display logic.** A report is data. It holds no strings meant for
 *      a screen, no formatting, no language, no colours, no ordering for the
 *      eye. Anything that wants to draw one can; nothing in here knows it.
 *
 *   2. **Every figure is explainable.** `report.explain(key)` returns the
 *      value, the inputs it came from, the method in words and the engine
 *      that owns it. Recorded as each figure is produced, so it cannot drift
 *      out of step with the arithmetic.
 *
 *   3. **No advice without evidence.** A recommendation missing its reason,
 *      evidence, confidence or source engine is dropped before the report is
 *      returned, and the drop is recorded.
 *
 * Pure: same input, same report, no storage, no events, no clock except the
 * `generatedAt` stamp the caller can override.
 */

import { createWeeklyReportContext, groupByMonth } from './report-context.js';
import { createExplainer, SOURCE, describeExplanation } from './report-explain.js';
import {
  weightSummary, gymSummary, runningSummary, nutritionSummary, mealSummary,
  recoverySummary, deloadDetection, adherenceSummary, trainingLoadSummary, coverage,
} from './report-metrics.js';
import { applyAll, makeReason } from '../rules/rule.js';
import { REPORT_RULE_SETS } from '../rules/reports/index.js';
import { round, percentOf, toNumber } from './calculation-engine.js';
import { totalOf, meanOf, trendOf } from './trend.js';
import { RunningEngine } from './running-engine.js';
import { REPORTS, ACHIEVEMENT, UNITS } from './constants.js';

export const REPORTS_ENGINE_VERSION = '1.0.0';

/* ── Reading earlier reports ────────────────────────────────────────────────
   A report can be handed back its own predecessors, or the flatter records
   the WeeklyReport model stores. Both are read through these, so nothing
   downstream has to know which it got.                                     */

const priorAdherence = (report) =>
  toNumber(report?.adherence?.overall) ?? toNumber(report?.adherencePercent);

const priorWeeklyChange = (report) =>
  toNumber(report?.weight?.weeklyChangeKg) ?? toNumber(report?.weeklyChangeKg);

const priorMissed = (report) =>
  toNumber(report?.gym?.missedSessions) ?? toNumber(report?.missedSessions);

/**
 * How many weeks in a row, counting back from this one, satisfy a test.
 * Stops at the first week that does not — a streak with a hole is not a streak.
 */
function runLength(currentHolds, previous, holds) {
  if (!currentHolds) return 0;

  let count = 1;
  for (let i = previous.length - 1; i >= 0; i -= 1) {
    if (!holds(previous[i])) break;
    count += 1;
  }
  return count;
}

/* ── Weekly ─────────────────────────────────────────────────────────────── */

/**
 * Build the report for one week.
 *
 * @param {object} input see createWeeklyReportContext — plus `generatedAt`
 * @returns {object} WeeklyReport
 */
function weekly(input = {}) {
  const context = createWeeklyReportContext(input);
  const explain = createExplainer();

  const weight = weightSummary(context, explain);
  const gym = gymSummary(context, explain);
  const running = runningSummary(context, explain);
  const nutrition = nutritionSummary(context, explain);
  const meals = mealSummary(context, explain);
  const recovery = recoverySummary(context, explain);
  const deload = deloadDetection(context, gym, explain);
  const adherence = adherenceSummary({ gym, running, nutrition }, explain);
  const load = trainingLoadSummary({ gym, running }, explain);
  const dataCoverage = coverage(context, explain);

  /* Facts about the run of weeks this one sits in. Each is a count over the
     reports handed in, never a recalculation of what those weeks contained. */
  const previous = context.previousReports;
  const previousAdherence = previous.map(priorAdherence).filter((value) => value !== null);

  const flatWeightWeeks = runLength(
    weight.weeklyChangeKg !== null && Math.abs(weight.weeklyChangeKg) < REPORTS.WEIGHT_STALL_KG,
    previous,
    (report) => {
      const change = priorWeeklyChange(report);
      return change !== null && Math.abs(change) < REPORTS.WEIGHT_STALL_KG;
    }
  );

  const streakWeeks = runLength(
    adherence.overall !== null && adherence.overall >= REPORTS.ADHERENCE_LOW,
    previous,
    (report) => (priorAdherence(report) ?? -1) >= REPORTS.ADHERENCE_LOW
  );

  const repeatedMissWeeks = runLength(
    (gym.missedSessions ?? 0) > 0,
    previous,
    (report) => (priorMissed(report) ?? 0) > 0
  );

  explain.figure('streak.weeks', streakWeeks, {
    unit: 'weeks', source: SOURCE.REPORTS,
    method: `consecutive weeks, this one included, whose overall adherence reached ${REPORTS.ADHERENCE_LOW}%; the count stops at the first week that did not`,
    inputs: { previousWeeks: previous.length, previousAdherence },
  });

  explain.figure('weight.flatWeeks', flatWeightWeeks, {
    unit: 'weeks', source: SOURCE.REPORTS,
    method: `consecutive weeks whose trend rate stayed inside ±${REPORTS.WEIGHT_STALL_KG} kg per week`,
    inputs: { weeklyChangeKg: weight.weeklyChangeKg, previousWeeks: previous.length },
  });

  const progress = progressSummary({ context, weight, gym, running, nutrition, adherence }, explain);

  /* The rule context. Summaries only — the rules never see raw storage. */
  const base = {
    weekStart: context.weekStart,
    weekEnd: context.weekEnd,
    weekNumber: context.weekNumber,
    goal: context.goal,
    weight, gym, running, nutrition, meals, recovery, deload,
    adherence, load, progress,
    coverage: dataCoverage,
    quality: context.quality,
    previousAdherence,
    flatWeightWeeks,
    streakWeeks,
    repeatedMissWeeks,
  };

  const achieved = applyAll(REPORT_RULE_SETS.achievement, base, { achievements: [] });
  const warned = applyAll(REPORT_RULE_SETS.warning, base, { warnings: [] });

  /* Recommendations read the warnings, so they run last and see them. */
  const advised = applyAll(
    REPORT_RULE_SETS.recommend,
    { ...base, warnings: warned.draft.warnings, achievements: achieved.draft.achievements },
    { recommendations: [] }
  );

  const { kept, dropped } = withEvidenceOnly(advised.draft.recommendations);

  if (dropped.length) {
    explain.note('recommendations.dropped',
      `${dropped.length} recommendation${dropped.length === 1 ? '' : 's'} arrived without the reason, evidence, confidence or source engine phase 16 requires, and ${dropped.length === 1 ? 'was' : 'were'} dropped rather than shown.`,
      { inputs: { ids: dropped } });
  }

  const reasons = [...achieved.reasons, ...warned.reasons, ...advised.reasons];

  return Object.freeze({
    weekNumber: context.weekNumber,
    range: { start: context.weekStart, end: context.weekEnd, days: context.days },
    goal: context.goal,

    weight,
    gym,
    running,
    nutrition,
    meals,
    recovery: { ...recovery, deload },
    adherence,
    trainingLoad: load,
    progress,

    achievements: achieved.draft.achievements,
    warnings: warned.draft.warnings,
    recommendations: kept,

    reasons,
    explanations: explain.map(),

    coverage: dataCoverage,
    quality: context.quality,

    /** One figure, taken apart. */
    explain(key) { return explain.lookup(key); },
    /** The same, as a sentence — for a console or a test, not for a screen. */
    describe(key) { return describeExplanation(explain.lookup(key)); },

    meta: {
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      engineVersion: REPORTS_ENGINE_VERSION,
      engineId: 'reports-engine',
      rulesApplied: [...achieved.applied, ...warned.applied, ...advised.applied],
      recommendationsDropped: dropped,
    },
  });
}

/**
 * Drop anything that cannot show its work.
 * The phase's own rule, enforced here rather than trusted to each rule.
 */
function withEvidenceOnly(recommendations) {
  const kept = [];
  const dropped = [];

  for (const item of recommendations ?? []) {
    const hasEvidence = item?.evidence && Object.keys(item.evidence).length > 0;
    const complete = Boolean(item?.reason && item?.confidence && item?.sourceEngine && hasEvidence);

    if (complete) kept.push(item);
    else dropped.push(item?.id ?? 'unnamed');
  }

  return { kept, dropped };
}

/**
 * What moved, against the week before.
 * Deltas only — every absolute number in here was already produced above.
 */
function progressSummary({ context, weight, gym, running, nutrition, adherence }, explain) {
  const previous = context.previousReports.at(-1) ?? null;

  const delta = (now, before) =>
    now === null || before === null || before === undefined ? null : round(now - before, 2);

  const previousVolume = toNumber(previous?.gym?.volumeKg ?? previous?.gymSummary?.volumeKg);
  const previousDistance = toNumber(previous?.running?.distanceKm ?? previous?.runningSummary?.distanceKm);
  const previousCalories = toNumber(previous?.nutrition?.avgCalories ?? previous?.nutritionSummary?.avgCalories);

  const volumeChangeKg = explain.figure('progress.volumeChangeKg',
    delta(gym.volumeKg, previousVolume), {
      unit: 'kg', source: SOURCE.REPORTS,
      method: previous
        ? 'this week\'s tonnage minus the previous report\'s'
        : 'no previous report to compare against',
      inputs: { volumeKg: gym.volumeKg, previousVolumeKg: previousVolume },
    });

  return {
    comparedWith: previous?.range?.start ?? previous?.weekStart ?? null,
    weightChangeKg: weight.changeKg,
    weightRateKgPerWeek: weight.weeklyChangeKg,
    weightProgressPercent: weight.progressPercent,
    volumeChangeKg,
    distanceChangeKm: delta(running.distanceKm, previousDistance),
    calorieChange: delta(nutrition.avgCalories, previousCalories),
    adherenceChange: delta(adherence.overall, priorAdherence(previous)),
    paceTrend: running.allTime.paceTrend,
    strengthRecords: gym.records.length,
  };
}

/* ── Monthly ────────────────────────────────────────────────────────────── */

/* totalOf, meanOf and trendOf moved to engines/trend.js in phase 19, where the
   analytics engine reads them too. Same functions; two engines cannot now
   disagree about what a trend over the same weeks is. */

/**
 * Build the report for one month from the weekly reports inside it.
 *
 * It does not rebuild the weeks. A month is an aggregate of reports that were
 * already produced — pass them in, and anything they could not measure stays
 * unmeasured here rather than being filled in.
 *
 * @param {{month?: string, weeklyReports?: object[], generatedAt?: string}} input
 * @returns {object} MonthlyReport
 */
function monthly({ month, weeklyReports = [], generatedAt } = {}) {
  const explain = createExplainer();

  const all = [...weeklyReports]
    .filter((report) => report?.range?.start ?? report?.weekStart)
    .map((report) => ({ ...report, weekStart: report.range?.start ?? report.weekStart }))
    .sort((a, b) => String(a.weekStart).localeCompare(String(b.weekStart)));

  const grouped = groupByMonth(all);
  const key = month ?? (all.length ? all[0].weekStart.slice(0, 7) : null);
  const weeks = key ? (grouped.get(key) ?? []) : all;

  const reasons = [];

  if (!weeks.length) {
    explain.note('month.empty', 'No weekly report falls inside the month, so there is nothing to aggregate.',
      { inputs: { month: key, reportsGiven: all.length } });

    reasons.push(makeReason(
      { id: 'month.empty', name: 'Empty month', scope: 'month' },
      `No weekly report was found for ${key ?? 'the requested month'}. An empty month is reported as empty rather than as zeros, which would read as a month of doing nothing.`
    ));
  }

  const totals = {
    weeks: weeks.length,
    sessions: totalOf(weeks, (week) => week.gym?.completedSessions),
    plannedSessions: totalOf(weeks, (week) => week.gym?.plannedSessions),
    sets: totalOf(weeks, (week) => week.gym?.sets),
    volumeKg: totalOf(weeks, (week) => week.gym?.volumeKg),
    runs: totalOf(weeks, (week) => week.running?.runs),
    distanceKm: totalOf(weeks, (week) => week.running?.distanceKm),
    durationMin: totalOf(weeks, (week) => week.running?.durationMin),
    daysLogged: totalOf(weeks, (week) => week.nutrition?.daysLogged),
    mealCostMad: totalOf(weeks, (week) => week.meals?.costMad),
  };

  explain.figure('month.totals.volumeKg', totals.volumeKg, {
    unit: 'kg', source: SOURCE.REPORTS,
    method: `the tonnage of the ${weeks.length} weekly report${weeks.length === 1 ? '' : 's'} in the month, added`,
    inputs: { weeks: weeks.map((week) => week.gym?.volumeKg ?? null) },
  });

  const avgPaceSecPerKm = totals.distanceKm > 0
    ? RunningEngine.paceSecPerKm({ distanceKm: totals.distanceKm, durationMin: totals.durationMin })
    : null;

  explain.figure('month.running.avgPaceSecPerKm', avgPaceSecPerKm, {
    unit: 'sec/km', source: SOURCE.RUNNING,
    method: 'the month\'s total time over its total distance, through the running engine\'s pace formula',
    inputs: { distanceKm: totals.distanceKm, durationMin: totals.durationMin },
  });

  const weightTrend = trendOf(weeks, (week) => week.weight?.averageKg, { unit: 'kg/week' });
  const strengthTrend = trendOf(weeks, (week) => week.gym?.volumeKg, { unit: 'kg/week', decimals: 1 });
  const runningTrend = trendOf(weeks, (week) => week.running?.distanceKm, { unit: 'km/week' });
  const nutritionTrend = trendOf(weeks, (week) => week.nutrition?.avgCalories, { unit: 'kcal/week', decimals: 0 });
  const recoveryTrend = trendOf(weeks, (week) => week.recovery?.strainIndex, { unit: 'points/week', decimals: 1 });

  explain.figure('month.weightTrend', weightTrend.perWeek, {
    unit: 'kg/week', source: SOURCE.CALCULATION,
    method: `a least-squares line through each week's average weight, ${weightTrend.weeks} week${weightTrend.weeks === 1 ? '' : 's'} of readings`,
    inputs: { first: weightTrend.first ?? null, last: weightTrend.last ?? null },
    note: weightTrend.note,
  });

  const adherenceValues = weeks.map((week) => toNumber(week.adherence?.overall)).filter((n) => n !== null);
  const consistentWeeks = adherenceValues.filter((value) => value >= REPORTS.ADHERENCE_LOW).length;

  const consistency = {
    weeksMeasured: adherenceValues.length,
    weeksAtOrAboveThreshold: consistentWeeks,
    threshold: REPORTS.ADHERENCE_LOW,
    percent: explain.figure('month.consistencyPercent',
      adherenceValues.length ? percentOf(consistentWeeks, adherenceValues.length) : null, {
        unit: '%', source: SOURCE.REPORTS,
        method: `weeks whose overall adherence reached ${REPORTS.ADHERENCE_LOW}%, over the weeks that could be measured at all`,
        inputs: { consistentWeeks, weeksMeasured: adherenceValues.length, weeksInMonth: weeks.length },
        note: 'Weeks with nothing planned cannot be scored and are excluded from both sides of the ratio.',
      }),
    averageAdherence: meanOf(weeks, (week) => week.adherence?.overall, 0),
  };

  /* Records are read from what the weeks already granted — a month never
     re-detects a personal best. */
  const recordTypes = [ACHIEVEMENT.PERSONAL_BEST, ACHIEVEMENT.LONGEST_RUN, ACHIEVEMENT.BEST_PACE];
  const personalRecords = weeks
    .flatMap((week) => (week.achievements ?? [])
      .filter((achievement) => recordTypes.includes(achievement.type))
      .map((achievement) => ({ ...achievement, weekStart: week.weekStart })))
    .slice(0, REPORTS.MAX_RECORDS_LISTED);

  const best = adherenceValues.length
    ? weeks.reduce((leader, week) =>
      (toNumber(week.adherence?.overall) ?? -1) > (toNumber(leader.adherence?.overall) ?? -1) ? week : leader)
    : null;

  if (weeks.length) {
    reasons.push(makeReason(
      { id: 'month.assembled', name: 'Month assembled', scope: 'month' },
      `${weeks.length} weekly report${weeks.length === 1 ? '' : 's'} aggregated: ${totals.sessions} completed sessions, ${totals.volumeKg} kg of tonnage, ${totals.distanceKm} km run and ${totals.daysLogged} days of food logged. Nothing was recomputed from raw records — the month is the sum of the weeks, and inherits every gap they had.`,
      { month: key }
    ));

    if (weightTrend.perWeek === null) {
      reasons.push(makeReason(
        { id: 'month.no-weight-trend', name: 'No weight trend', scope: 'month' },
        weightTrend.note ?? 'The month could not fit a weight trend.',
        { weeks: weightTrend.weeks }
      ));
    }
  }

  return Object.freeze({
    month: key,
    weeklyReports: weeks,

    totals,
    running: { avgPaceSecPerKm, avgPace: RunningEngine.formatPace(avgPaceSecPerKm) },

    weightTrend,
    strengthTrend,
    runningTrend,
    nutritionTrend,
    recoveryTrend,

    consistency,
    personalRecords,

    summary: {
      weeks: weeks.length,
      achievements: weeks.reduce((count, week) => count + (week.achievements?.length ?? 0), 0),
      warnings: weeks.reduce((count, week) => count + (week.warnings?.length ?? 0), 0),
      recommendations: weeks.reduce((count, week) => count + (week.recommendations?.length ?? 0), 0),
      bestWeek: best ? { weekStart: best.weekStart, adherence: best.adherence?.overall ?? null } : null,
      deloadWeeks: weeks.filter((week) => week.recovery?.deload?.detected).length,
      averageWeeklyVolumeKg: meanOf(weeks, (week) => week.gym?.volumeKg, 1),
      averageWeeklyDistanceKm: meanOf(weeks, (week) => week.running?.distanceKm, 2),
      averageCalories: meanOf(weeks, (week) => week.nutrition?.avgCalories, 0),
      averageProteinG: meanOf(weeks, (week) => week.nutrition?.avgProteinG, 0),
    },

    reasons,
    explanations: explain.map(),
    explain(figureKey) { return explain.lookup(figureKey); },
    describe(figureKey) { return describeExplanation(explain.lookup(figureKey)); },

    meta: {
      generatedAt: generatedAt ?? new Date().toISOString(),
      engineVersion: REPORTS_ENGINE_VERSION,
      engineId: 'reports-engine',
      weeksInMonth: weeks.length,
      daysConsidered: weeks.length * UNITS.DAYS_PER_WEEK,
    },
  });
}

export const ReportsEngine = Object.freeze({
  weekly,
  monthly,

  /** Group weekly reports by calendar month, without building anything. */
  months(weeklyReports) { return groupByMonth(weeklyReports); },

  version: REPORTS_ENGINE_VERSION,
});
