/**
 * Tests for the execution engine — the nine required situations, the state
 * machine, and the invariants that must hold for any session.
 */

import { describe, it, expect } from './runner.js';
import { ExecutionEngine as E, bestFrom } from '../engines/execution-engine.js';
import { SESSION_STATE, EXERCISE_STATUS, EXECUTION } from '../engines/constants.js';
import { VERDICT } from '../rules/execution/completion-rules.js';
import { RECORD_TYPE } from '../rules/execution/pr-rules.js';

const DAY = {
  date: '2026-07-27',
  goal: 'Push',
  estimatedMinutes: 60,
  exercises: [
    {
      exerciseId: 'barbell-bench-press', name: 'Barbell Bench Press',
      sets: 3, reps: 10, targetLoadKg: 60, rpe: 8, restSec: 120,
      muscles: { primary: ['chest'], secondary: ['triceps'] },
    },
    {
      exerciseId: 'overhead-press', name: 'Overhead Press',
      sets: 3, reps: 8, targetLoadKg: 40, rpe: 8, restSec: 120,
      muscles: { primary: ['front_delts'], secondary: [] },
    },
  ],
};

const START = '2026-07-27T18:00:00.000Z';
const END = '2026-07-27T18:50:00.000Z';

const planned = () => E.fromDay(DAY, { weekNumber: 5 });
const started = () => E.start(planned(), { at: START }).session;

/** Log the same set n times. */
function logSets(session, exerciseId, count, entry) {
  let current = session;
  for (let i = 0; i < count; i += 1) {
    current = E.logSet(current, exerciseId, entry).session;
  }
  return current;
}

/* ── Scenario 1: a full session ─────────────────────────────────────────── */

describe('ExecutionEngine — a full session', () => {
  let session = started();
  session = logSets(session, 'barbell-bench-press', 3, { reps: 10, weightKg: 60, rpe: 8, restSec: 120 });
  session = logSets(session, 'overhead-press', 3, { reps: 8, weightKg: 40, rpe: 8, restSec: 120 });
  const outcome = E.complete(session, { at: END, fatigue: 6, history: [] });

  it('reaches 100% completion', () => {
    expect(outcome.session.completionPercent).toBe(100);
    expect(outcome.session.verdict).toBe(VERDICT.COMPLETE);
  });

  it('records the actual duration, not the planned one', () => {
    expect(outcome.session.actualDurationMin).toBe(50);
    expect(outcome.session.plannedDurationMin).toBe(60);
  });

  it('marks every exercise completed', () => {
    expect(outcome.session.exercises.every((ex) => ex.status === EXERCISE_STATUS.COMPLETED)).toBeTruthy();
  });

  it('lets progression build on it', () => {
    expect(outcome.session.progressable).toBeTruthy();
    expect(outcome.session.exercises.every((ex) => ex.progressionEligible)).toBeTruthy();
  });

  it('emits a completion event', () => {
    expect(outcome.events.some((event) => event.type === 'WORKOUT_COMPLETED')).toBeTruthy();
  });
});

/* ── Scenario 2: half a session ─────────────────────────────────────────── */

describe('ExecutionEngine — half a session', () => {
  let session = started();
  session = logSets(session, 'barbell-bench-press', 3, { reps: 10, weightKg: 60, rpe: 8 });
  const outcome = E.complete(session, { at: END, history: [] });

  it('reports the share that was done', () => {
    expect(outcome.session.completionPercent).toBe(50);
    expect(outcome.session.verdict).toBe(VERDICT.SHORTENED);
  });

  it('still lets the finished exercise progress', () => {
    const bench = outcome.session.exercises.find((ex) => ex.exerciseId === 'barbell-bench-press');
    expect(bench.progressionEligible).toBeTruthy();
  });

  it('leaves the untouched exercise as not started', () => {
    const press = outcome.session.exercises.find((ex) => ex.exerciseId === 'overhead-press');
    expect(press.status).toBe(EXERCISE_STATUS.NOT_STARTED);
    expect(press.progressionEligible).toBeFalsy();
  });
});

/* ── Scenario 3: cancelling ─────────────────────────────────────────────── */

describe('ExecutionEngine — cancelled session', () => {
  let session = started();
  session = logSets(session, 'barbell-bench-press', 1, { reps: 10, weightKg: 60, rpe: 8 });
  const outcome = E.cancel(session, { at: END, reason: 'shoulder felt off' });

  it('is cancelled, not completed', () => {
    expect(outcome.session.state).toBe(SESSION_STATE.CANCELLED);
    expect(outcome.session.verdict).toBe(VERDICT.CANCELLED);
  });

  it('keeps what was logged rather than discarding it', () => {
    const bench = outcome.session.exercises.find((ex) => ex.exerciseId === 'barbell-bench-press');
    expect(bench.sets.length).toBe(1);
    expect(E.toGymRecords(outcome.session).length).toBe(1);
  });

  it('does not let progression treat it as a full session', () => {
    expect(outcome.session.progressable).toBeFalsy();
  });

  it('explains what happened', () => {
    const messages = outcome.session.reasons.map((r) => r.message).join(' ');
    expect(messages).toContain('cancelled');
  });
});

