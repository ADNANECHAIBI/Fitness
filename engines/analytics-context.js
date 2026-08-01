/**
 * analytics-context.js — the window a long-term analysis is fitted over.
 *
 * The analytics engine's whole input is a list of weekly reports and,
 * optionally, the monthly reports and insight sets already built over them.
 * This file turns that list into the window: it sorts it, clips it to the
 * requested range, counts what is actually on record inside it, and offers
 * readers for the figures the trends are fitted through.
 *
 * It derives nothing. Every reader here is a path into a report the reports
 * engine already produced — `week.gym.volumeKg` was the strength engine's
 * tonnage, `week.running.avgPaceSecPerKm` the running engine's pace,
 * `week.weight.averageKg` the mean the calculation engine took. If a figure
 * is absent from a report it is absent here, and the trend over it says so.
 *
 * Pure. No storage, no events, no clock.
 */

import { toNumber } from './calculation-engine.js';
import { normaliseGoal } from './nutrition-context.js';
import { seriesOf } from './trend.js';
import { ANALYTICS, ANALYTICS_PERIOD, UNITS, REPORTS } from './constants.js';

/**
 * The figures a long-term analysis is fitted through, and where each lives
 * inside a weekly report. The engine that owns each one is named so the
 * analysis can attribute a trend without knowing anything about the figure.
 */
export const METRICS = Object.freeze({
  weightKg: {
    read: (week) => week.weight?.averageKg,
    unit: 'kg/week', band: ANALYTICS.FLAT_BAND.weightKg, better: 'goal',
    source: 'body-engine', decimals: 3,
    label: 'body weight',
  },
  volumeKg: {
    read: (week) => week.gym?.volumeKg,
    unit: 'kg/week', band: ANALYTICS.FLAT_BAND.volumeKg, better: 'up',
    source: 'strength-engine', decimals: 1,
    label: 'lifting tonnage',
  },
  oneRepMaxKg: {
    read: (week) => bestOneRepMax(week),
    unit: 'kg/week', band: ANALYTICS.FLAT_BAND.oneRepMaxKg, better: 'up',
    source: 'strength-engine', decimals: 2,
    label: 'estimated one-rep max',
  },
  distanceKm: {
    read: (week) => week.running?.distanceKm,
    unit: 'km/week', band: ANALYTICS.FLAT_BAND.distanceKm, better: 'up',
    source: 'running-engine', decimals: 2,
    label: 'running distance',
  },
  paceSecPerKm: {
    read: (week) => week.running?.avgPaceSecPerKm,
    unit: 'sec/km/week', band: ANALYTICS.FLAT_BAND.paceSecPerKm, better: 'down',
    source: 'running-engine', decimals: 1,
    label: 'running pace',
  },
  trainingLoad: {
    read: (week) => week.running?.trainingLoad?.ratio,
    unit: 'ratio/week', band: ANALYTICS.FLAT_BAND.trainingLoad, better: 'neither',
    source: 'running-progress-engine', decimals: 3,
    label: 'acute:chronic running load',
  },
  calories: {
    read: (week) => week.nutrition?.avgCalories,
    unit: 'kcal/week', band: ANALYTICS.FLAT_BAND.calories, better: 'neither',
    source: 'nutrition-engine', decimals: 0,
    label: 'daily calories',
  },
  proteinG: {
    read: (week) => week.nutrition?.avgProteinG,
    unit: 'g/week', band: ANALYTICS.FLAT_BAND.proteinG, better: 'up',
    source: 'nutrition-engine', decimals: 1,
    label: 'daily protein',
  },
  strainIndex: {
    read: (week) => week.recovery?.strainIndex,
    unit: 'points/week', band: ANALYTICS.FLAT_BAND.strainIndex, better: 'down',
    source: 'planner-engine', decimals: 1,
    label: 'strain index',
  },
  sleepHours: {
    read: (week) => week.recovery?.avgSleepHours,
    unit: 'hours/week', band: ANALYTICS.FLAT_BAND.sleepHours, better: 'up',
    source: 'recovery', decimals: 2,
    label: 'sleep',
  },
  adherencePercent: {
    read: (week) => week.adherence?.overall,
    unit: 'points/week', band: ANALYTICS.FLAT_BAND.adherencePercent, better: 'up',
    source: 'reports-engine', decimals: 1,
    label: 'overall adherence',
  },
  consistencyPercent: {
    read: (week) => week.coverage?.ratio === null || week.coverage?.ratio === undefined
      ? null
      : week.coverage.ratio * 100,
    unit: 'points/week', band: ANALYTICS.FLAT_BAND.consistencyPercent, better: 'up',
    source: 'reports-engine', decimals: 1,
    label: 'how much of the week was logged',
  },
});

/**
 * The heaviest estimated one-rep max a week recorded.
 *
 * Not a calculation: the report's `gym.estimated1RM` list was built by the
 * strength engine and the execution engine between them, and this picks the
 * largest entry out of it. A max over numbers someone else produced.
 */
