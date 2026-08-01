/**
 * progressive-overload.js — what to do with the load this week.
 *
 * One rule wins per exercise (selectOne), because an exercise gets exactly one
 * instruction: add weight, add reps, add a set, hold, or back off.
 *
 * Everything is judged against what was actually logged. With no history there
 * is nothing to progress from, and the engine says so instead of inventing a
 * starting weight.
 */

import { defineRule } from '../rule.js';
import { PROGRESSION, WORKOUT } from '../../engines/constants.js';
import { round } from '../../engines/calculation-engine.js';

export const ACTION = Object.freeze({
  START: 'start',
  ADD_LOAD: 'add_load',
  ADD_REPS: 'add_reps',
  ADD_SET: 'add_set',
  HOLD: 'hold',
  BACK_OFF: 'back_off',
  DELOAD: 'deload',
});

/** The practical smallest jump for a lift, in kg. */
function loadStep(record, lastWeight) {
  const lowerBody = ['quads', 'hamstrings', 'glutes', 'calves']
    .some((muscle) => record.muscles.primary.includes(muscle));

  if (lastWeight !== null && lastWeight < PROGRESSION.LIGHT_LOAD_KG) {
    return PROGRESSION.LOAD_STEP_UPPER_KG;
  }
  return lowerBody ? PROGRESSION.LOAD_STEP_LOWER_KG : PROGRESSION.LOAD_STEP_UPPER_KG;
}