/* ── Scenario 4: skipping ───────────────────────────────────────────────── */

describe('ExecutionEngine — skipping', () => {
  it('skips a whole session before it starts', () => {
    const outcome = E.skip(planned(), { at: START, reason: 'travelling' });
    expect(outcome.session.state).toBe(SESSION_STATE.SKIPPED);
    expect(outcome.session.verdict).toBe(VERDICT.SKIPPED);
    expect(E.toGymRecords(outcome.session)).toEqual([]);
  });

  it('says that a skipped session changes nothing next week', () => {
    const outcome = E.skip(planned(), { at: START });
    expect(outcome.session.reasons.map((r) => r.message).join(' ')).toContain('unchanged');
  });

  it('skips one exercise inside a running session', () => {
    let session = started();
    session = logSets(session, 'barbell-bench-press', 3, { reps: 10, weightKg: 60, rpe: 8 });
    session = E.skipExercise(session, 'overhead-press', { reason: 'out of time' }).session;
    const outcome = E.complete(session, { at: END, history: [] });

    const press = outcome.session.exercises.find((ex) => ex.exerciseId === 'overhead-press');
    expect(press.status).toBe(EXERCISE_STATUS.SKIPPED);
    expect(outcome.session.feedback.items.some((item) => item.kind === 'skipped')).toBeTruthy();
  });
});

/* ── Scenarios 5 and 6: changing weight and reps ────────────────────────── */

describe('ExecutionEngine — changing the plan mid-session', () => {
  it('records going heavier than planned', () => {
    let session = started();
    session = logSets(session, 'barbell-bench-press', 3, { reps: 10, weightKg: 65, rpe: 8 });
    const outcome = E.complete(session, { at: END, history: [] });

    const bench = outcome.session.exercises.find((ex) => ex.exerciseId === 'barbell-bench-press');
    expect(bench.actualWeightKg).toBe(65);
    expect(bench.plannedWeightKg).toBe(60);
    expect(outcome.session.feedback.items.some((item) => item.kind === 'load-up')).toBeTruthy();
  });

  it('records going lighter than planned', () => {
    let session = started();
    session = logSets(session, 'barbell-bench-press', 3, { reps: 10, weightKg: 50, rpe: 8 });
    const outcome = E.complete(session, { at: END, history: [] });

    expect(outcome.session.feedback.items.some((item) => item.kind === 'load-down')).toBeTruthy();
  });

  it('records more reps than planned without calling it a failure', () => {
    let session = started();
    session = logSets(session, 'barbell-bench-press', 3, { reps: 12, weightKg: 60, rpe: 7 });
    const outcome = E.complete(session, { at: END, history: [] });

    const bench = outcome.session.exercises.find((ex) => ex.exerciseId === 'barbell-bench-press');
    expect(bench.completedSets).toBe(3);
    expect(bench.completedReps).toBe(36);
    expect(bench.status).toBe(EXERCISE_STATUS.COMPLETED);
  });
});

/* ── Scenario 7: personal records ───────────────────────────────────────── */

describe('ExecutionEngine — personal records', () => {
  const first = (() => {
    let session = started();
    session = logSets(session, 'barbell-bench-press', 3, { reps: 10, weightKg: 60, rpe: 8 });
    return E.complete(session, { at: END, history: [] }).session;
  })();

  it('detects load, estimated one-rep max and volume separately', () => {
    const types = first.records.map((record) => record.type);
    expect(types.includes(RECORD_TYPE.LOAD)).toBeTruthy();
    expect(types.includes(RECORD_TYPE.E1RM)).toBeTruthy();
    expect(types.includes(RECORD_TYPE.VOLUME)).toBeTruthy();
  });

  it('emits an event per record', () => {
    let session = started();
    session = logSets(session, 'barbell-bench-press', 3, { reps: 10, weightKg: 60, rpe: 8 });
    const outcome = E.complete(session, { at: END, history: [] });
    const prEvents = outcome.events.filter((event) => event.type === 'PR_ACHIEVED');
    expect(prEvents.length).toBe(outcome.session.records.length);
  });

  it('does not claim a record that was already beaten', () => {
    const history = [{ ...first, date: '2026-07-20' }];

    let session = started();
    session = logSets(session, 'barbell-bench-press', 3, { reps: 8, weightKg: 55, rpe: 8 });
    const outcome = E.complete(session, { at: END, history });

    expect(outcome.session.records.length).toBe(0);
  });

  it('never claims a record from a failed set', () => {
    let session = started();
    // Heavy but missed: 6 reps against a plan of 10.
    session = logSets(session, 'barbell-bench-press', 3, { reps: 6, weightKg: 100, rpe: 10 });
    const outcome = E.complete(session, { at: END, history: [] });

    expect(outcome.session.records.length).toBe(0);
  });

  it('marks the estimated max as an estimate', () => {
    const e1rm = first.records.find((record) => record.type === RECORD_TYPE.E1RM);
    expect(e1rm.estimated).toBeTruthy();
  });

  it('reads previous bests only from earlier sessions', () => {
    const best = bestFrom([{ ...first, date: '2026-07-20' }], 'barbell-bench-press', '2026-07-27');
    expect(best.load).toBe(60);
    expect(bestFrom([{ ...first, date: '2026-08-01' }], 'barbell-bench-press', '2026-07-27').load).toBeNull();
  });
});

