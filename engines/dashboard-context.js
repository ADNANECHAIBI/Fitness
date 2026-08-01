/**
 * dashboard-context.js — what the dashboard engine and its rules read.
 *
 * The engine is handed the *output of other engines*, never records: a
 * WeeklyPlan, one day of a WorkoutWeek, one session of a RunningWeek, one day
 * of a NutritionWeek and of a MealPlanWeek, the recovery snapshot, the
 * WeeklyReport, the WeeklyInsights, and whatever intake has been logged for
 * the day. This file does not clean those up, correct them or fill them in.
 * It does three things and nothing else:
 *
 *   1. gives every piece a default, so a new user with no plan produces a
 *      snapshot that says "nothing yet" instead of throwing,
 *   2. records which of them actually arrived, so the snapshot can say what
 *      it is missing rather than showing a zero it invented,
 *   3. offers read-only conveniences over them — has a workout, has a run —
 *      each of which is a lookup, never a calculation.
 *
 * If a number is not in the input, it is not in the context. There is no
 * arithmetic in this file beyond `toNumber`, which reads rather than derives.
 *
 * Pure. No storage, no events, no clock.
 */

import { toNumber } from './calculation-engine.js';
import { RECOVERY_STATUS } from './constants.js';

/**
 * @typedef {object} DashboardInput
 * @property {string} date              the day being shown, ISO
 * @property {object} [plan]            WeeklyPlan            — planner-engine
 * @property {object} [planDay]         one DailyPlan out of it
 * @property {object} [workout]         one day of a WorkoutWeek — workout-engine
 * @property {object} [run]             one session of a RunningWeek — running-program-engine
 * @property {object} [nutrition]       one day of a NutritionWeek — nutrition-engine
 * @property {object} [meals]           one day of a MealPlanWeek — meal-planning-engine
 * @property {object} [logged]          the day's intake as logged
 * @property {object} [session]         the active WorkoutSession — execution-engine
 * @property {object} [recovery]        the recovery snapshot
 * @property {object} [report]          WeeklyReport          — reports-engine
 * @property {object} [insights]        WeeklyInsights        — insights-engine
 * @property {object} [weightProgress]  progress toward the goal weight — body-engine
 * @property {object[]} [notifications] unread stored notifications
 * @property {object} [settings]
 * @property {string} [generatedAt]
 */

/** Which inputs the snapshot needs, and what a missing one means. */
const SOURCES = Object.freeze({
  plan: 'planner-engine',
  workout: 'workout-engine',
  run: 'running-program-engine',
  nutrition: 'nutrition-engine',
  meals: 'meal-planning-engine',
  session: 'execution-engine',
  recovery: 'recovery',
  report: 'reports-engine',
  insights: 'insights-engine',
});

/**
 * Build the context one snapshot is assembled from.
 *
 * @param {DashboardInput} input
 * @returns {object} the context, frozen
 */
export function createDashboardContext(input = {}) {
  const date = input.date ?? null;

  const plan = input.plan ?? null;
  const planDay = input.planDay
    ?? (plan?.days ?? []).find((day) => day.date === date)
    ?? null;

  const workout = input.workout ?? null;
  const run = input.run ?? null;
  const nutrition = input.nutrition ?? null;
  const meals = input.meals ?? null;
  const logged = input.logged ?? null;
  const session = input.session ?? null;
  const recovery = input.recovery ?? null;
  const report = input.report ?? null;
  const insights = input.insights ?? null;

  /* Which engines were heard from. A snapshot that cannot say this ends up
     showing a blank where it should be showing "not planned yet". */
  const available = {
    plan: Boolean(plan),
    workout: Boolean(workout),
    run: Boolean(run),
    nutrition: Boolean(nutrition),
    meals: Boolean(meals),
    session: Boolean(session),
    recovery: Boolean(recovery),
    report: Boolean(report),
    insights: Boolean(insights),
  };

  const missing = Object.entries(available)
    .filter(([, present]) => !present)
    .map(([name]) => ({ input: name, engine: SOURCES[name] }));

  return Object.freeze({
    date,
    generatedAt: input.generatedAt ?? null,

    plan,
    planDay,
    workout,
    run,
    nutrition,
    meals,
    logged,
    session,
    recovery,
    report,
    insights,

    weightProgress: input.weightProgress ?? null,
    storedNotifications: input.notifications ?? [],
    settings: input.settings ?? {},

    available,
    missing,

    /* ── Conveniences. Every one is a lookup over the above. ───────────── */

    hasWorkout: Boolean(workout),
    hasRun: Boolean(run),
    hasMeals: Boolean(meals?.meals?.length),
    hasPlan: Boolean(plan),
    /** A day the plan set aside, or a day nothing was planned for at all. */
    restDay: Boolean(planDay) && !workout && !run,

    /** The session open right now, if it belongs to the day being shown. */
    activeSession: session?.date === date ? session : null,
    sessionInProgress: Boolean(session && session.date === date),

    intakeLogged: Boolean(logged),
    loggedCalories: toNumber(logged?.calories),
    loggedProteinG: toNumber(logged?.proteinG),

    targetCalories: toNumber(nutrition?.calories),
    targetProteinG: toNumber(nutrition?.proteinG),
    targetWaterL: toNumber(nutrition?.waterL) ?? toNumber(planDay?.waterL),

    recoveryStatus: recovery?.status ?? RECOVERY_STATUS.UNKNOWN,
    strainIndex: toNumber(recovery?.strainIndex),

    goal: nutrition?.goal ?? report?.goal ?? plan?.goal ?? input.goal ?? null,

    /** The report's warnings, or an empty list when there is no report. */
    warnings: report?.warnings ?? [],
    achievements: report?.achievements ?? [],
    recommendations: report?.recommendations ?? [],

    /** One figure out of the report's explanation map, or null. */
    figure(key) { return toNumber(report?.explanations?.[key]?.value); },

    /** Whether the week's report raised a warning of a given type. */
    warned(type) { return (report?.warnings ?? []).some((warning) => warning.type === type); },
  });
}

/** Which engine each input belongs to. Exported so a caller can name a gap. */
export { SOURCES as DASHBOARD_SOURCES };
