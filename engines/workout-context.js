/**
 * workout-context.js — turns raw records into the facts the workout rules read.
 *
 * Same job as plan-context.js does for the planner: derive everything once, so
 * a rule is a one-line condition over flat facts rather than a data-mining
 * exercise. Pure — it is handed data and returns data.
 */

import { round, mean, sum } from './calculation-engine.js';
import { StrengthEngine } from './strength-engine.js';
import { EQUIPMENT, MUSCLE } from '../data/taxonomy.js';
import { WORKOUT, EXPERIENCE, PROGRESSION, UNITS } from './constants.js';

const MS_PER_DAY = 86400000;

/**
 * Assumed when nobody has said what they have. A standard commercial gym —
 * the engine reports the assumption in its reasons so it can be corrected.
 */
export const ASSUMED_EQUIPMENT = Object.freeze([
  EQUIPMENT.BARBELL, EQUIPMENT.DUMBBELL, EQUIPMENT.BENCH, EQUIPMENT.MACHINE,
  EQUIPMENT.CABLE, EQUIPMENT.PULLUP_BAR, EQUIPMENT.NONE, EQUIPMENT.MAT,
]);

/** Every muscle the volume budget tracks. */
export const TRACKED_MUSCLES = Object.freeze([
  MUSCLE.CHEST, MUSCLE.UPPER_BACK, MUSCLE.LATS, MUSCLE.FRONT_DELTS,
  MUSCLE.SIDE_DELTS, MUSCLE.REAR_DELTS, MUSCLE.BICEPS, MUSCLE.TRICEPS,
  MUSCLE.QUADS, MUSCLE.HAMSTRINGS, MUSCLE.GLUTES, MUSCLE.CALVES, MUSCLE.CORE,
]);

/** ISO date n days before another. */
function daysBefore(isoDate, days) {
  const time = new Date(`${isoDate}T00:00:00Z`).getTime();
  return new Date(time - days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Match a logged exercise to a database record.
 *
 * Logged names are free text — "Barbell Back Squat", "back squat", or the id
 * itself. Progression only works when a logged set can be tied to the record
 * it belongs to, so the match is tried three ways before giving up.
 *
 * @returns {string} the database id, or the slug when nothing matches
 */
export function resolveExerciseId(name, db = null) {
  const slug = slugOf(name);
  if (!db) return slug;
  if (db.has?.(slug)) return slug;

  const byName = db.all?.().find((record) => slugOf(record.name) === slug);
  if (byName) return byName.id;

  // "barbell-back-squat" logged against a record called "back-squat".
  const bySuffix = db.all?.().find(
    (record) => slug.endsWith(record.id) || record.id.endsWith(slug)
  );
  return bySuffix ? bySuffix.id : slug;
}

/**
 * Group logged sets by exercise, newest session first.
 * @returns {Map<string, object[][]>} exercise id → sessions → sets
 */
function sessionsByExercise(history, db = null) {
  const byExercise = new Map();

  for (const set of history) {
    if (!set?.exercise) continue;
    const key = resolveExerciseId(set.exercise, db);
    if (!byExercise.has(key)) byExercise.set(key, new Map());

    const byDate = byExercise.get(key);
    if (!byDate.has(set.date)) byDate.set(set.date, []);
    byDate.get(set.date).push(set);
  }

  const out = new Map();
  for (const [key, byDate] of byExercise) {
    const sessions = [...byDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, sets]) => ({ date, sets }));
    out.set(key, sessions);
  }
  return out;
}

/**
 * Summarise one exercise's history into the numbers a progression rule needs.
 * @returns {{sessions, last, best, stalls, trend}|null}
 */
function summarisePerformance(sessions) {
  if (!sessions?.length) return null;

  const summarise = ({ date, sets }) => ({
    date,
    sets: sets.length,
    /**
     * A set logged as failed is evidence, but not evidence of success. It is
     * excluded from the numbers progression reads, so a session where the reps
     * were missed cannot be mistaken for one where the target was hit.
     */
    failed: sets.some((s) => s.status === 'failed'),
    topWeightKg: Math.max(...sets.map((s) => s.weightKg ?? 0)),
    topReps: Math.max(...sets.filter((s) => s.status !== 'failed').map((s) => s.reps ?? 0), 0),
    avgReps: round(mean(sets.map((s) => s.reps ?? 0)), 1),
    avgRpe: sets.some((s) => typeof s.rpe === 'number')
      ? round(mean(sets.filter((s) => typeof s.rpe === 'number').map((s) => s.rpe)), 1)
      : null,
    volumeKg: StrengthEngine.totalVolume(sets),
  });

  const rows = sessions.map(summarise);
  const last = rows[0];

  // A stall is a session that did not beat the one before it on load or reps.
  let stalls = 0;
  for (let i = 0; i < rows.length - 1; i += 1) {
    const now = rows[i];
    const before = rows[i + 1];
    const improved = now.topWeightKg > before.topWeightKg ||
      (now.topWeightKg === before.topWeightKg && now.topReps > before.topReps);
    if (improved) break;
    stalls += 1;
  }

  const best = rows.reduce((top, row) =>
    row.topWeightKg > top.topWeightKg ? row : top, rows[0]);

  return {
    sessions: rows.length,
    history: rows,
    last,
    best,
    stalls,
    trend: stalls >= PROGRESSION.STALL_SESSIONS ? 'stalled'
      : stalls === 0 ? 'progressing' : 'flat',
  };
}

