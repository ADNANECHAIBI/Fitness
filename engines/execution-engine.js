/**
 * execution-engine.js — tracking a session as it happens, and judging it after.
 *
 * It generates no programme. It receives a WorkoutDay from the workout engine
 * and records what was actually done against it.
 *
 * Pure: every operation takes a session and returns a NEW session plus the
 * events that occurred. Nothing here stores, emits or renders — the execution
 * service does that. This is what makes a session replayable in a test.
 *
 * The state machine:
 *
 *      planned ──start──▶ started ⇄ paused
 *         │                  │  └─resume─┘
 *       skip                 │
 *         │            complete│cancel
 *         ▼                    ▼
 *      skipped        completed / cancelled
 *
 * Terminal states accept nothing further, and an invalid transition is
 * rejected with a reason rather than silently ignored.
 */

import { defineFormula, createSlot } from './formula.js';
import { round, mean, sum } from './calculation-engine.js';
import { selectOne, applyAll, makeReason } from '../rules/rule.js';
import {
  EXECUTION_RULE_SETS, judgeSet, statusFor, sessionNumbers,
  PROGRESSABLE_VERDICTS,
} from '../rules/execution/index.js';
import { SESSION_STATE, EXERCISE_STATUS, EXECUTION, UNITS } from './constants.js';
import { transitionsWith, outcome as result, refuse, permits, nowISO, pauseDuration } from './session-state.js';

export const EXECUTION_ENGINE_VERSION = '1.0.0';

/**
 * The shared state machine, plus the two actions only a lifting session has.
 */
const TRANSITIONS = transitionsWith({
  [SESSION_STATE.STARTED]: ['logSet', 'skipExercise'],
});

const reject = refuse;
const allows = (session, action) => permits(TRANSITIONS, session, action);

/* ── Building ───────────────────────────────────────────────────────────── */

/**
 * Turn a planned WorkoutDay into a session ready to be started.
 * @param {object} day  a WorkoutDay from the workout engine
 * @returns {object} WorkoutSession in the planned state
 */
export function sessionFromDay(day, { weekNumber = null } = {}) {
  return {
    date: day.date,
    weekNumber,
    goal: day.goal,
    state: SESSION_STATE.PLANNED,
    startedAt: null,
    endedAt: null,
    pausedSec: 0,
    plannedDurationMin: day.estimatedMinutes ?? null,
    actualDurationMin: null,
    completionPercent: 0,
    fatigue: null,
    notes: null,

    exercises: (day.exercises ?? []).map((exercise) => ({
      exerciseId: exercise.exerciseId,
      name: exercise.name,

      plannedSets: exercise.sets,
      plannedReps: exercise.reps,
      plannedWeightKg: exercise.targetLoadKg,
      plannedRpe: exercise.rpe,
      plannedRestSec: exercise.restSec,

      completedSets: 0,
      completedReps: 0,
      actualWeightKg: null,
      actualRpe: null,
      actualRestSec: null,

      status: EXERCISE_STATUS.NOT_STARTED,
      sets: [],
      notes: null,
      corrective: Boolean(exercise.corrective),
      /** Kept so a logged row can be attributed to a muscle without a lookup. */
      muscle: exercise.muscles?.primary?.[0] ?? 'full_body',
    })),

    reasons: [],
    records: [],
    feedback: null,
    meta: {
      engineVersion: EXECUTION_ENGINE_VERSION,
      plannedFrom: day.date,
    },
  };
}

/* ── Transitions ────────────────────────────────────────────────────────── */

function start(session, { at = nowISO() } = {}) {
  if (!allows(session, 'start')) {
    return reject(session, 'start', `A session that is ${session.state} cannot be started again.`);
  }
  const next = { ...session, state: SESSION_STATE.STARTED, startedAt: at };
  return result(next, [{ type: 'SESSION_STARTED', at, sessionDate: session.date }]);
}

function pause(session, { at = nowISO() } = {}) {
  if (!allows(session, 'pause')) {
    return reject(session, 'pause', `Only a running session can be paused; this one is ${session.state}.`);
  }
  const next = { ...session, state: SESSION_STATE.PAUSED, pausedAt: at };
  return result(next, [{ type: 'SESSION_PAUSED', at }]);
}

