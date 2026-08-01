/**
 * workout-engine.js — builds one WorkoutWeek and nothing else.
 *
 * It renders nothing, stores nothing, fetches nothing, and imports no UI. It
 * holds no programme: every session is assembled from the WeeklyPlan, the
 * rules in rules/workout/ and whatever the exercise database contains. Change
 * a record and the programme changes with it.
 *
 * The pipeline:
 *   1. week rules   split, equipment, injury, volume, recovery, corrective
 *   2. per day      slots from the day's template, trimmed to the time budget
 *   3. per slot     criteria rules → database query → ranking → one exercise
 *   4. per exercise overload rules → sets, reps, load, RPE, warm-up
 *   5. per session  corrective work appended, then time-trimmed
 *
 * Every step writes its reason into the object it produced. Reasons are part
 * of the data model, not text assembled for a screen — a report generator or a
 * coach can read them without re-deriving anything.
 */

import { defineFormula, createSlot } from './formula.js';
import { round, memoize } from './calculation-engine.js';
import { createWorkoutContext, TRACKED_MUSCLES } from './workout-context.js';
import { selectOne, applyAll, makeReason } from '../rules/rule.js';
import {
  WORKOUT_RULE_SETS, rankCandidates, explainChoice, setsFor, warmupSetsFor, ACTION,
} from '../rules/workout/index.js';
import { ExerciseDB } from '../data/exercises/index.js';
import { WORKOUT, PRECISION, UNITS } from './constants.js';

export const WORKOUT_ENGINE_VERSION = '1.0.0';

/* ── Duration ───────────────────────────────────────────────────────────── */

/** Minutes one prescribed exercise takes, warm-up sets included. */
function exerciseMinutes(exercise) {
  const working = exercise.sets * (WORKOUT.SET_DURATION_SEC + exercise.restSec);
  const warmup = exercise.warmupSets * (WORKOUT.WARMUP_SET_DURATION_SEC + WORKOUT.WARMUP_REST_SEC);
  return (working + warmup) / UNITS.SECONDS_PER_MINUTE;
}

/** Minutes a corrective block takes. */
function correctiveMinutes(exercise) {
  return (exercise.sets * (WORKOUT.CORRECTIVE_SET_DURATION_SEC + exercise.restSec))
    / UNITS.SECONDS_PER_MINUTE;
}

/* ── Slot → exercise ────────────────────────────────────────────────────── */

/**
 * Fill one movement slot.
 * @returns {{exercise: object, reason: object, alternatives: string[]}|null}
 */
function fillSlot({ slot, position, context, week, usedIds, db, ruleSets }) {
  const slotContext = {
    slot: { ...slot, position },
    level: context.level,
    week,
    usedIds,
  };

  const built = applyAll(ruleSets.criteria, slotContext, {});
  const criteria = built.draft;

  // A blocked movement pattern never reaches the database.
  if ((week.blockedMovements ?? []).includes(slot.movement)) {
    return { blocked: true, movement: slot.movement };
  }

  const candidates = db.query(criteria);
  if (!candidates.length) return null;

  // The first two slots of a session are the main lifts: they keep their
  // exercise so progression has something to measure against.
  const preferContinuity = position <= 1;

  const ranked = rankCandidates(candidates, {
    recentIds: context.history.recentExerciseIds,
    correctiveTags: week.correctiveTags ?? [],
    pullBias: Boolean(week.pullBias),
    level: context.level,
    preferContinuity,
  });

  const winner = ranked[0];
  return {
    record: winner.candidate,
    criteria,
    preferContinuity,
    scoreParts: winner.parts,
    alternatives: ranked.slice(1, 4).map((entry) => entry.candidate.id),
    criteriaReasons: built.reasons,
  };
}

/**
 * Prescribe sets, reps, load and effort for one chosen exercise.
 * @returns {object} WorkoutExercise
 */