/* ── Scenarios 8 and 9: missing the target ──────────────────────────────── */

describe('ExecutionEngine — missing the target', () => {
  it('marks an exercise failed when most sets fall short', () => {
    let session = started();
    session = logSets(session, 'barbell-bench-press', 3, { reps: 7, weightKg: 60, rpe: 9.5 });
    const outcome = E.complete(session, { at: END, history: [] });

    const bench = outcome.session.exercises.find((ex) => ex.exerciseId === 'barbell-bench-press');
    expect(bench.status).toBe(EXERCISE_STATUS.FAILED);
    expect(bench.progressionEligible).toBeFalsy();
  });

  it('explains why the load will not go up', () => {
    let session = started();
    session = logSets(session, 'barbell-bench-press', 3, { reps: 7, weightKg: 60, rpe: 9.5 });
    const outcome = E.complete(session, { at: END, history: [] });

    const messages = outcome.session.reasons.map((r) => r.message).join(' ');
    expect(messages).toContain('will not carry a load increase');
  });

  it('treats only the last set falling short as ordinary fatigue', () => {
    let session = started();
    session = logSets(session, 'barbell-bench-press', 2, { reps: 10, weightKg: 60, rpe: 8 });
    session = E.logSet(session, 'barbell-bench-press', { reps: 7, weightKg: 60, rpe: 10 }).session;
    const outcome = E.complete(session, { at: END, history: [] });

    const bench = outcome.session.exercises.find((ex) => ex.exerciseId === 'barbell-bench-press');
    expect(bench.status).toBe(EXERCISE_STATUS.PARTIAL);
    expect(bench.progressionEligible).toBeTruthy();
    expect(bench.lateFatigue).toBeTruthy();
  });

  it('blocks progression when the session ran far above target RPE', () => {
    let session = started();
    session = logSets(session, 'barbell-bench-press', 3, { reps: 10, weightKg: 60, rpe: 9.5 });
    const outcome = E.complete(session, { at: END, history: [] });

    const bench = outcome.session.exercises.find((ex) => ex.exerciseId === 'barbell-bench-press');
    expect(bench.progressionEligible).toBeFalsy();

    const reason = outcome.session.reasons.find((r) => r.ruleId === 'failure.harder-than-planned');
    expect(reason.message).toContain('RPE');
  });

  it('does not call a set failed when no load was prescribed', () => {
    // First exposure: the engine gives reps but no weight, because the person
    // is finding a working load. Whatever they get is the baseline.
    const firstExposure = {
      ...DAY,
      exercises: [{ ...DAY.exercises[0], targetLoadKg: null }],
    };

    let session = E.start(E.fromDay(firstExposure), { at: START }).session;
    session = logSets(session, 'barbell-bench-press', 3, { reps: 6, weightKg: 40, rpe: 8 });
    const outcome = E.complete(session, { at: END, history: [] });

    const bench = outcome.session.exercises[0];
    expect(bench.status).toBe(EXERCISE_STATUS.COMPLETED);
    expect(bench.progressionEligible).toBeTruthy();
  });

  it('carries the failure into the logged row, not just the report', () => {
    let session = started();
    session = logSets(session, 'barbell-bench-press', 3, { reps: 6, weightKg: 60, rpe: 10 });
    const outcome = E.complete(session, { at: END, history: [] });

    const row = E.toGymRecords(outcome.session)[0];
    expect(row.status).toBe(EXERCISE_STATUS.FAILED);
  });
});

/* ── State machine ──────────────────────────────────────────────────────── */