function resume(session, { at = nowISO() } = {}) {
  if (!allows(session, 'resume')) {
    return reject(session, 'resume', `Only a paused session can be resumed; this one is ${session.state}.`);
  }

  const pausedFor = pauseDuration(session.pausedAt, at);

  const next = {
    ...session,
    state: SESSION_STATE.STARTED,
    pausedAt: null,
    pausedSec: (session.pausedSec ?? 0) + pausedFor,
  };

  const events = [{ type: 'SESSION_RESUMED', at, pausedSec: pausedFor }];

  // A long pause is a session that was left, not one that was rested in.
  if (pausedFor > EXECUTION.PAUSE_ABANDON_MIN * UNITS.SECONDS_PER_MINUTE) {
    next.reasons = [...(session.reasons ?? []), makeReason(
      { id: 'execution.long-pause', name: 'Long pause', scope: 'session' },
      `The session was paused for ${Math.round(pausedFor / 60)} minutes. That gap is excluded from the working time, so the duration reflects training rather than the break.`,
      { pausedSec: pausedFor }
    )];
  }

  return result(next, events);
}

function cancel(session, { at = nowISO(), reason = null } = {}) {
  if (!allows(session, 'cancel')) {
    return reject(session, 'cancel', `A session that is ${session.state} cannot be cancelled.`);
  }
  const next = finalise({ ...session, state: SESSION_STATE.CANCELLED, endedAt: at, notes: reason ?? session.notes });
  return result(next, [{ type: 'SESSION_CANCELLED', at }]);
}

function skip(session, { at = nowISO(), reason = null } = {}) {
  if (!allows(session, 'skip')) {
    return reject(session, 'skip', `A session that is ${session.state} cannot be skipped.`);
  }
  const next = finalise({ ...session, state: SESSION_STATE.SKIPPED, endedAt: at, notes: reason ?? session.notes });
  return result(next, [{ type: 'SESSION_SKIPPED', at }]);
}

/* ── Logging work ───────────────────────────────────────────────────────── */

/**
 * Record one set.
 * @param {object} session
 * @param {string} exerciseId
 * @param {{reps, weightKg, rpe, restSec, at}} entry
 */
function logSet(session, exerciseId, entry = {}) {
  if (!allows(session, 'logSet')) {
    return reject(session, 'logSet', `Sets can only be logged while the session is running; this one is ${session.state}.`);
  }

  const index = session.exercises.findIndex((ex) => ex.exerciseId === exerciseId);
  if (index === -1) {
    return reject(session, 'logSet', `${exerciseId} is not part of this session.`);
  }

  const exercise = session.exercises[index];
  const planned = {
    reps: exercise.plannedReps,
    rpe: exercise.plannedRpe,
    weightKg: exercise.plannedWeightKg,
  };
  const actual = {
    reps: entry.reps ?? 0,
    weightKg: entry.weightKg ?? exercise.plannedWeightKg ?? 0,
    rpe: entry.rpe ?? null,
    restSec: entry.restSec ?? null,
  };

  const verdict = judgeSet(actual, planned);

  const set = {
    index: exercise.sets.length + 1,
    reps: actual.reps,
    weightKg: actual.weightKg,
    rpe: actual.rpe,
    restSec: actual.restSec,
    completed: !verdict.failed,
    failed: verdict.failed,
    at: entry.at ?? nowISO(),
  };

  const sets = [...exercise.sets, set];
  const updated = recomputeExercise({ ...exercise, sets });

  const exercises = [...session.exercises];
  exercises[index] = updated;

  const events = [{
    type: verdict.failed ? 'SET_FAILED' : 'SET_COMPLETED',
    exerciseId,
    set,
    why: verdict.why,
  }];

  if (updated.completedSets + updated.sets.filter((s) => s.failed).length >= updated.plannedSets) {
    events.push({ type: 'EXERCISE_FINISHED', exerciseId, status: updated.status });
  }

  return result({ ...session, exercises }, events);
}

