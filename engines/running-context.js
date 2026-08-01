/**
 * running-context.js — the facts the running rules read.
 *
 * Derives once, from the weekly plan, the profile and the run history. Pace
 * arithmetic comes from the running formulas in running-engine.js; nothing is
 * recomputed here that another engine already owns.
 */

import { round, mean, median, sum, clamp, divide } from './calculation-engine.js';
import { RunningEngine } from './running-engine.js';
import {
  RUNNING_PROGRAM, RUNNING_LOAD, RUN_TYPE, QUALITY_TYPES, MAX_HR,
  EXPERIENCE, UNITS,
} from './constants.js';

const MS_PER_DAY = 86400000;

const daysBefore = (isoDate, days) =>
  new Date(new Date(`${isoDate}T00:00:00Z`).getTime() - days * MS_PER_DAY)
    .toISOString().slice(0, 10);

const daysBetween = (from, to) =>
  Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / MS_PER_DAY);

/**
 * Training load for one run: minutes × session RPE.
 * Foster's session-RPE method — see RUNNING_LOAD in constants.js.
 */
export function sessionLoad(run) {
  const minutes = run?.durationMin ?? 0;
  const rpe = run?.sessionRpe
    ?? RUNNING_PROGRAM.SESSION_RPE[run?.type]
    ?? difficultyToRpe(run?.difficulty);
  return round(minutes * rpe, 0);
}

/** The Running model records difficulty, not RPE. Map one to the other. */
function difficultyToRpe(difficulty) {
  return { easy: 3, moderate: 5, hard: 7, max: 9 }[difficulty] ?? 5;
}

/**
 * Easy pace, in seconds per km.
 *
 * Taken from the median of logged easy runs. A median rather than a mean
 * because one interval session logged as a run would drag an average down and
 * make every prescription too fast.
 */
function deriveEasyPace(runs) {
  const easy = runs.filter((run) =>
    run.difficulty === 'easy' || run.difficulty === 'moderate' || !run.difficulty);

  const pool = easy.length >= 2 ? easy : runs;
  const paces = pool
    .map((run) => RunningEngine.paceSecPerKm(run))
    .filter((pace) => pace !== null);

  if (!paces.length) {
    return { secPerKm: RUNNING_PROGRAM.DEFAULT_EASY_PACE_SEC, assumed: true, samples: 0 };
  }

  const value = clamp(
    median(paces),
    RUNNING_PROGRAM.MIN_EASY_PACE_SEC,
    RUNNING_PROGRAM.MAX_EASY_PACE_SEC
  );

  return { secPerKm: round(value, 0), assumed: false, samples: paces.length };
}

/**
 * Build the running context.
 *
 * @param {object} input
 * @param {object} input.weeklyPlan      supplies the running days and recovery
 * @param {object} [input.profile]
 * @param {object} [input.settings]
 * @param {object[]} [input.runningHistory]
 * @param {object} [input.workoutWeek]   optional, to see the lifting load
 * @returns {object}
 */
