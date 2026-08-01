/**
 * nutrition-context.js — the facts the nutrition rules read.
 *
 * Everything expensive is derived once, and every derivation that another
 * engine already owns is delegated to it: energy from the energy engine,
 * weight trend from the body engine, training volume from the workout and
 * running weeks, adherence from the execution engines' output.
 *
 * Pure. It is handed data and returns data.
 */

import { round, mean, sum, clamp } from './calculation-engine.js';
import { EnergyEngine } from './energy-engine.js';
import { BodyEngine } from './body-engine.js';
import { AdjustmentEngine } from './adjustment-engine.js';
import {
  NUTRITION_GOAL, GOAL_ALIASES, DEFICIT_GOALS, SURPLUS_GOALS,
  ADJUSTMENT, STRAIN, UNITS, MEAL_DISTRIBUTION,
} from './constants.js';

/** Map a stored profile goal onto a nutrition goal. */
export function normaliseGoal(goal) {
  if (!goal) return NUTRITION_GOAL.MAINTENANCE;
  return GOAL_ALIASES[goal] ?? goal;
}

/**
 * How the week's training is distributed across the seven days.
 * Reads the weeks the workout and running engines already built.
 */
function trainingByDate(workoutWeek, runningWeek) {
  const byDate = new Map();

  for (const day of workoutWeek?.days ?? []) {
    const entry = byDate.get(day.date) ?? { gym: null, run: null };
    entry.gym = {
      minutes: day.estimatedMinutes ?? 0,
      sets: day.exercises?.filter((exercise) => !exercise.corrective)
        .reduce((total, exercise) => total + exercise.sets, 0) ?? 0,
      goal: day.goal,
    };
    byDate.set(day.date, entry);
  }

  for (const session of runningWeek?.sessions ?? []) {
    const entry = byDate.get(session.date) ?? { gym: null, run: null };
    entry.run = {
      minutes: session.totalMinutes ?? 0,
      distanceKm: session.distanceKm ?? 0,
      isQuality: Boolean(session.recovery?.isQuality),
    };
    byDate.set(session.date, entry);
  }

  return byDate;
}

/**
 * How well the plan was actually followed, from the execution engines.
 * @returns {{sessions, completed, failedExercises, runsCompleted, adherence}}
 */
function adherenceFrom(sessions, runExecutions) {
  const lifting = sessions ?? [];
  const runs = runExecutions ?? [];

  const finished = lifting.filter((session) => session.state === 'completed');
  const completionRates = finished.map((session) => session.completionPercent ?? 0);

  const failedExercises = finished.reduce((total, session) =>
    total + (session.exercises ?? []).filter((exercise) => exercise.status === 'failed').length, 0);

  const runsCompleted = runs.filter((run) => run.verdict === 'complete' || run.verdict === 'shortened').length;

  const rates = [
    ...completionRates,
    ...runs.map((run) => run.completionPercent ?? 0),
  ];

  return {
    sessions: lifting.length,
    completed: finished.length,
    failedExercises,
    runsCompleted,
    runsLogged: runs.length,
    adherence: rates.length ? round(mean(rates), 0) : null,
  };
}

/**
 * Build the nutrition context.
 *
 * @param {object} input
 * @param {object} input.weeklyPlan
 * @param {object} [input.workoutWeek]
 * @param {object} [input.runningWeek]
 * @param {object} [input.profile]
 * @param {object} [input.settings]
 * @param {{date, kg}[]} [input.weightHistory]
 * @param {object[]} [input.sessions]        finished WorkoutSessions
 * @param {object[]} [input.runExecutions]   finished RunningExecutions
 * @param {object[]} [input.weeklyReports]
 * @param {number} [input.deficitWeeks]      consecutive weeks already in a deficit
 * @returns {object}
 */
