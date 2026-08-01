/**
 * failure-rules.js — what counts as a failed set, and what that means.
 *
 * The point of this file is one rule the rest of the app depends on: a set
 * that missed its target is not evidence that the load was right. Without it,
 * a session where every set fell two reps short would read as "top of the rep
 * range reached" and the engine would add weight on top.
 */

import { defineRule } from '../rule.js';
import { EXECUTION } from '../../engines/constants.js';

/**
 * Did this set fail?
 *
 * A set can only fail against a target it was given. On a first exposure the
 * engine prescribes no load — the person is finding a working weight — so
 * whatever reps they get are the baseline, not a miss.
 *
 * @param {{reps: number, rpe: number|null}} actual
 * @param {{reps: number, rpe: number|null, weightKg: number|null}} planned
 * @returns {{failed: boolean, why: string|null}}
 */
export function judgeSet(actual, planned) {
  if (planned.weightKg === null || planned.weightKg === undefined) {
    return { failed: false, why: null };
  }

  const shortfall = (planned.reps ?? 0) - (actual.reps ?? 0);

  if (shortfall >= EXECUTION.FAILURE_REP_MARGIN) {
    return {
      failed: true,
      why: `${actual.reps} of ${planned.reps} reps — ${shortfall} short, which is a missed set rather than a light one.`,
    };
  }

  if (actual.rpe !== null && planned.rpe !== null &&
      actual.rpe >= 10 && (actual.reps ?? 0) < (planned.reps ?? 0)) {
    return {
      failed: true,
      why: `Taken to failure at ${actual.reps} reps, short of the ${planned.reps} planned.`,
    };
  }

  return { failed: false, why: null };
}

export const failureRules = [
  defineRule({
    id: 'failure.exercise-missed-target',
    name: 'Exercise missed its target',
    scope: 'exercise',
    priority: 100,
    when: (context) => context.exercise.status === 'failed',
    apply: (context) => {
      const failed = context.exercise.sets.filter((set) => set.failed).length;
      return {
        patch: { progressionEligible: false },
        message: `${context.exercise.name} will not carry a load increase into next week: ${failed} of ${context.exercise.sets.length} sets missed the target reps. Repeating this weight until it is clean is the faster route.`,
      };
    },
  }),

  defineRule({
    id: 'failure.harder-than-planned',
    name: 'Harder than planned',
    scope: 'exercise',
    priority: 90,
    when: (context) => {
      const { actualRpe, plannedRpe } = context.exercise;
      return actualRpe !== null && plannedRpe !== null &&
        actualRpe - plannedRpe >= EXECUTION.RPE_OVERSHOOT;
    },
    apply: (context) => ({
      patch: { progressionEligible: false },
      message: `No load increase next week for ${context.exercise.name}. It averaged RPE ${context.exercise.actualRpe} against a target of ${context.exercise.plannedRpe} — the weight is already at the edge of what you can recover from.`,
    }),
  }),

  defineRule({
    id: 'failure.last-set-only',
    name: 'Only the last set fell short',
    scope: 'exercise',
    priority: 80,
    when: (context) => {
      const sets = context.exercise.sets ?? [];
      if (sets.length < 2) return false;
      const failed = sets.filter((set) => set.failed);
      return failed.length === 1 && failed[0].index === sets.length;
    },
    apply: (context) => ({
      patch: { progressionEligible: true, lateFatigue: true },
      message: `The last set of ${context.exercise.name} fell short while the earlier ones held. That is normal fatigue within a session, not a load that is too heavy — the weight still progresses.`,
    }),
  }),

  defineRule({
    id: 'failure.clean',
    name: 'Clean session for this exercise',
    scope: 'exercise',
    priority: 10,
    // Only when nothing above has already ruled. As the lowest-priority rule
    // it runs last, and without this guard it would overwrite a failure
    // verdict with a pass.
    when: (context, draft) =>
      draft.progressionEligible === undefined && (context.exercise.sets ?? []).length > 0,
    apply: (context) => ({
      patch: { progressionEligible: true },
      message: `${context.exercise.name} was completed as prescribed, so next week's progression can build on it.`,
    }),
  }),
];
