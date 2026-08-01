/**
 * running-execution-engine.js — tracking one run against its plan.
 *
 * It reuses the shared state machine in session-state.js and the completion
 * thresholds in constants.js, so a run and a lifting session are judged
 * consistently. What differs is the inside: a run is one continuous effort,
 * not a series of sets, so there is nothing to log set by set.
 *
 * Pure. Returns a new execution plus events; the service persists and emits.
 */

import { defineFormula, createSlot } from './formula.js';
import { round, percentOf } from './calculation-engine.js';
import { RunningEngine } from './running-engine.js';
import { sessionLoad } from './running-context.js';
import { makeReason } from '../rules/rule.js';
import {
  transitionsWith, outcome, refuse, permits, nowISO, pauseDuration,
} from './session-state.js';
import { SESSION_STATE, EXECUTION, RUNNING_PROGRAM } from './constants.js';

export const RUNNING_EXECUTION_VERSION = '1.0.0';

const TRANSITIONS = transitionsWith({});
const allows = (execution, action) => permits(TRANSITIONS, execution, action);

/**
 * Turn a planned RunningSession into an execution ready to be started.
 * @returns {object} RunningExecution
 */
export function executionFromSession(session, { weekNumber = null } = {}) {
  return {
    date: session.date,
    weekNumber,
    type: session.type,
    goal: session.goal,
    state: SESSION_STATE.PLANNED,

    startedAt: null,
    endedAt: null,
    pausedSec: 0,

    plannedDistanceKm: session.distanceKm,
    plannedDurationMin: session.durationMin,
    plannedPaceSecPerKm: session.targetPaceSecPerKm,
    plannedPace: session.targetPace,

    actualDistanceKm: null,
    actualDurationMin: null,
    actualPaceSecPerKm: null,
    actualPace: '—',

    completionPercent: 0,
    fatigue: null,
    rpe: null,
    heartRateBpm: null,
    notes: null,

    verdict: null,
    reasons: [],
    meta: { engineVersion: RUNNING_EXECUTION_VERSION },
  };
}

function start(execution, { at = nowISO() } = {}) {
  if (!allows(execution, 'start')) {
    return refuse(execution, 'start', `A run that is ${execution.state} cannot be started again.`);
  }
  return outcome(
    { ...execution, state: SESSION_STATE.STARTED, startedAt: at },
    [{ type: 'RUN_STARTED', at, date: execution.date }]
  );
}

function pause(execution, { at = nowISO() } = {}) {
  if (!allows(execution, 'pause')) {
    return refuse(execution, 'pause', `Only a running session can be paused; this one is ${execution.state}.`);
  }
  return outcome({ ...execution, state: SESSION_STATE.PAUSED, pausedAt: at }, [{ type: 'RUN_PAUSED', at }]);
}

function resume(execution, { at = nowISO() } = {}) {
  if (!allows(execution, 'resume')) {
    return refuse(execution, 'resume', `Only a paused run can be resumed; this one is ${execution.state}.`);
  }
  const pausedFor = pauseDuration(execution.pausedAt, at);
  return outcome(
    { ...execution, state: SESSION_STATE.STARTED, pausedAt: null, pausedSec: (execution.pausedSec ?? 0) + pausedFor },
    [{ type: 'RUN_RESUMED', at, pausedSec: pausedFor }]
  );
}

function cancel(execution, { at = nowISO(), reason = null } = {}) {
  if (!allows(execution, 'cancel')) {
    return refuse(execution, 'cancel', `A run that is ${execution.state} cannot be cancelled.`);
  }
  const next = finalise({ ...execution, state: SESSION_STATE.CANCELLED, endedAt: at, notes: reason ?? execution.notes });
  return outcome(next, [{ type: 'RUN_CANCELLED', at }]);
}

function skip(execution, { at = nowISO(), reason = null } = {}) {
  if (!allows(execution, 'skip')) {
    return refuse(execution, 'skip', `A run that is ${execution.state} cannot be skipped.`);
  }
  const next = finalise({ ...execution, state: SESSION_STATE.SKIPPED, endedAt: at, notes: reason ?? execution.notes });
  return outcome(next, [{ type: 'RUN_SKIPPED', at }]);
}

/**
 * Finish a run.
 * @param {{distanceKm, durationMin, rpe, fatigue, heartRateBpm, notes, at}} actual
 */
function complete(execution, actual = {}) {
  if (!allows(execution, 'complete')) {
    return refuse(execution, 'complete', `A run that is ${execution.state} cannot be completed.`);
  }

  const at = actual.at ?? nowISO();
  const distanceKm = actual.distanceKm ?? null;
  const durationMin = actual.durationMin ?? measuredMinutes(execution, at);

  const next = finalise({
    ...execution,
    state: SESSION_STATE.COMPLETED,
    endedAt: at,
    actualDistanceKm: distanceKm,
    actualDurationMin: durationMin,
    rpe: actual.rpe ?? null,
    fatigue: actual.fatigue ?? null,
    heartRateBpm: actual.heartRateBpm ?? null,
    notes: actual.notes ?? execution.notes,
  });

  return outcome(next, [{ type: 'RUN_COMPLETED', at, completion: next.completionPercent }]);
}

/** Working minutes from the clock, excluding pauses. */
function measuredMinutes(execution, endedAt) {
  if (!execution.startedAt || !endedAt) return null;
  const elapsed = (new Date(endedAt) - new Date(execution.startedAt)) / 1000;
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  return round(Math.max(0, elapsed - (execution.pausedSec ?? 0)) / 60, 1);
}

