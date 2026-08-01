/**
 * completion-rules.js — how a finished session is judged.
 *
 * One rule wins: a session gets a single verdict. The verdict is about the
 * session, not the person — "abandoned" describes a training log entry.
 */

import { defineRule } from '../rule.js';
import { EXECUTION, EXERCISE_STATUS } from '../../engines/constants.js';

export const VERDICT = Object.freeze({
  COMPLETE: 'complete',
  SHORTENED: 'shortened',
  ABANDONED: 'abandoned',
  CANCELLED: 'cancelled',
  SKIPPED: 'skipped',
});

export const completionRules = [
  defineRule({
    id: 'completion.cancelled',
    name: 'Session cancelled',
    scope: 'session',
    priority: 100,
    when: (context) => context.session.state === 'cancelled',
    apply: (context) => ({
      patch: { verdict: VERDICT.CANCELLED },
      message: `Session cancelled after ${context.stats.completedSets} of ${context.stats.plannedSets} sets. What was logged still counts as evidence — it is not thrown away.`,
    }),
  }),

  defineRule({
    id: 'completion.skipped',
    name: 'Session skipped',
    scope: 'session',
    priority: 95,
    when: (context) => context.session.state === 'skipped',
    apply: () => ({
      patch: { verdict: VERDICT.SKIPPED },
      message: `Session skipped. Nothing was logged, so next week's loads are unchanged — the engine will not guess at what would have happened.`,
    }),
  }),

  defineRule({
    id: 'completion.full',
    name: 'Session completed',
    scope: 'session',
    priority: 80,
    when: (context) => context.stats.completion >= EXECUTION.COMPLETION_SUCCESS,
    apply: (context) => ({
      patch: { verdict: VERDICT.COMPLETE },
      message: `${context.stats.completionPercent}% of the planned sets were completed. That counts as a full session, and progression reads it as one.`,
    }),
  }),

  defineRule({
    id: 'completion.abandoned',
    name: 'Session abandoned early',
    scope: 'session',
    priority: 70,
    when: (context) => context.stats.completion < EXECUTION.COMPLETION_ABANDONED,
    apply: (context) => ({
      patch: { verdict: VERDICT.ABANDONED },
      message: `Only ${context.stats.completionPercent}% of the planned sets were done. Too little to judge the loads by, so next week keeps this week's weights rather than moving them on incomplete evidence.`,
    }),
  }),

  defineRule({
    id: 'completion.shortened',
    name: 'Session shortened',
    scope: 'session',
    priority: 60,
    when: () => true,
    apply: (context) => ({
      patch: { verdict: VERDICT.SHORTENED },
      message: `${context.stats.completionPercent}% of the planned sets were completed — a shortened session. The exercises you did finish still count toward progression; the ones you did not are simply absent.`,
    }),
  }),
];

/** Verdicts that progression is allowed to read as evidence of success. */
export const PROGRESSABLE_VERDICTS = Object.freeze([VERDICT.COMPLETE, VERDICT.SHORTENED]);

/** Per-exercise status from what was logged against what was planned. */
export function statusFor(exercise) {
  const logged = exercise.sets ?? [];
  const done = logged.filter((set) => set.completed);
  const failed = logged.filter((set) => set.failed);

  if (exercise.status === EXERCISE_STATUS.SKIPPED) return EXERCISE_STATUS.SKIPPED;
  if (!logged.length) return EXERCISE_STATUS.NOT_STARTED;

  if (failed.length / logged.length >= EXECUTION.EXERCISE_FAILURE_RATIO) {
    return EXERCISE_STATUS.FAILED;
  }
  if (done.length >= exercise.plannedSets) return EXERCISE_STATUS.COMPLETED;
  return EXERCISE_STATUS.PARTIAL;
}