function bestOneRepMax(week) {
  const values = (week.gym?.estimated1RM ?? [])
    .map((entry) => toNumber(entry.valueKg))
    .filter((value) => value !== null);

  return values.length ? Math.max(...values) : null;
}

/** Was anything at all logged in this week? */
function weekHasData(week) {
  return Boolean(
    toNumber(week.gym?.sets) ||
    toNumber(week.running?.runs) ||
    toNumber(week.nutrition?.daysLogged) ||
    toNumber(week.weight?.readings)
  );
}

/** The Monday of a week report, whichever shape it arrived in. */
const startOf = (report) => report?.range?.start ?? report?.weekStart ?? null;

/**
 * Build the window one analysis runs over.
 *
 * @param {object} input
 * @param {object[]} input.weeklyReports  in any order; sorted here
 * @param {object[]} [input.monthlyReports]
 * @param {object[]} [input.weeklyInsights]
 * @param {string} [input.from]  ISO date, inclusive
 * @param {string} [input.to]    ISO date, inclusive
 * @param {string} [input.period] ANALYTICS_PERIOD
 * @param {object} [input.goal]  { goal, currentKg, goalKg, startKg }
 * @returns {object} the context, frozen
 */
export function createAnalyticsContext(input = {}) {
  const period = input.period ?? ANALYTICS_PERIOD.RANGE;

  const all = (input.weeklyReports ?? [])
    .filter((report) => startOf(report))
    .map((report) => ({ ...report, weekStart: startOf(report) }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const from = input.from ?? all[0]?.weekStart ?? null;
  const to = input.to ?? all.at(-1)?.weekStart ?? null;

  const weeks = all.filter((report) =>
    (!from || report.weekStart >= from) && (!to || report.weekStart <= to));

  const withData = weeks.filter(weekHasData);

  /* How much of the window is actually on record. The denominator is the
     weeks in the window, not the weeks that happen to carry data — a window
     of ten weeks with two logged is 20% covered, not 100%. */
  const coverageRatio = weeks.length ? withData.length / weeks.length : null;

  const level = coverageRatio === null
    ? REPORTS.CONFIDENCE_LEVEL.LOW
    : coverageRatio >= ANALYTICS.CONFIDENCE.HIGH_WEEKS
      ? REPORTS.CONFIDENCE_LEVEL.HIGH
      : coverageRatio >= ANALYTICS.CONFIDENCE.MEDIUM_WEEKS
        ? REPORTS.CONFIDENCE_LEVEL.MEDIUM
        : REPORTS.CONFIDENCE_LEVEL.LOW;

  const minWeeks = ANALYTICS.MIN_WEEKS[period] ?? REPORTS.MIN_WEEKS_FOR_TREND;

  /* The goal is resolved once, here, so the trend labelling and the rules
     cannot end up reading different goals for the same window. A caller may
     pass one; otherwise the newest report in the window is asked, since it
     was built against the goal that was in force. */
  const latest = weeks.at(-1) ?? null;
  const stated = input.goal?.goal ?? latest?.goal ?? null;

  /* The profile stores four goals ('bulk', 'cut', 'maintain', 'recomp') and
     the nutrition vocabulary has six. Comparing a stored goal against
     SURPLUS_GOALS or DEFICIT_GOALS without mapping it first silently fails
     for every cut — which is what happened until a test caught it. The
     mapping is the nutrition context's, reused rather than repeated. */
  const goal = {
    goal: stated ? normaliseGoal(stated) : null,
    statedGoal: stated,
    goalKg: toNumber(input.goal?.goalKg) ?? toNumber(latest?.weight?.goalKg),
    currentKg: toNumber(input.goal?.currentKg) ?? toNumber(latest?.weight?.currentKg),
    startKg: toNumber(input.goal?.startKg),
  };

  return Object.freeze({
    period,
    from,
    to,
    weeks,
    weeksInWindow: weeks.length,
    weeksWithData: withData.length,
    emptyWeeks: weeks.filter((week) => !weekHasData(week)).map((week) => week.weekStart),

    monthlyReports: input.monthlyReports ?? [],
    weeklyInsights: input.weeklyInsights ?? [],

    goal,
    latestReport: latest,

    coverage: { ratio: coverageRatio === null ? null : Number(coverageRatio.toFixed(2)), level, weeksWithData: withData.length },

    /** Whether the window is long enough for its period's claims. */
    sufficient: weeks.length >= minWeeks,
    minWeeks,

    /** The values of one metric across the window, nulls removed. */
    series(metric) { return seriesOf(weeks, METRICS[metric].read); },

    /** One metric's reader, without knowing what the metric is. */
    read(metric) { return METRICS[metric].read; },

    /** Every metric that has at least one reading in the window. */
    measurable() {
      return Object.keys(METRICS).filter((metric) => this.series(metric).length > 0);
    },

    /** Days the window spans, for a caller that wants to say so. */
    days: weeks.length * UNITS.DAYS_PER_WEEK,
  });
}
