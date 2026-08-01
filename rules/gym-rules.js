/**
 * gym-rules.js — how many lifting days, and how hard.
 *
 * Rules set counts and intensity. They never name an exercise: what to do
 * inside a session belongs to a later engine.
 */

import { defineRule } from './rule.js';
import { PHASE, PLANNER, INTENSITY } from '../engines/constants.js';

/** Days that stay available after rest and mobility are taken out. */
function workableDays(context, draft) {
  return Math.max(
    0,
    context.maxTrainingDays - (draft.extraRestDays ?? 0) - (draft.mobilityDays ?? 0)
  );
}

export const gymRules = [
  defineRule({
    id: 'gym.share-by-phase',
    name: 'Gym days from the phase',
    scope: 'week',
    priority: 100,
    when: () => true,
    apply: (context, draft) => {
      const share = PLANNER.GYM_SHARE_BY_PHASE[draft.phase] ?? PLANNER.GYM_SHARE_BY_PHASE.hypertrophy;
      const workable = workableDays(context, draft);
      const gymDays = Math.max(
        workable > 0 ? PLANNER.MIN_GYM_DAYS : 0,
        Math.round(workable * share)
      );

      return {
        patch: { gymDays: Math.min(gymDays, workable) },
        message: `${Math.min(gymDays, workable)} lifting days out of ${workable} workable. A ${draft.phase} block puts about ${Math.round(share * 100)}% of available days under the bar.`,
      };
    },
  }),

  defineRule({
    id: 'gym.few-days-protect-lifting',
    name: 'Lifting protected on a short week',
    scope: 'week',
    priority: 90,
    when: (context) => context.availableDayCount < PLANNER.MIN_DAYS_FOR_RUNNING,
    apply: (context, draft) => ({
      patch: { gymDays: workableDays(context, draft) },
      message: `Every available day goes to lifting. With only ${context.availableDayCount} day${context.availableDayCount === 1 ? '' : 's'} free, splitting the week between two kinds of training would leave neither with enough stimulus to matter.`,
    }),
  }),

  defineRule({
    id: 'gym.intensity-by-phase',
    name: 'Session intensity from the phase',
    scope: 'week',
    priority: 80,
    when: () => true,
    apply: (context, draft) => {
      const byPhase = {
        [PHASE.FOUNDATION]: INTENSITY.MODERATE,
        [PHASE.HYPERTROPHY]: INTENSITY.MODERATE,
        [PHASE.STRENGTH]: INTENSITY.HARD,
        [PHASE.PEAK]: INTENSITY.HARD,
        [PHASE.RECOVERY]: INTENSITY.EASY,
      };
      const wanted = byPhase[draft.phase] ?? INTENSITY.MODERATE;

      // A cap set by a recovery rule always wins over what the phase wants.
      const order = [INTENSITY.EASY, INTENSITY.MODERATE, INTENSITY.HARD];
      const cap = draft.intensityCap ?? INTENSITY.HARD;
      const capped = order[Math.min(order.indexOf(wanted), order.indexOf(cap))];

      return {
        patch: { gymIntensity: capped },
        message: capped === wanted
          ? `Lifting sessions run at ${capped} intensity, which is what a ${draft.phase} block calls for.`
          : `Lifting sessions are held at ${capped} rather than ${wanted}: recovery this week does not support the intensity the ${draft.phase} block would otherwise ask for.`,
      };
    },
  }),

  defineRule({
    id: 'gym.volume-trend-not-gaining',
    name: 'Extra lifting day when weight is flat',
    scope: 'week',
    priority: 60,
    when: (context, draft) =>
      context.goal === 'bulk' &&
      context.weightTrend.status === 'below-target' &&
      draft.volumeFactor === 1 &&
      draft.gymDays < workableDays(context, draft),
    apply: (context, draft) => ({
      patch: { gymDays: draft.gymDays + 1 },
      message: `One lifting day is added. Your weight is moving at ${context.weightTrend.observedRate} kg/week against a target of ${context.weightTrend.targetRate} — more training stimulus is the half of that equation the planner controls.`,
    }),
  }),
];