function prescribe({ record, context, week, ruleSets, isFirstForMuscle, choice }) {
  const performance = context.history.performance.get(record.id) ?? null;

  const decision = selectOne(ruleSets.overload, { record, performance, week, context });
  const plan = decision.patch;

  const [low, high] = week.repRange ?? [8, 12];
  const sets = setsFor(record, week);
  const restSec = Math.round((record.defaultRest ?? 90) * (week.restFactor ?? 1));

  const targetLoad = plan.targetLoadKg === null || plan.targetLoadKg === undefined
    ? null
    : round(plan.targetLoadKg * (week.loadFactor ?? 1), 1);

  const reps = plan.targetReps ?? (plan.action === ACTION.ADD_LOAD ? low : high);

  return {
    exerciseId: record.id,
    name: record.name,
    movement: record.movement,
    category: record.category,
    muscles: record.muscles,

    sets,
    reps,
    targetLoadKg: targetLoad,
    restSec,
    tempo: record.tempo,
    rpe: week.targetRpe ?? 8,
    warmupSets: warmupSetsFor(record, { isFirstForMuscle, targetLoadKg: targetLoad }),

    notes: record.cues?.[0] ?? null,
    alternatives: choice.alternatives,

    /** Why this exercise (part of the data model, not display text). */
    reason: makeReason(
      { id: 'selection.ranked-choice', name: 'Ranked selection', scope: 'exercise' },
      explainChoice(record, choice.scoreParts, {
        slotMovement: record.movement,
        alternativesCount: choice.alternatives.length,
        preferContinuity: choice.preferContinuity,
      }),
      { scoreParts: choice.scoreParts, criteria: choice.criteria }
    ),

    /** Why this load (also part of the data model). */
    progression: {
      action: plan.action,
      previous: performance
        ? { weightKg: performance.last.topWeightKg, reps: performance.last.topReps, rpe: performance.last.avgRpe, date: performance.last.date }
        : null,
      stalls: performance?.stalls ?? 0,
      reason: decision.reason,
    },
  };
}

/* ── Corrective work ────────────────────────────────────────────────────── */

function buildCorrective({ week, db, usedIds, seed }) {
  const tags = week.correctiveTags ?? [];
  if (!tags.length) return [];

  const pool = db.query({
    tags,
    equipment: week.equipment,
    exclude: usedIds,
  });
  if (!pool.length) return [];

  const chosen = db.pick(
    { tags, equipment: week.equipment, exclude: usedIds },
    { seed, count: WORKOUT.MAX_CORRECTIVE_EXERCISES }
  );

  return chosen.map((record) => ({
    exerciseId: record.id,
    name: record.name,
    movement: record.movement,
    category: record.category,
    muscles: record.muscles,
    sets: WORKOUT.CORRECTIVE_SETS,
    reps: WORKOUT.CORRECTIVE_REPS,
    targetLoadKg: null,
    restSec: WORKOUT.CORRECTIVE_REST_SEC,
    tempo: record.tempo,
    rpe: 6,
    warmupSets: 0,
    corrective: true,
    notes: record.cues?.[0] ?? null,
    alternatives: [],
    reason: makeReason(
      { id: 'corrective.appended', name: 'Corrective work', scope: 'exercise' },
      `${record.name} is added for ${tags.join(' and ')}. It sits at the end of the session at light load, so it costs nothing on the main lifts.`,
      { tags }
    ),
    progression: { action: 'hold', previous: null, stalls: 0, reason: null },
  }));
}

/* ── The engine ─────────────────────────────────────────────────────────── */