/** Mark an exercise as deliberately skipped. */
function skipExercise(session, exerciseId, { reason = null } = {}) {
  if (!allows(session, 'skipExercise')) {
    return reject(session, 'skipExercise', `Exercises can only be skipped while the session is running.`);
  }

  const index = session.exercises.findIndex((ex) => ex.exerciseId === exerciseId);
  if (index === -1) {
    return reject(session, 'skipExercise', `${exerciseId} is not part of this session.`);
  }

  const exercises = [...session.exercises];
  exercises[index] = {
    ...exercises[index],
    status: EXERCISE_STATUS.SKIPPED,
    notes: reason ?? exercises[index].notes,
  };

  return result({ ...session, exercises }, [{ type: 'EXERCISE_SKIPPED', exerciseId, reason }]);
}

/** Recompute an exercise's totals from its logged sets. */
function recomputeExercise(exercise) {
  const sets = exercise.sets ?? [];
  const done = sets.filter((set) => set.completed);
  const rpes = sets.filter((set) => typeof set.rpe === 'number').map((set) => set.rpe);
  const rests = sets.filter((set) => typeof set.restSec === 'number').map((set) => set.restSec);

  return {
    ...exercise,
    completedSets: done.length,
    completedReps: sum(sets.map((set) => set.reps)),
    actualWeightKg: sets.length ? Math.max(...sets.map((set) => set.weightKg ?? 0)) : null,
    actualRpe: rpes.length ? round(mean(rpes), 1) : null,
    actualRestSec: rests.length ? round(mean(rests), 0) : null,
    status: statusFor({ ...exercise, sets }),
  };
}

/* ── Finishing ──────────────────────────────────────────────────────────── */

function complete(session, { at = nowISO(), fatigue = null, notes = null, history = [] } = {}) {
  if (!allows(session, 'complete')) {
    return reject(session, 'complete', `A session that is ${session.state} cannot be completed.`);
  }

  const next = finalise({
    ...session,
    state: SESSION_STATE.COMPLETED,
    endedAt: at,
    fatigue: fatigue ?? session.fatigue,
    notes: notes ?? session.notes,
  }, { history });

  const events = [{ type: 'WORKOUT_COMPLETED', at, completion: next.completionPercent }];
  for (const record of next.records) {
    events.push({ type: 'PR_ACHIEVED', record });
  }

  return result(next, events);
}

/** Working minutes, excluding time spent paused. */
function workingMinutes(session, endedAt) {
  if (!session.startedAt || !endedAt) return null;
  const elapsed = (new Date(endedAt) - new Date(session.startedAt)) / 1000;
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  return round(Math.max(0, elapsed - (session.pausedSec ?? 0)) / UNITS.SECONDS_PER_MINUTE, 1);
}

/**
 * Close a session: totals, verdict, records, feedback.
 * Runs for every terminal state, so a cancelled session still reports.
 */
function finalise(session, { history = [] } = {}) {
  const exercises = session.exercises.map(recomputeExercise);
  const stats = sessionStats(exercises);

  /* Verdict — exactly one. */
  const verdictContext = { session: { ...session, exercises }, stats };
  const verdict = selectOne(EXECUTION_RULE_SETS.completion, verdictContext);

  const reasons = [...(session.reasons ?? [])];
  if (verdict.reason) reasons.push(verdict.reason);

  /* Per exercise: may progression build on this? */
  const judged = exercises.map((exercise) => {
    if (!exercise.sets.length && exercise.status !== EXERCISE_STATUS.SKIPPED) {
      return { ...exercise, progressionEligible: false };
    }

    const applied = applyAll(EXECUTION_RULE_SETS.failure, { exercise }, {});
    reasons.push(...applied.reasons.map((reason) => ({ ...reason, exerciseId: exercise.exerciseId })));

    return {
      ...exercise,
      progressionEligible: Boolean(applied.draft.progressionEligible),
      lateFatigue: Boolean(applied.draft.lateFatigue),
    };
  });

  /* Records, from completed sets only. */
  const { records, recordReasons } = detectRecords(judged, history, session.date);
  reasons.push(...recordReasons);

  const progressable = PROGRESSABLE_VERDICTS.includes(verdict.patch.verdict);

  return {
    ...session,
    exercises: judged,
    completionPercent: stats.completionPercent,
    actualDurationMin: workingMinutes(session, session.endedAt),
    verdict: verdict.patch.verdict,
    progressable,
    records,
    feedback: buildFeedback({ session, exercises: judged, stats, verdict: verdict.patch.verdict, records }),
    reasons,
    meta: { ...session.meta, finalisedAt: session.endedAt },
  };
}