export const overloadRules = [
  defineRule({
    id: 'overload.deload-week',
    name: 'Deload the load',
    scope: 'exercise',
    priority: 100,
    when: (context) => context.week.deload && context.performance !== null,
    apply: (context) => {
      const last = context.performance.last;
      const load = round(last.topWeightKg * PROGRESSION.DELOAD_LOAD_FACTOR, 1);
      return {
        patch: { action: ACTION.DELOAD, targetLoadKg: load },
        message: `Drop to ${load} kg, from ${last.topWeightKg} kg. It is a deload week: the load comes off so fatigue can clear, and you pick the weight back up next week.`,
      };
    },
  }),

  defineRule({
    id: 'overload.no-history',
    name: 'First time on this exercise',
    scope: 'exercise',
    priority: 90,
    when: (context) => context.performance === null,
    apply: (context) => ({
      patch: { action: ACTION.START, targetLoadKg: null },
      message: `No load is prescribed — you have not logged ${context.record.name} before. Work up to a weight you could stop ${round(10 - (context.week.targetRpe ?? 8), 0)} reps short of failure, and that becomes the number everything else is measured from.`,
    }),
  }),

  defineRule({
    id: 'overload.stalled',
    name: 'Stalled, so back off and rebuild',
    scope: 'exercise',
    priority: 85,
    when: (context) =>
      context.performance.stalls >= PROGRESSION.STALL_SESSIONS && !context.week.deload,
    apply: (context) => {
      const last = context.performance.last;
      const load = round(last.topWeightKg * PROGRESSION.STALL_BACKOFF, 1);
      return {
        patch: { action: ACTION.BACK_OFF, targetLoadKg: load },
        message: `Back off to ${load} kg, about ${Math.round((1 - PROGRESSION.STALL_BACKOFF) * 100)}% down. ${context.record.name} has gone ${context.performance.stalls} sessions without beating ${last.topWeightKg} kg — running into the same wall again will not move it, but rebuilding into it usually does.`,
      };
    },
  }),

  defineRule({
    id: 'overload.last-session-failed',
    name: 'Last session missed its target',
    scope: 'exercise',
    priority: 82,
    when: (context) => context.performance?.last?.failed === true && !context.week.deload,
    apply: (context) => ({
      patch: { action: ACTION.HOLD, targetLoadKg: context.performance.last.topWeightKg },
      message: `Stay at ${context.performance.last.topWeightKg} kg. The last session on ${context.record.name} did not make the target reps, and adding weight on top of a miss only makes the next miss bigger.`,
    }),
  }),

  defineRule({
    id: 'overload.too-hard-last-time',
    name: 'Last session was harder than intended',
    scope: 'exercise',
    priority: 80,
    when: (context) => {
      const rpe = context.performance.last.avgRpe;
      return rpe !== null && rpe > PROGRESSION.RPE_TOO_HARD;
    },
    apply: (context) => ({
      patch: { action: ACTION.HOLD, targetLoadKg: context.performance.last.topWeightKg },
      message: `Stay at ${context.performance.last.topWeightKg} kg. Last time this averaged RPE ${context.performance.last.avgRpe}, past the RPE ${context.week.targetRpe ?? 8} it should sit at — repeating the weight until it feels easier is progress, even though the number does not move.`,
    }),
  }),

  defineRule({
    id: 'overload.top-of-range-and-easy',
    name: 'Top of the range at target effort',
    scope: 'exercise',
    priority: 70,
    when: (context) => {
      const [, high] = context.week.repRange ?? [8, 12];
      const last = context.performance.last;
      const easyEnough = last.avgRpe === null || last.avgRpe <= PROGRESSION.RPE_READY_TO_ADD;
      return last.topReps >= high && easyEnough && last.topWeightKg > 0;
    },
    apply: (context) => {
      const last = context.performance.last;
      const step = loadStep(context.record, last.topWeightKg);
      const load = round(last.topWeightKg + step, 1);
      const [low] = context.week.repRange ?? [8, 12];

      return {
        patch: { action: ACTION.ADD_LOAD, targetLoadKg: load },
        message: `Up to ${load} kg, from ${last.topWeightKg}. You reached ${last.topReps} reps${last.avgRpe !== null ? ` at RPE ${last.avgRpe}` : ''}, which is the top of the range with effort to spare. Expect the reps to drop back to about ${low} at the new weight.`,
      };
    },
  }),

  defineRule({
    id: 'overload.bodyweight-add-reps',
    name: 'Add reps when there is no load to add',
    scope: 'exercise',
    priority: 65,
    when: (context) => context.performance.last.topWeightKg === 0,
    apply: (context) => {
      const last = context.performance.last;
      return {
        patch: { action: ACTION.ADD_REPS, targetLoadKg: 0, targetReps: last.topReps + 1 },
        message: `Aim for ${last.topReps + 1} reps, one more than last time. There is no weight to add on ${context.record.name}, so reps and tempo are the load.`,
      };
    },
  }),

  defineRule({
    id: 'overload.within-range-add-reps',
    name: 'Inside the range, so add a rep',
    scope: 'exercise',
    priority: 60,
    when: (context) => {
      const [low, high] = context.week.repRange ?? [8, 12];
      const last = context.performance.last;
      return last.topReps >= low && last.topReps < high;
    },
    apply: (context) => {
      const last = context.performance.last;
      const [, high] = context.week.repRange ?? [8, 12];
      return {
        patch: { action: ACTION.ADD_REPS, targetLoadKg: last.topWeightKg, targetReps: Math.min(high, last.topReps + 1) },
        message: `Same ${last.topWeightKg} kg, but aim for ${Math.min(high, last.topReps + 1)} reps instead of ${last.topReps}. Reps go up until the top of the range, then the weight does — that way the jump is earned.`,
      };
    },
  }),

  defineRule({
    id: 'overload.below-range-hold',
    name: 'Below the range, so hold',
    scope: 'exercise',
    priority: 55,
    when: (context) => {
      const [low] = context.week.repRange ?? [8, 12];
      return context.performance.last.topReps < low;
    },
    apply: (context) => {
      const last = context.performance.last;
      const [low] = context.week.repRange ?? [8, 12];
      return {
        patch: { action: ACTION.HOLD, targetLoadKg: last.topWeightKg },
        message: `Hold ${last.topWeightKg} kg until you can do ${low} reps with it. You managed ${last.topReps} last time, which is under the range this block is built on.`,
      };
    },
  }),

  defineRule({
    id: 'overload.default-hold',
    name: 'Hold',
    scope: 'exercise',
    priority: 10,
    when: () => true,
    apply: (context) => ({
      patch: { action: ACTION.HOLD, targetLoadKg: context.performance?.last?.topWeightKg ?? null },
      message: `Repeat last session's weight. Nothing in the recent history calls for a change yet.`,
    }),
  }),
];

/** Warm-up sets before the first working set of an exercise. */
export function warmupSetsFor(record, { isFirstForMuscle = true, targetLoadKg = null }) {
  if (!isFirstForMuscle || targetLoadKg === null || targetLoadKg === 0) return 0;
  return WORKOUT.WARMUP_SETS[record.category] ?? 1;
}