export const DEFAULT_WORKOUT_BUILDER = defineFormula({
  id: 'rule-based-workout-engine',
  name: 'Rule-based workout engine',
  source: 'Volume landmarks after Israetel M, et al. Scientific Principles of Hypertrophy Training. Renaissance Periodization; 2021. Frequency and set-volume relationships after Schoenfeld BJ, Ogborn D, Krieger JW. J Sports Sci. 2017;35(11):1073-1082. Double progression and RPE autoregulation are long-standing coaching practice rather than findings from either source.',
  accuracy: 'estimate',
  useWhen: 'Building a week of lifting from the days, equipment and history that actually exist. It prescribes structure and progression, not technique coaching.',
  caveat: 'It can only see logged sets. An unlogged session looks like it never happened, and a load recorded without an RPE gives the progression rules half the picture. It also cannot see how a lift felt, which is why every prescription is a starting point you are meant to adjust.',

  /**
   * @param {object} context  built by createWorkoutContext
   * @returns {object} WorkoutWeek
   */
  compute(context, ruleSets = WORKOUT_RULE_SETS, db = ExerciseDB) {
    const reasons = [];
    const notes = [];

    /* 1. Week-level decisions. */
    const split = selectOne(ruleSets.split, context);
    if (split.reason) reasons.push(split.reason);

    let week = { ...split.patch, deload: context.deload };

    for (const stage of ['equipment', 'injury', 'volume', 'recovery', 'corrective']) {
      const result = applyAll(ruleSets[stage], context, week);
      week = result.draft;
      reasons.push(...result.reasons);
    }

    /* 2. Days. */
    const templates = week.dayTemplates ?? [];
    const days = context.gymDays.map((planDay, dayIndex) => {
      const template = templates.length ? templates[dayIndex % templates.length] : null;
      return buildDay({ planDay, dayIndex, template, context, week, ruleSets, db, notes });
    });

    /* 3. Totals. */
    const totalSets = days.reduce(
      (sum, day) => sum + day.exercises.reduce((n, ex) => n + ex.sets, 0), 0);
    const totalMinutes = days.reduce((sum, day) => sum + day.estimatedMinutes, 0);

    /* 4. Audit the volume actually produced against the budget. */
    const perMuscle = volumePerMuscle(days);
    const audit = auditVolume(perMuscle, context, week);
    reasons.push(...audit.reasons);

    if (context.equipmentAssumed) {
      notes.push('Equipment was assumed, not stated. Setting it will change which exercises appear.');
    }
    if (!context.history.hasHistory) {
      notes.push('Nothing has been logged yet, so no loads are prescribed. After one logged session the engine starts progressing weights.');
    }

    return {
      weekNumber: context.weekNumber,
      phase: context.phase,
      deload: context.deload,
      split: week.split ?? 'none',
      startDate: context.weekStart,
      endDate: context.weekEnd,

      days,

      totalWeeklySets: totalSets,
      weeklySetsPerMuscle: perMuscle,
      volumeAudit: audit.summary,
      estimatedWeeklyMinutes: round(totalMinutes, 0),

      targets: {
        repRange: week.repRange ?? null,
        rpe: week.targetRpe ?? null,
        setsPerMuscle: week.weeklySetsPerMuscle ?? null,
        loadFactor: week.loadFactor ?? 1,
      },

      notes,
      reasons,

      meta: {
        generatedAt: new Date().toISOString(),
        engineVersion: WORKOUT_ENGINE_VERSION,
        engineId: 'rule-based-workout-engine',
        equipmentAssumed: context.equipmentAssumed,
        level: context.level,
      },
    };
  },
});