/** Planned versus completed, across the session. */
function sessionStats(exercises) {
  const counted = exercises.filter((ex) => !ex.corrective);

  const plannedSets = sum(counted.map((ex) => ex.plannedSets));
  const completedSets = sum(counted.map((ex) => ex.completedSets));
  const failedSets = sum(counted.map((ex) => ex.sets.filter((set) => set.failed).length));

  const completion = plannedSets > 0 ? completedSets / plannedSets : 0;

  return {
    plannedSets,
    completedSets,
    failedSets,
    skipped: counted.filter((ex) => ex.status === EXERCISE_STATUS.SKIPPED).length,
    partial: counted.filter((ex) => ex.status === EXERCISE_STATUS.PARTIAL).length,
    completion,
    completionPercent: round(completion * 100, 0),
  };
}

/**
 * Compare each exercise against every previous session for it.
 * @returns {{records: object[], recordReasons: object[]}}
 */
function detectRecords(exercises, history, date) {
  const records = [];
  const recordReasons = [];

  for (const exercise of exercises) {
    const current = sessionNumbers(exercise);
    if (current.topWeightKg === 0 && current.volumeKg === 0) continue;

    const previousBest = bestFrom(history, exercise.exerciseId, date);

    const applied = applyAll(EXECUTION_RULE_SETS.pr, {
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      current,
      previousBest,
    }, { records: [] });

    for (const record of applied.draft.records ?? []) {
      records.push({ ...record, date });
    }
    recordReasons.push(...applied.reasons.map((reason) => ({ ...reason, exerciseId: exercise.exerciseId })));
  }

  return { records, recordReasons };
}

/**
 * Best previous numbers for an exercise, from earlier sessions only.
 * @returns {{load, volume, e1rm}}
 */
export function bestFrom(history, exerciseId, beforeDate) {
  const earlier = (history ?? []).filter(
    (session) => session.date < beforeDate && Array.isArray(session.exercises)
  );

  let load = null;
  let volume = null;
  let e1rm = null;

  for (const session of earlier) {
    for (const exercise of session.exercises) {
      if (exercise.exerciseId !== exerciseId) continue;

      const numbers = sessionNumbers(exercise);
      if (numbers.topWeightKg > (load ?? 0)) load = numbers.topWeightKg;
      if (numbers.volumeKg > (volume ?? 0)) volume = numbers.volumeKg;
      if (numbers.e1rm !== null && numbers.e1rm > (e1rm ?? 0)) e1rm = numbers.e1rm;
    }
  }

  return { load, volume, e1rm };
}

