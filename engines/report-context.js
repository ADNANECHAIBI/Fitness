/**
 * report-context.js — everything a report needs, cleaned once.
 *
 * The reports engine is handed raw storage: sessions, sets, runs, nutrition
 * days, weigh-ins, and whatever the planner produced for that week. Storage
 * can be incomplete (a week half logged), stale (a plan for another week) or
 * corrupt (a row with a date of "yesterday", a distance of `null`). Cleaning
 * that in the middle of a calculation is how a report ends up with NaN in it.
 *
 * So it happens here, once, and it is *counted*: every dropped row is
 * reported as `quality.dropped`, because a report built on eleven of twenty
 * rows should say so rather than look complete.
 *
 * The context computes no metrics. It windows, filters, sorts and counts.
 * Pure — no storage, no events, no dates read from the clock unless asked.
 */

import { startOfWeek, weekDates } from './plan-context.js';
import { toNumber } from './calculation-engine.js';
import { UNITS } from './constants.js';

const MS_PER_DAY = 86400000;

/** A usable ISO date, or null. A truthy string is not a date. */
function isoOrNull(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()) ? value : null;
}

/** The date n days after an ISO date. */
function shift(isoDate, days) {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * MS_PER_DAY)
    .toISOString().slice(0, 10);
}

/**
 * Keep the rows inside an inclusive date range, dropping anything unusable.
 *
 * @param {object[]} rows
 * @param {string} from
 * @param {string} to
 * @param {(row: object) => boolean} [usable] extra test beyond having a date
 * @returns {{kept: object[], dropped: number, outsideRange: number}}
 */
function window(rows, from, to, usable = () => true) {
  const list = Array.isArray(rows) ? rows : [];
  let dropped = 0;
  let outsideRange = 0;
  const kept = [];

  for (const row of list) {
    const date = isoOrNull(row?.date);

    if (date === null || !usable(row)) { dropped += 1; continue; }
    if (date < from || date > to) { outsideRange += 1; continue; }

    kept.push({ ...row, date });
  }

  kept.sort((a, b) => a.date.localeCompare(b.date));
  return { kept, dropped, outsideRange };
}

/** A run is usable when it has both a positive distance and a positive time. */
const usableRun = (run) => toNumber(run?.distanceKm) > 0 && toNumber(run?.durationMin) > 0;

/** A weigh-in is usable when it carries a number. Both field names are seen:
 *  the profile history writes `kg`, a weekly report writes `weightKg`. */
const usableWeight = (row) => toNumber(row?.kg ?? row?.weightKg) !== null;

/** Normalise a weigh-in to one shape, so nothing downstream asks twice. */
const asWeighIn = (row) => ({ date: row.date, kg: toNumber(row.kg ?? row.weightKg) });

/**
 * Build the context for one week.
 *
 * Everything is optional. A week with nothing in it is a legitimate report —
 * an empty one, that says why it is empty — not an error.
 *
 * @param {object} input
 * @param {string} [input.weekStart]     any date inside the week; snapped to Monday
 * @param {number} [input.weekNumber]
 * @param {string} [input.goal]
 * @param {object} [input.profile]       weightKg, goalWeightKg
 * @param {object} [input.planned]       plan, workoutWeek, runningWeek, nutritionWeek, mealWeek
 * @param {object} [input.history]       sessions, sets, runs, nutrition, weights, reports
 * @param {object} [input.recovery]      the recovery snapshot for that week
 * @param {object} [input.settings]      sleepHours
 * @returns {object} ReportContext
 */