/** Build one WorkoutDay. */
function buildDay({ planDay, dayIndex, template, context, week, ruleSets, db, notes }) {
  // Warm-up and cool-down scale with the session. Spending eight minutes
  // warming up for a thirty-minute session leaves nothing to warm up for.
  const warmupMin = Math.min(WORKOUT.GENERAL_WARMUP_MIN, Math.max(3, Math.round(planDay.durationMin * 0.15)));
  const cooldownMin = Math.min(WORKOUT.COOLDOWN_MIN, Math.max(2, Math.round(planDay.durationMin * 0.06)));
  const budget = Math.max(0, planDay.durationMin - warmupMin - cooldownMin);
  const exercises = [];
  const usedIds = [];
  const musclesHit = new Set();
  const dayReasons = [];

  const slots = template?.slots ?? [];

  for (const [position, slotSpec] of slots.entries()) {
    if (exercises.length >= WORKOUT.MAX_EXERCISES) break;

    const choice = fillSlot({
      slot: slotSpec, position, context, week, usedIds, db, ruleSets,
    });

    if (!choice) continue;

    if (choice.blocked) {
      dayReasons.push(makeReason(
        { id: 'injury.slot-blocked', name: 'Blocked movement', scope: 'day' },
        `The ${String(slotSpec.movement).replace(/_/g, ' ')} slot is skipped — that pattern is restricted in your settings. The remaining slots cover the session's purpose.`,
        { movement: slotSpec.movement }
      ));
      continue;
    }

    const isFirstForMuscle = !choice.record.muscles.primary.some((m) => musclesHit.has(m));
    const exercise = prescribe({
      record: choice.record, context, week, ruleSets, isFirstForMuscle, choice,
    });

    // Stop adding once the session would overrun its time.
    const projected = exercises.reduce((sum, ex) => sum + exerciseMinutes(ex), 0)
      + exerciseMinutes(exercise);

    if (projected > budget && exercises.length >= 1) {
      dayReasons.push(makeReason(
        { id: 'time.session-full', name: 'Time budget reached', scope: 'day' },
        `${choice.record.name} was left out: the session already fills the ${planDay.durationMin} minutes you have, once warm-up and cool-down are counted. It is first in line if you get more time.`,
        { movement: slotSpec.movement, droppedId: choice.record.id, budgetMin: budget }
      ));
      continue;
    }

    exercises.push(exercise);
    usedIds.push(choice.record.id);
    choice.record.muscles.primary.forEach((m) => musclesHit.add(m));
  }

  /*
   * Trim sets before dropping exercises. A coach short on time cuts a set from
   * everything rather than deleting the second lift of the session.
   */
  const trimmed = fitToBudget(exercises, budget, dayReasons, planDay);

  /* Corrective work, if there is room for it. */
  const corrective = buildCorrective({
    week, db, usedIds, seed: `${context.weekNumber}-${dayIndex}`,
  });

  const usedMinutes = trimmed.reduce((sum, ex) => sum + exerciseMinutes(ex), 0);
  const kept = [];

  for (const item of corrective) {
    if (usedMinutes + kept.reduce((s, c) => s + correctiveMinutes(c), 0) + correctiveMinutes(item) <= budget) {
      kept.push(item);
    } else {
      dayReasons.push(makeReason(
        { id: 'time.corrective-trimmed', name: 'Corrective work trimmed', scope: 'day' },
        `${item.name} was dropped for time. Corrective work is the first thing cut when the session is tight — it is worth doing at home on a rest day instead.`,
        { droppedId: item.exerciseId }
      ));
    }
  }

  const all = [...trimmed, ...kept];
  const minutes = all.reduce(
    (sum, ex) => sum + (ex.corrective ? correctiveMinutes(ex) : exerciseMinutes(ex)), 0);

  if (planDay.durationMin < WORKOUT.MIN_SESSION_MIN) {
    notes.push(`${planDay.date}: only ${planDay.durationMin} minutes are available, which is below the ${WORKOUT.MIN_SESSION_MIN} minutes a useful lifting session needs.`);
  }

  return {
    date: planDay.date,
    weekday: planDay.weekday,
    goal: template?.name ?? 'Rest',
    targetMuscles: [...musclesHit],
    intensity: planDay.intensity,
    estimatedMinutes: round(minutes + warmupMin + cooldownMin, 0),
    availableMinutes: planDay.durationMin,
    trainingVolume: all.reduce((sum, ex) => sum + (ex.corrective ? 0 : ex.sets), 0),
    priority: planDay.priority,
    exercises: all,
    reasons: dayReasons,
  };
}

/**
 * Bring a session inside its time budget by cutting sets, and only dropping an
 * exercise once every set is already at the floor. Each cut is explained.
 *
 * @returns {object[]} the adjusted exercises
 */
function fitToBudget(exercises, budget, dayReasons, planDay) {
  const SET_FLOOR = 2;
  const list = exercises.map((exercise) => ({ ...exercise }));
  const total = () => list.reduce((sum, ex) => sum + exerciseMinutes(ex), 0);

  let cuts = 0;
  while (total() > budget && list.some((ex) => ex.sets > SET_FLOOR)) {
    const heaviest = list.reduce((top, ex) => (ex.sets > top.sets ? ex : top), list[0]);
    heaviest.sets -= 1;
    cuts += 1;
  }

  if (cuts > 0) {
    dayReasons.push(makeReason(
      { id: 'time.sets-trimmed', name: 'Sets trimmed for time', scope: 'day' },
      `${cuts} set${cuts === 1 ? ' was' : 's were'} cut across the session to fit ${planDay.durationMin} minutes. Fewer sets on every exercise beats dropping a movement entirely — the session still covers what it was for.`,
      { setsCut: cuts, budgetMin: budget }
    ));
  }

  while (total() > budget && list.length > 1) {
    const dropped = list.pop();
    dayReasons.push(makeReason(
      { id: 'time.exercise-dropped', name: 'Exercise dropped for time', scope: 'day' },
      `${dropped.name} was dropped: even at ${SET_FLOOR} sets each, the session did not fit ${planDay.durationMin} minutes.`,
      { droppedId: dropped.exerciseId }
    ));
  }

  return list;
}