export function createNutritionContext({
  weeklyPlan,
  workoutWeek = null,
  runningWeek = null,
  profile = null,
  settings = null,
  goals = [],
  weightHistory = [],
  sessions = [],
  runExecutions = [],
  weeklyReports = [],
  deficitWeeks = null,
  temperatureC = null,
  previousCalories = null,
} = {}) {
  const goal = normaliseGoal(profile?.goal);

  /* Energy comes from the energy engine — never recomputed here. */
  const energyProfile = profile ? { ...profile, goal: profile.goal } : {};
  const bmr = EnergyEngine.bmr(energyProfile);
  const tdee = EnergyEngine.tdee(energyProfile);
  const baseTarget = EnergyEngine.target({ ...energyProfile, goal });

  /* Weight trend and the adjustment verdict come from their own engines. */
  const trend = BodyEngine.recentTrend(weightHistory, ADJUSTMENT.WINDOW_DAYS);

  const adjustment = AdjustmentEngine.evaluate({
    readings: weightHistory,
    currentWeightKg: profile?.weightKg ?? null,
    goal,
    currentTargetKcal: baseTarget?.calories ?? null,
    maintenanceKcal: tdee,
  });

  /* Training load for the week, read from the weeks already built. */
  const byDate = trainingByDate(workoutWeek, runningWeek);

  const days = (weeklyPlan?.days ?? []).map((day) => {
    const training = byDate.get(day.date) ?? { gym: null, run: null };
    return {
      date: day.date,
      weekday: day.weekday,
      gym: training.gym,
      run: training.run,
      isTrainingDay: Boolean(training.gym),
      isRunningDay: Boolean(training.run),
      isRestDay: !training.gym && !training.run,
      trainingMinutes: (training.gym?.minutes ?? 0) + (training.run?.minutes ?? 0),
      runningKm: training.run?.distanceKm ?? 0,
    };
  });

  const restDays = days.filter((day) => day.isRestDay).length;

  /* How long the current phase of dieting has run. */
  const inDeficit = DEFICIT_GOALS.includes(goal);
  const weeksInDeficit = deficitWeeks ?? (inDeficit ? estimateDeficitWeeks(weeklyReports, weeklyPlan) : 0);

  const mealCount = MEAL_DISTRIBUTION.BY_APPETITE[settings?.appetite ?? 'normal'] ?? 4;

  return Object.freeze({
    weekNumber: weeklyPlan?.weekNumber ?? 1,
    weekStart: weeklyPlan?.startDate ?? null,
    weekEnd: weeklyPlan?.endDate ?? null,
    phase: weeklyPlan?.phase ?? 'hypertrophy',
    deload: Boolean(weeklyPlan?.deload),

    profile,
    settings,
    goals,
    goal,
    inDeficit,
    inSurplus: SURPLUS_GOALS.includes(goal),
    weightKg: profile?.weightKg ?? null,

    energy: { bmr, tdee, baseTarget },
    adjustment,

    weightTrend: {
      ratePerWeek: trend?.ratePerWeek ?? null,
      readings: trend?.readings ?? 0,
      targetRate: profile?.weightKg
        ? round((ADJUSTMENT.TARGET_RATE_FRACTION[goal] ?? 0) * profile.weightKg, 3)
        : null,
      status: adjustment.action === 'insufficient-data' ? 'unknown'
        : adjustment.action === 'hold' ? 'on-target'
        : adjustment.action === 'increase' ? 'below-target' : 'above-target',
    },

    days,
    restDays,
    trainingDays: days.filter((day) => day.isTrainingDay).length,
    runningDays: days.filter((day) => day.isRunningDay).length,

    training: {
      gymSets: workoutWeek?.totalWeeklySets ?? 0,
      gymMinutes: workoutWeek?.estimatedWeeklyMinutes ?? 0,
      runningKm: runningWeek?.weeklyDistanceKm ?? 0,
      runningMinutes: runningWeek?.weeklyDurationMin ?? 0,
      runningLoad: runningWeek?.weeklyLoad ?? 0,
    },

    recovery: {
      strainIndex: weeklyPlan?.recovery?.strainIndex ?? 0,
      score: weeklyPlan?.recovery?.score ?? null,
      isLow: (weeklyPlan?.recovery?.score ?? 10) <= STRAIN.LOW_RECOVERY_SCORE,
    },

    performance: adherenceFrom(sessions, runExecutions),
    weeksInDeficit,
    lastRefeedWeek: lastFlagWeek(weeklyReports, 'refeed'),
    lastDietBreakWeek: lastFlagWeek(weeklyReports, 'dietBreak'),

    mealCount,
    temperatureC,

    /** Last week's target, so the safety rules can cap the size of a change. */
    previousCalories,
  });
}

/** Weeks of reports that recorded a deficit, counting back from the latest. */
function estimateDeficitWeeks(reports, weeklyPlan) {
  const sorted = [...(reports ?? [])].sort((a, b) => String(b.weekStart).localeCompare(String(a.weekStart)));
  let weeks = 0;
  for (const report of sorted) {
    if (report?.nutritionSummary?.deficit === true) weeks += 1;
    else break;
  }
  // The week being planned is itself a deficit week.
  return weeks + 1;
}

/** The most recent week number carrying a flag, or null. */
function lastFlagWeek(reports, flag) {
  const found = [...(reports ?? [])]
    .filter((report) => report?.nutritionSummary?.[flag] === true)
    .sort((a, b) => String(b.weekStart).localeCompare(String(a.weekStart)))[0];
  return found?.weekStart ?? null;
}

export { NUTRITION_GOAL, DEFICIT_GOALS, SURPLUS_GOALS };