export function createWeeklyReportContext({
  weekStart,
  weekNumber,
  goal,
  profile = {},
  planned = {},
  history = {},
  recovery = null,
  settings = {},
} = {}) {
  const anchor = isoOrNull(weekStart);
  const start = anchor ? startOfWeek(anchor) : null;

  /* Without a usable week there is nothing to window against. The report is
     still built — it will carry a data-missing warning — but on an empty
     context rather than on seven invented dates. */
  if (start === null) {
    return emptyContext({ weekNumber, goal, planned, profile, recovery, settings });
  }

  const end = shift(start, UNITS.DAYS_PER_WEEK - 1);
  const days = weekDates(start);

  const sessions = window(history.sessions, start, end);
  const sets = window(history.sets, start, end);
  const runs = window(history.runs, start, end, usableRun);
  const nutrition = window(history.nutrition, start, end);
  const weights = window(history.weights, start, end, usableWeight);

  /* Weigh-ins from before the week, kept for the trend fit: a rate of change
     cannot be read from seven days in isolation. */
  const weightsBefore = (Array.isArray(history.weights) ? history.weights : [])
    .filter((row) => isoOrNull(row?.date) && usableWeight(row) && row.date < start)
    .map(asWeighIn)
    .sort((a, b) => a.date.localeCompare(b.date));

  /* Every run up to the end of the week. The acute:chronic load ratio reads
     twenty-eight days, so the week alone cannot produce it — and a run logged
     after the week ended must not leak into a closed report. */
  const runsToDate = (Array.isArray(history.runs) ? history.runs : [])
    .filter((run) => isoOrNull(run?.date) && usableRun(run) && run.date <= end)
    .map((run) => ({ ...run }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const dropped =
    sessions.dropped + sets.dropped + runs.dropped + nutrition.dropped + weights.dropped;

  return Object.freeze({
    weekStart: start,
    weekEnd: end,
    weekNumber: weekNumber ?? planned.plan?.weekNumber ?? planned.nutritionWeek?.weekNumber ?? null,
    goal: goal ?? planned.plan?.goal ?? planned.nutritionWeek?.goal ?? null,
    days,

    profile: {
      weightKg: toNumber(profile?.weightKg),
      goalWeightKg: toNumber(profile?.goalWeightKg),
      startWeightKg: toNumber(profile?.startWeightKg),
    },

    planned: Object.freeze({
      plan: planned.plan ?? null,
      workoutWeek: planned.workoutWeek ?? null,
      runningWeek: planned.runningWeek ?? null,
      nutritionWeek: planned.nutritionWeek ?? null,
      mealWeek: planned.mealWeek ?? null,
    }),

    sessions: sessions.kept,
    sets: sets.kept,
    runs: runs.kept,
    runsToDate,
    nutrition: nutrition.kept,
    weights: weights.kept.map(asWeighIn),
    weightsBefore,

    /** Earlier weekly reports, newest last — what a streak is counted over. */
    previousReports: (Array.isArray(history.reports) ? history.reports : [])
      .filter((report) => isoOrNull(report?.weekStart) && report.weekStart < start)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart)),

    recovery,
    settings: { sleepHours: toNumber(settings?.sleepHours) },

    quality: Object.freeze({
      dropped,
      droppedBy: Object.freeze({
        sessions: sessions.dropped,
        sets: sets.dropped,
        runs: runs.dropped,
        nutrition: nutrition.dropped,
        weights: weights.dropped,
      }),
      daysLogged: new Set(nutrition.kept.map((row) => row.date)).size,
      daysInWeek: UNITS.DAYS_PER_WEEK,
      hasPlan: Boolean(planned.plan || planned.workoutWeek || planned.nutritionWeek),
      empty:
        !sessions.kept.length && !sets.kept.length && !runs.kept.length &&
        !nutrition.kept.length && !weights.kept.length,
    }),
  });
}

/** A context with a week that could not be read. Shaped exactly like a real one. */
function emptyContext({ weekNumber, goal, planned, profile, recovery, settings }) {
  return Object.freeze({
    weekStart: null,
    weekEnd: null,
    weekNumber: weekNumber ?? null,
    goal: goal ?? null,
    days: [],

    profile: {
      weightKg: toNumber(profile?.weightKg),
      goalWeightKg: toNumber(profile?.goalWeightKg),
      startWeightKg: toNumber(profile?.startWeightKg),
    },

    planned: Object.freeze({
      plan: planned?.plan ?? null,
      workoutWeek: planned?.workoutWeek ?? null,
      runningWeek: planned?.runningWeek ?? null,
      nutritionWeek: planned?.nutritionWeek ?? null,
      mealWeek: planned?.mealWeek ?? null,
    }),

    sessions: [], sets: [], runs: [], runsToDate: [], nutrition: [], weights: [], weightsBefore: [],
    previousReports: [],

    recovery: recovery ?? null,
    settings: { sleepHours: toNumber(settings?.sleepHours) },

    quality: Object.freeze({
      dropped: 0,
      droppedBy: Object.freeze({ sessions: 0, sets: 0, runs: 0, nutrition: 0, weights: 0 }),
      daysLogged: 0,
      daysInWeek: UNITS.DAYS_PER_WEEK,
      hasPlan: false,
      empty: true,
      unreadableWeek: true,
    }),
  });
}

/**
 * Group a list of weekly reports by calendar month.
 *
 * Reads either shape: the engine's own report carries `range.start`, the
 * stored WeeklyReport record carries `weekStart`. Anything with neither is
 * skipped rather than guessed at.
 *
 * @param {object[]} reports
 * @returns {Map<string, object[]>} keyed 'YYYY-MM'
 */
export function groupByMonth(reports) {
  const months = new Map();

  for (const report of Array.isArray(reports) ? reports : []) {
    const week = isoOrNull(report?.range?.start ?? report?.weekStart);
    if (week === null) continue;

    const month = week.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), report]);
  }

  const startOf = (report) => report?.range?.start ?? report?.weekStart;
  for (const [month, list] of months) {
    months.set(month, list.sort((a, b) => String(startOf(a)).localeCompare(String(startOf(b)))));
  }
  return months;
}

export { isoOrNull, shift as shiftDate };
