/**
 * pr-rules.js — detecting a personal record.
 *
 * Three kinds, because "best" means three different things and conflating them
 * hides progress: a lifter can be stronger without touching their top single,
 * and can add tonnage while their top set stays put.
 *
 * Records are only claimed against completed sets. A failed rep is not a best.
 */

import { defineRule } from '../rule.js';
import { StrengthEngine } from '../../engines/strength-engine.js';
import { EXECUTION } from '../../engines/constants.js';
import { round } from '../../engines/calculation-engine.js';

export const RECORD_TYPE = Object.freeze({
  LOAD: 'load',
  VOLUME: 'volume',
  E1RM: 'estimated_1rm',
});

export const prRules = [
  defineRule({
    id: 'pr.heaviest-load',
    name: 'Heaviest load',
    scope: 'record',
    priority: 100,
    when: (context) =>
      context.current.topWeightKg > 0 &&
      context.current.topWeightKg >= (context.previousBest.load ?? 0) + EXECUTION.PR_LOAD_MARGIN_KG,
    apply: (context, draft) => ({
      patch: {
        records: [...(draft.records ?? []), {
          type: RECORD_TYPE.LOAD,
          exerciseId: context.exerciseId,
          value: context.current.topWeightKg,
          previous: context.previousBest.load ?? null,
          unit: 'kg',
        }],
      },
      message: `Heaviest ever on ${context.name}: ${context.current.topWeightKg} kg${context.previousBest.load ? `, up from ${context.previousBest.load} kg` : ' — the first one on record'}.`,
    }),
  }),

  defineRule({
    id: 'pr.estimated-one-rep-max',
    name: 'Estimated one-rep max',
    scope: 'record',
    priority: 90,
    when: (context) =>
      context.current.e1rm !== null &&
      context.current.e1rm >= (context.previousBest.e1rm ?? 0) + EXECUTION.PR_E1RM_MARGIN_KG,
    apply: (context, draft) => ({
      patch: {
        records: [...(draft.records ?? []), {
          type: RECORD_TYPE.E1RM,
          exerciseId: context.exerciseId,
          value: context.current.e1rm,
          previous: context.previousBest.e1rm ?? null,
          unit: 'kg',
          estimated: true,
        }],
      },
      message: `Best estimated one-rep max on ${context.name}: ${context.current.e1rm} kg, from ${context.current.topWeightKg} kg for ${context.current.topReps}. It is an estimate from a formula, not a lift you performed.`,
    }),
  }),

  defineRule({
    id: 'pr.session-volume',
    name: 'Most tonnage in a session',
    scope: 'record',
    priority: 80,
    when: (context) =>
      context.current.volumeKg > 0 &&
      context.current.volumeKg >= (context.previousBest.volume ?? 0) + EXECUTION.PR_VOLUME_MARGIN_KG,
    apply: (context, draft) => ({
      patch: {
        records: [...(draft.records ?? []), {
          type: RECORD_TYPE.VOLUME,
          exerciseId: context.exerciseId,
          value: context.current.volumeKg,
          previous: context.previousBest.volume ?? null,
          unit: 'kg',
        }],
      },
      message: `Most total work on ${context.name} in one session: ${context.current.volumeKg} kg of tonnage${context.previousBest.volume ? `, past the old ${context.previousBest.volume} kg` : ''}.`,
    }),
  }),
];

/**
 * Numbers for one exercise in one session, from completed sets only.
 * @returns {{topWeightKg, topReps, volumeKg, e1rm}}
 */
export function sessionNumbers(exercise) {
  const done = (exercise.sets ?? []).filter((set) => set.completed && !set.failed);
  if (!done.length) return { topWeightKg: 0, topReps: 0, volumeKg: 0, e1rm: null };

  const topSet = done.reduce((best, set) =>
    (set.weightKg > best.weightKg ||
     (set.weightKg === best.weightKg && set.reps > best.reps)) ? set : best, done[0]);

  const volumeKg = round(
    done.reduce((total, set) => total + set.reps * set.weightKg, 0), 1);

  const estimate = StrengthEngine.oneRepMax({ weightKg: topSet.weightKg, reps: topSet.reps });

  return {
    topWeightKg: topSet.weightKg,
    topReps: topSet.reps,
    volumeKg,
    e1rm: estimate.reliable ? estimate.value : null,
  };
}