export function createRunningContext({
  weeklyPlan,
  profile = null,
  settings = null,
  goals = [],
  runningHistory = [],
  workoutWeek = null,
} = {}) {
  const weekStart = weeklyPlan?.startDate ?? null;
  const runs = [...(runningHistory ?? [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const before = (days) => (weekStart ? daysBefore(weekStart, days) : null);
  const inWindow = (days) => {
    const cutoff = before(days);
    return cutoff ? runs.filter((run) => run.date >= cutoff && run.date < weekStart) : [];
  };

  const lastWeek = inWindow(UNITS.DAYS_PER_WEEK);
  const priorWeek = weekStart
    ? runs.filter((run) => run.date >= before(14) && run.date < before(7))
    : [];
  const acute = inWindow(RUNNING_LOAD.ACUTE_DAYS);
  const chronic = inWindow(RUNNING_LOAD.CHRONIC_DAYS);

  const lastWeekKm = round(sum(lastWeek.map((run) => run.distanceKm)), 2);
  const priorWeekKm = round(sum(priorWeek.map((run) => run.distanceKm)), 2);

  const acuteLoad = round(sum(acute.map(sessionLoad)), 0);
  const chronicLoad = round(
    divide(sum(chronic.map(sessionLoad)), RUNNING_LOAD.CHRONIC_DAYS / RUNNING_LOAD.ACUTE_DAYS) ?? 0,
    0
  );
  const loadRatio = chronicLoad > 0 ? round(acuteLoad / chronicLoad, 2) : null;

  /* Time since the last run. */
  const lastRunDate = runs[0]?.date ?? null;
  const layoffDays = lastRunDate && weekStart ? daysBetween(lastRunDate, weekStart) : null;

  /* Days the planner gave to running. */
  const runningDays = (weeklyPlan?.days ?? [])
    .filter((day) => day.type === 'running')
    .map((day, index) => ({ ...day, index }));

  const level = profile?.experienceLevel ?? EXPERIENCE.BEGINNER;
  const easyPace = deriveEasyPace(runs.slice(0, 20));

  /* Trend in pace: are recent easy runs faster than older ones? */
  const recentPaces = runs.slice(0, 5).map((run) => RunningEngine.paceSecPerKm(run)).filter(Boolean);
  const olderPaces = runs.slice(5, 12).map((run) => RunningEngine.paceSecPerKm(run)).filter(Boolean);
  const paceTrend = recentPaces.length >= 2 && olderPaces.length >= 2
    ? round(mean(recentPaces) - mean(olderPaces), 1)   // negative is faster
    : null;

  /* How much the lifting week is asking for. */
  const liftingStrain = weeklyPlan?.recovery?.strainIndex ?? 0;
  const liftingSets = workoutWeek?.totalWeeklySets ?? null;

  const maxHeartRate = profile?.age
    ? Math.round(MAX_HR.BASE - MAX_HR.AGE_COEFFICIENT * profile.age)
    : null;

  return Object.freeze({
    weekNumber: weeklyPlan?.weekNumber ?? 1,
    weekStart,
    weekEnd: weeklyPlan?.endDate ?? null,
    phase: weeklyPlan?.phase ?? 'hypertrophy',
    deload: Boolean(weeklyPlan?.deload),

    profile,
    settings,
    goals,
    goal: profile?.goal ?? 'maintain',
    level,

    runningDays,
    runningDayCount: runningDays.length,

    easyPace,
    maxHeartRate,

    history: {
      runs,
      hasHistory: runs.length > 0,
      totalRuns: runs.length,
      lastWeekKm,
      priorWeekKm,
      lastWeekRuns: lastWeek.length,
      longestRunKm: runs.length ? round(Math.max(...runs.map((run) => run.distanceKm ?? 0)), 2) : 0,
      qualityLastWeek: lastWeek.filter((run) =>
        QUALITY_TYPES.includes(run.type) || run.difficulty === 'hard' || run.difficulty === 'max').length,
      paceTrend,
      weeksRunning: estimateWeeksRunning(runs),
    },

    load: {
      acute: acuteLoad,
      chronic: chronicLoad,
      ratio: loadRatio,
      liftingStrain,
      liftingSets,
    },

    layoff: {
      days: layoffDays,
      lastRunDate,
      onBreak: layoffDays !== null && layoffDays >= RUNNING_PROGRAM.LAYOFF_DAYS,
    },

    restrictedFromRunning: Boolean(settings?.restrictedMovements?.includes('gait')),
    availableMinutes: runningDays.map((day) => day.durationMin),
  });
}

/** Distinct weeks that contain at least one run — a rough training age. */
function estimateWeeksRunning(runs) {
  const weeks = new Set(
    runs.map((run) => {
      const time = new Date(`${run.date}T00:00:00Z`).getTime();
      return Number.isFinite(time) ? Math.floor(time / (MS_PER_DAY * 7)) : null;
    }).filter((week) => week !== null)
  );
  return weeks.size;
}

export { RUN_TYPE, QUALITY_TYPES };