/**
 * Build the workout context.
 *
 * @param {object} input
 * @param {object} input.weeklyPlan   from PlannerEngine — the source of days,
 *                                    phase, intensity and time budget
 * @param {object} input.profile
 * @param {object} [input.settings]
 * @param {object[]} [input.goals]
 * @param {object[]} [input.gymHistory]   logged sets
 * @param {object} [input.exerciseDb]     injected so the engine can be tested
 *                                        against a fixture database
 * @returns {object}
 */
export function createWorkoutContext({
  weeklyPlan,
  profile = null,
  settings = null,
  goals = [],
  gymHistory = [],
  exerciseDb = null,
} = {}) {
  const phase = weeklyPlan?.phase ?? 'hypertrophy';
  const weekStart = weeklyPlan?.startDate ?? null;

  /* Level caps both exercise difficulty and weekly volume. */
  const level = profile?.experienceLevel ?? EXPERIENCE.BEGINNER;
  const setBudget = WORKOUT.WEEKLY_SETS_BY_LEVEL[level] ?? WORKOUT.WEEKLY_SETS_BY_LEVEL.beginner;
  const phaseFactor = WORKOUT.PHASE_VOLUME_FACTOR[phase] ?? 1;

  /* Equipment: what was stated, or a stated assumption. */
  const stated = settings?.availableEquipment ?? [];
  const equipmentAssumed = stated.length === 0;
  const equipment = equipmentAssumed ? [...ASSUMED_EQUIPMENT] : stated;

  /* History windows. */
  const rotationCutoff = weekStart
    ? daysBefore(weekStart, WORKOUT.ROTATION_LOOKBACK_WEEKS * UNITS.DAYS_PER_WEEK)
    : null;
  const lastWeekCutoff = weekStart ? daysBefore(weekStart, UNITS.DAYS_PER_WEEK) : null;

  const recentSets = rotationCutoff
    ? gymHistory.filter((set) => set.date >= rotationCutoff && set.date < weekStart)
    : gymHistory;

  const lastWeekSets = lastWeekCutoff
    ? gymHistory.filter((set) => set.date >= lastWeekCutoff && set.date < weekStart)
    : [];

  /* Per-exercise performance. */
  const sessions = sessionsByExercise(gymHistory, exerciseDb);
  const performance = new Map();
  for (const [id, rows] of sessions) performance.set(id, summarisePerformance(rows));

  /* Volume actually done last week, per muscle. Secondary work counts half:
     a row trains the biceps, but not the way a curl does. */
  const setsByMuscle = {};
  for (const muscle of TRACKED_MUSCLES) setsByMuscle[muscle] = 0;

  for (const set of lastWeekSets) {
    const record = exerciseDb?.byId?.(resolveExerciseId(set.exercise, exerciseDb));
    const primary = record?.muscles?.primary ?? (set.muscle ? [set.muscle] : []);
    const secondary = record?.muscles?.secondary ?? [];

    for (const muscle of primary) {
      if (muscle in setsByMuscle) setsByMuscle[muscle] += set.sets ?? 1;
    }
    for (const muscle of secondary) {
      if (muscle in setsByMuscle) setsByMuscle[muscle] += (set.sets ?? 1) * 0.5;
    }
  }
  for (const muscle of TRACKED_MUSCLES) {
    setsByMuscle[muscle] = round(setsByMuscle[muscle], 1);
  }

  /* Gym days from the plan, with their time budgets. */
  const gymDays = (weeklyPlan?.days ?? [])
    .filter((day) => day.type === 'gym')
    .map((day, index) => ({ ...day, index }));

  return Object.freeze({
    weekNumber: weeklyPlan?.weekNumber ?? 1,
    weekStart,
    weekEnd: weeklyPlan?.endDate ?? null,
    phase,
    deload: Boolean(weeklyPlan?.deload),
    volumeFactor: weeklyPlan?.summary?.volumeFactor ?? 1,

    profile,
    settings,
    goals,
    level,
    goal: profile?.goal ?? 'maintain',

    equipment,
    equipmentAssumed,
    restrictedMovements: settings?.restrictedMovements ?? [],
    excludedExercises: settings?.excludedExercises ?? [],
    correctiveNeeds: settings?.correctiveNeeds ?? [],
    injuries: settings?.injuries ?? '',

    gymDays,
    gymDayCount: gymDays.length,

    /** Weekly working-set target per muscle, after level and phase. */
    weeklySetTarget: round(setBudget.target * phaseFactor, 0),
    weeklySetMin: round(setBudget.min * phaseFactor, 0),
    weeklySetMax: round(setBudget.max * phaseFactor, 0),

    recovery: {
      strainIndex: weeklyPlan?.recovery?.strainIndex ?? 0,
      score: weeklyPlan?.recovery?.score ?? null,
      restDays: weeklyPlan?.recovery?.restDays ?? 0,
    },

    history: {
      performance,
      recentExerciseIds: [...new Set(recentSets.map((set) => resolveExerciseId(set.exercise, exerciseDb)))],
      lastWeekSetsByMuscle: setsByMuscle,
      lastWeekTotalSets: round(sum(lastWeekSets.map((set) => set.sets ?? 1)), 0),
      hasHistory: gymHistory.length > 0,
    },

    exerciseDb,
  });
}

/** Logged exercise names are free text; match them to database ids. */
export function slugOf(name) {
  return String(name ?? '').toLowerCase().trim().replace(/\s+/g, '-');
}