/** Close a run: pace, completion, verdict, reasons. */
function finalise(execution) {
  const actualPaceSec = RunningEngine.paceSecPerKm({
    distanceKm: execution.actualDistanceKm,
    durationMin: execution.actualDurationMin,
  });

  const completion = execution.plannedDistanceKm > 0 && execution.actualDistanceKm !== null
    ? percentOf(execution.actualDistanceKm, execution.plannedDistanceKm, 0)
    : 0;

  const reasons = [...(execution.reasons ?? [])];
  const verdict = judge(execution, completion);

  reasons.push(makeReason(
    { id: `run.${verdict.id}`, name: verdict.name, scope: 'run' },
    verdict.message,
    { completion, plannedKm: execution.plannedDistanceKm, actualKm: execution.actualDistanceKm }
  ));

  /* Pace against plan — only meaningful when both exist. */
  if (actualPaceSec !== null && execution.plannedPaceSecPerKm) {
    const delta = round(actualPaceSec - execution.plannedPaceSecPerKm, 0);

    if (Math.abs(delta) >= 15) {
      reasons.push(makeReason(
        { id: 'run.pace-off-target', name: 'Pace off target', scope: 'run' },
        delta < 0
          ? `Run at ${RunningEngine.formatPace(actualPaceSec)} per km against a target of ${execution.plannedPace} — ${Math.abs(delta)} seconds faster. On an easy run that is the most common training mistake there is: easy days too hard leaves nothing for the hard ones.`
          : `Run at ${RunningEngine.formatPace(actualPaceSec)} per km against a target of ${execution.plannedPace} — ${delta} seconds slower. Heat, fatigue and terrain all do this; it is only worth acting on if it repeats.`,
        { deltaSecPerKm: delta }
      ));
    }
  }

  return {
    ...execution,
    actualPaceSecPerKm: actualPaceSec === null ? null : round(actualPaceSec, 0),
    actualPace: RunningEngine.formatPace(actualPaceSec),
    completionPercent: completion,
    verdict: verdict.id,
    load: execution.actualDurationMin
      ? sessionLoad({ durationMin: execution.actualDurationMin, type: execution.type })
      : 0,
    reasons,
  };
}

/** One verdict per run, mirroring how a lifting session is judged. */
function judge(execution, completion) {
  if (execution.state === SESSION_STATE.SKIPPED) {
    return {
      id: 'skipped', name: 'Run skipped',
      message: `Run skipped. Nothing is logged, so next week's distance is built from the weeks that did happen.`,
    };
  }
  if (execution.state === SESSION_STATE.CANCELLED) {
    return {
      id: 'cancelled', name: 'Run cancelled',
      message: `Run cancelled after ${execution.actualDistanceKm ?? 0} of ${execution.plannedDistanceKm} km. What was covered still counts toward the week.`,
    };
  }
  if (completion >= EXECUTION.COMPLETION_SUCCESS * 100) {
    return {
      id: 'complete', name: 'Run completed',
      message: `${completion}% of the planned distance — ${execution.actualDistanceKm} of ${execution.plannedDistanceKm} km. That counts as the session done.`,
    };
  }
  if (completion < EXECUTION.COMPLETION_ABANDONED * 100) {
    return {
      id: 'abandoned', name: 'Run cut short',
      message: `Only ${completion}% of the planned distance was covered. Too little to read anything into — next week's distance stays where it is rather than moving on one short run.`,
    };
  }
  return {
    id: 'shortened', name: 'Run shortened',
    message: `${completion}% of the planned distance — ${execution.actualDistanceKm} of ${execution.plannedDistanceKm} km. It counts toward the week's volume at what was actually covered.`,
  };
}

export const DEFAULT_RUN_EXECUTOR = defineFormula({
  id: 'run-execution-tracker',
  name: 'Run execution tracker',
  source: 'A state machine over one continuous effort, sharing its states and completion thresholds with the lifting execution engine. Pace is computed by the running formulas; load by the session-RPE method cited there.',
  accuracy: 'exact',
  useWhen: 'Recording what a run actually was, against what was prescribed.',
  caveat: 'Distance and time come from whatever measured them. A phone GPS under trees is routinely out by a few percent, and every pace derived from it inherits that.',
  compute: (execution) => execution,
});

export const runExecutorSlot = createSlot('run-execution', DEFAULT_RUN_EXECUTOR);

export const RunningExecutionEngine = Object.freeze({
  fromSession: executionFromSession,
  start, pause, resume, cancel, skip, complete,

  /**
   * Turn a finished run into a Running record for the repository — the loop
   * back into next week's context and into the progress metrics.
   * @returns {object[]}
   */
  toRunRecords(execution) {
    if (execution.state !== SESSION_STATE.COMPLETED && execution.state !== SESSION_STATE.CANCELLED) {
      return [];
    }
    if (!execution.actualDistanceKm || !execution.actualDurationMin) return [];

    return [{
      date: execution.date,
      distanceKm: execution.actualDistanceKm,
      durationMin: execution.actualDurationMin,
      heartRateBpm: execution.heartRateBpm ?? undefined,
      difficulty: rpeToDifficulty(execution.rpe),
      notes: execution.notes ?? undefined,
    }];
  },

  formulas() { return { runExecution: runExecutorSlot.current.describe() }; },
});

/** The Running model records difficulty; executions record RPE. */
function rpeToDifficulty(rpe) {
  if (rpe === null || rpe === undefined) return 'moderate';
  if (rpe <= 3) return 'easy';
  if (rpe <= 6) return 'moderate';
  if (rpe <= 8) return 'hard';
  return 'max';
}

export { SESSION_STATE };