/** The plain-language report: what happened, in items a screen can list. */
function buildFeedback({ session, exercises, stats, verdict, records }) {
  const items = [];

  items.push({
    kind: 'completion',
    message: `${stats.completionPercent}% of the session was completed — ${stats.completedSets} of ${stats.plannedSets} planned sets.`,
  });

  if (stats.skipped > 0) {
    const names = exercises.filter((ex) => ex.status === EXERCISE_STATUS.SKIPPED).map((ex) => ex.name);
    items.push({
      kind: 'skipped',
      message: `${stats.skipped} exercise${stats.skipped === 1 ? ' was' : 's were'} skipped: ${names.join(', ')}.`,
    });
  }

  if (stats.partial > 0) {
    items.push({
      kind: 'partial',
      message: `${stats.partial} exercise${stats.partial === 1 ? ' was' : 's were'} stopped part-way through.`,
    });
  }

  /* Load changes against what was planned. */
  const heavier = exercises.filter((ex) =>
    ex.plannedWeightKg !== null && ex.actualWeightKg !== null && ex.actualWeightKg > ex.plannedWeightKg);
  const lighter = exercises.filter((ex) =>
    ex.plannedWeightKg !== null && ex.actualWeightKg !== null && ex.actualWeightKg < ex.plannedWeightKg);

  if (heavier.length) {
    items.push({
      kind: 'load-up',
      message: `You went heavier than planned on ${heavier.length}: ${heavier.map((ex) => `${ex.name} (${ex.actualWeightKg} kg vs ${ex.plannedWeightKg})`).join(', ')}.`,
    });
  }
  if (lighter.length) {
    items.push({
      kind: 'load-down',
      message: `You went lighter than planned on ${lighter.length}: ${lighter.map((ex) => `${ex.name} (${ex.actualWeightKg} kg vs ${ex.plannedWeightKg})`).join(', ')}.`,
    });
  }

  const failed = exercises.filter((ex) => ex.status === EXERCISE_STATUS.FAILED);
  if (failed.length) {
    items.push({
      kind: 'failed',
      message: `${failed.map((ex) => ex.name).join(', ')} fell short of the target reps. Those loads stay where they are next week rather than moving up.`,
    });
  }

  const lateFatigue = exercises.filter((ex) => ex.lateFatigue);
  if (lateFatigue.length) {
    items.push({
      kind: 'late-fatigue',
      message: `The last set fell short on ${lateFatigue.map((ex) => ex.name).join(', ')} — ordinary within-session fatigue, and the load still progresses.`,
    });
  }

  for (const record of records) {
    items.push({
      kind: 'record',
      message: `New ${record.type.replace(/_/g, ' ')} best on ${record.exerciseId}: ${record.value} ${record.unit}.`,
    });
  }

  if (session.actualDurationMin && session.plannedDurationMin) {
    const delta = round(session.actualDurationMin - session.plannedDurationMin, 0);
    if (Math.abs(delta) >= 5) {
      items.push({
        kind: 'duration',
        message: `The session took ${session.actualDurationMin} minutes against ${session.plannedDurationMin} planned — ${Math.abs(delta)} ${delta > 0 ? 'over' : 'under'}.`,
      });
    }
  }

  return { verdict, summary: items[0].message, items };
}

/* ── The engine ─────────────────────────────────────────────────────────── */

export const DEFAULT_EXECUTOR = defineFormula({
  id: 'session-execution-tracker',
  name: 'Session execution tracker',
  source: 'A state machine over logged sets. The failure and completion thresholds are coaching conventions; the one-rep-max estimate behind the e1RM record comes from the strength engine and carries its own citation.',
  accuracy: 'exact',
  useWhen: 'Recording what was actually done in a session and comparing it to the plan. The comparison is arithmetic; only the thresholds for calling something a failure are judgement.',
  caveat: 'It can only see what is logged. A set done and not recorded is, to this engine, a set that did not happen — and next week is built on that.',
  compute: (session) => session,
});

export const executorSlot = createSlot('execution-engine', DEFAULT_EXECUTOR);

export const ExecutionEngine = Object.freeze({
  fromDay: sessionFromDay,
  start,
  pause,
  resume,
  cancel,
  skip,
  logSet,
  skipExercise,
  complete,

  /** Recompute totals without changing state — for a live progress readout. */
  progress(session) {
    const exercises = session.exercises.map(recomputeExercise);
    return { ...sessionStats(exercises), exercises };
  },

  /**
   * Turn a finished session into Gym records for the repository.
   *
   * This is the loop that closes: next week's workout engine reads these, and
   * a set marked failed is the reason it will not add load on top of a miss.
   *
   * @returns {object[]} rows shaped for the Gym model
   */
  toGymRecords(session) {
    if (session.state !== SESSION_STATE.COMPLETED && session.state !== SESSION_STATE.CANCELLED) {
      return [];
    }

    return session.exercises
      .filter((exercise) => exercise.sets.length > 0)
      .map((exercise) => {
        const done = exercise.sets.filter((set) => set.completed);
        const reference = done.length ? done : exercise.sets;

        return {
          date: session.date,
          exercise: exercise.exerciseId,
          muscle: exercise.muscle ?? 'full_body',
          sets: reference.length,
          reps: Math.max(...reference.map((set) => set.reps)) || 1,
          weightKg: Math.max(...reference.map((set) => set.weightKg ?? 0)),
          rpe: exercise.actualRpe ?? undefined,
          restSec: exercise.actualRestSec ?? undefined,
          status: exercise.status,
          sessionId: session.id ?? undefined,
        };
      });
  },

  formulas() { return { execution: executorSlot.current.describe() }; },
});

export { SESSION_STATE, EXERCISE_STATUS, sessionStats };