/**
 * Compare what the week produced against the budget, per muscle.
 *
 * The slot-based design chooses movements, not muscles, so a session can end
 * up light on one muscle and heavy on another. Rather than silently shipping
 * that, the engine reports it: a muscle under the minimum gets a reason
 * saying so, and one over the ceiling gets a warning about junk volume.
 *
 * @returns {{summary: object, reasons: object[]}}
 */
function auditVolume(perMuscle, context, week) {
  const target = week.weeklySetsPerMuscle ?? context.weeklySetTarget;
  const min = context.weeklySetMin;
  const max = context.weeklySetMax;

  const under = [];
  const over = [];

  for (const muscle of TRACKED_MUSCLES) {
    const sets = perMuscle[muscle] ?? 0;
    if (sets > 0 && sets < min) under.push({ muscle, sets });
    if (sets > max) over.push({ muscle, sets });
  }

  const reasons = [];

  if (under.length) {
    reasons.push(makeReason(
      { id: 'volume.below-minimum', name: 'Muscles below the minimum', scope: 'week' },
      `${under.map((row) => `${row.muscle.replace(/_/g, ' ')} (${row.sets})`).join(', ')} ${under.length === 1 ? 'sits' : 'sit'} under the ${min}-set minimum for your level. The session structure is built from movement patterns, so some muscles come out light — add a set to an isolation exercise for them, or accept it as a lighter week for those muscles.`,
      { muscles: under, minimum: min }
    ));
  }

  if (over.length) {
    reasons.push(makeReason(
      { id: 'volume.above-ceiling', name: 'Muscles above the ceiling', scope: 'week' },
      `${over.map((row) => `${row.muscle.replace(/_/g, ' ')} (${row.sets})`).join(', ')} ${over.length === 1 ? 'goes' : 'go'} past the ${max}-set ceiling, counting the work they take as a secondary muscle. Past that point extra sets mostly add fatigue — cut a set if recovery suffers.`,
      { muscles: over, ceiling: max }
    ));
  }

  if (!under.length && !over.length) {
    reasons.push(makeReason(
      { id: 'volume.within-budget', name: 'Volume within budget', scope: 'week' },
      `Every muscle trained this week lands between ${min} and ${max} sets, around the ${target}-set target.`,
      { target, min, max }
    ));
  }

  return { summary: { target, min, max, under, over }, reasons };
}

/** Weekly working sets per muscle, secondary work counted at half. */
function volumePerMuscle(days) {
  const totals = {};
  for (const day of days) {
    for (const exercise of day.exercises) {
      if (exercise.corrective) continue;
      for (const muscle of exercise.muscles.primary) {
        totals[muscle] = round((totals[muscle] ?? 0) + exercise.sets, 1);
      }
      for (const muscle of exercise.muscles.secondary) {
        totals[muscle] = round((totals[muscle] ?? 0) + exercise.sets * 0.5, 1);
      }
    }
  }
  return totals;
}

/** The active builder. Swap the whole engine with workoutSlot.use(id). */
export const workoutSlot = createSlot('workout-engine', DEFAULT_WORKOUT_BUILDER);

export const WorkoutEngine = Object.freeze({
  /**
   * Build a week of lifting.
   * @param {object} input  see createWorkoutContext
   * @param {{ruleSets?: object, db?: object}} [options]
   * @returns {object} WorkoutWeek
   */
  build(input, { ruleSets = WORKOUT_RULE_SETS, db = ExerciseDB } = {}) {
    const context = createWorkoutContext({ ...input, exerciseDb: db });
    return this.buildFromContext(context, { ruleSets, db });
  },

  /** Build from an already-derived context. Useful in tests. */
  buildFromContext(context, { ruleSets = WORKOUT_RULE_SETS, db = ExerciseDB } = {}) {
    const week = workoutSlot.current.compute(context, ruleSets, db);
    week.meta.formula = workoutSlot.current.describe();
    return week;
  },

  /** Every reason in a week, flattened — for a report or a coach. */
  allReasons(workoutWeek) {
    return [
      ...workoutWeek.reasons,
      ...workoutWeek.days.flatMap((day) => [
        ...day.reasons,
        ...day.exercises.flatMap((ex) =>
          [ex.reason, ex.progression?.reason].filter(Boolean)),
      ]),
    ];
  },

  formulas() { return { workout: workoutSlot.current.describe() }; },
});

export { createWorkoutContext, ACTION };