describe('ExecutionEngine — state machine', () => {
  it('moves through pause and resume, excluding the pause from the duration', () => {
    let session = started();
    session = E.pause(session, { at: '2026-07-27T18:10:00.000Z' }).session;
    expect(session.state).toBe(SESSION_STATE.PAUSED);

    session = E.resume(session, { at: '2026-07-27T18:25:00.000Z' }).session;
    expect(session.state).toBe(SESSION_STATE.STARTED);
    expect(session.pausedSec).toBe(900);

    const outcome = E.complete(session, { at: END, history: [] });
    expect(outcome.session.actualDurationMin).toBe(35);   // 50 elapsed − 15 paused
  });

  it('notes a pause long enough to count as leaving', () => {
    let session = started();
    session = E.pause(session, { at: '2026-07-27T18:10:00.000Z' }).session;
    session = E.resume(session, { at: '2026-07-27T21:00:00.000Z' }).session;

    expect(session.reasons.some((r) => r.ruleId === 'execution.long-pause')).toBeTruthy();
  });

  it('refuses an illegal transition and says why', () => {
    const outcome = E.resume(started());
    expect(outcome.rejected.action).toBe('resume');
    expect(outcome.rejected.message).toContain('paused');
    expect(outcome.session.state).toBe(SESSION_STATE.STARTED);
  });

  it('refuses to log a set before the session starts', () => {
    const outcome = E.logSet(planned(), 'barbell-bench-press', { reps: 10, weightKg: 60 });
    expect(outcome.rejected).toBeTruthy();
    expect(outcome.session.exercises[0].sets.length).toBe(0);
  });

  it('accepts nothing after a terminal state', () => {
    let session = started();
    session = E.complete(session, { at: END, history: [] }).session;

    expect(E.logSet(session, 'barbell-bench-press', { reps: 10 }).rejected).toBeTruthy();
    expect(E.pause(session).rejected).toBeTruthy();
    expect(E.cancel(session).rejected).toBeTruthy();
  });

  it('refuses a set for an exercise that is not in the session', () => {
    const outcome = E.logSet(started(), 'not-in-this-session', { reps: 10 });
    expect(outcome.rejected.message).toContain('not part of this session');
  });
});

/* ── Invariants ─────────────────────────────────────────────────────────── */

describe('ExecutionEngine — invariants', () => {
  it('never mutates the session it was given', () => {
    const before = started();
    const snapshot = JSON.stringify(before);
    E.logSet(before, 'barbell-bench-press', { reps: 10, weightKg: 60 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('produces a verdict and a reason for every terminal state', () => {
    const cases = [
      E.complete(started(), { at: END, history: [] }),
      E.cancel(started(), { at: END }),
      E.skip(planned(), { at: END }),
    ];

    for (const outcome of cases) {
      expect(typeof outcome.session.verdict).toBe('string');
      expect(outcome.session.reasons.length).toBeGreaterThan(0);
      expect(outcome.session.reasons.every((r) => r.message.length > 20)).toBeTruthy();
    }
  });

  it('always reports feedback a screen could list', () => {
    let session = started();
    session = logSets(session, 'barbell-bench-press', 2, { reps: 10, weightKg: 60, rpe: 8 });
    const outcome = E.complete(session, { at: END, history: [] });

    expect(outcome.session.feedback.items.length).toBeGreaterThan(0);
    expect(outcome.session.feedback.items.every((item) => item.message.length > 10)).toBeTruthy();
  });

  it('gives live progress without changing state', () => {
    let session = started();
    session = logSets(session, 'barbell-bench-press', 2, { reps: 10, weightKg: 60 });

    const progress = E.progress(session);
    expect(progress.completedSets).toBe(2);
    expect(progress.plannedSets).toBe(6);
    expect(session.state).toBe(SESSION_STATE.STARTED);
  });

  it('leaves corrective work out of the completion percentage', () => {
    const withCorrective = {
      ...DAY,
      exercises: [...DAY.exercises, {
        exerciseId: 'band-pull-apart', name: 'Band Pull-Apart',
        sets: 2, reps: 15, targetLoadKg: null, rpe: 6, restSec: 30, corrective: true,
        muscles: { primary: ['rear_delts'], secondary: [] },
      }],
    };

    let session = E.start(E.fromDay(withCorrective), { at: START }).session;
    session = logSets(session, 'barbell-bench-press', 3, { reps: 10, weightKg: 60, rpe: 8 });
    session = logSets(session, 'overhead-press', 3, { reps: 8, weightKg: 40, rpe: 8 });
    const outcome = E.complete(session, { at: END, history: [] });

    expect(outcome.session.completionPercent).toBe(100);
  });

  it('carries its version and its caveat', () => {
    expect(E.formulas().execution.accuracy).toBe('exact');
    expect(E.formulas().execution.caveat).toContain('logged');
  });
});
