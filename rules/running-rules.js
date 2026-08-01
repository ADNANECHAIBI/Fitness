/**
 * running-rules.js — how much running the week can carry.
 *
 * Running competes with lifting for recovery. In a bulk it is capped so it
 * does not eat the surplus; in a cut it does more of the work.
 */

import { defineRule } from './rule.js';
import { PHASE, PLANNER, INTENSITY } from '../engines/constants.js';

function remainingDays(context, draft) {
  return Math.max(
    0,
    context.maxTrainingDays
      - (draft.gymDays ?? 0)
      - (draft.extraRestDays ?? 0)
      - (draft.mobilityDays ?? 0)
  );
}

export const runningRules = [
  defineRule({
    id: 'running.fills-remaining-days',
    name: 'Running takes what is left',
    scope: 'week',
    priority: 100,
    when: (context) => context.availableDayCount >= PLANNER.MIN_DAYS_FOR_RUNNING,
    apply: (context, draft) => {
      const days = remainingDays(context, draft);
      return {
        patch: { runningDays: days },
        message: days > 0
          ? `${days} running day${days === 1 ? '' : 's'} ${days === 1 ? 'fills' : 'fill'} the days left after lifting, rest and mobility are placed.`
          : `No running days this week — lifting, rest and mobility already account for every available day.`,
      };
    },
  }),

  defineRule({
    id: 'running.none-on-short-week',
    name: 'No running on a very short week',
    scope: 'week',
    priority: 95,
    when: (context) => context.availableDayCount < PLANNER.MIN_DAYS_FOR_RUNNING,
    apply: (context) => ({
      patch: { runningDays: 0 },
      message: `Running is dropped entirely. With ${context.availableDayCount} available day${context.availableDayCount === 1 ? '' : 's'}, adding a second training mode would cost more recovery than it returns.`,
    }),
  }),

  defineRule({
    id: 'running.cut-when-gaining-too-slowly',
    name: 'Less running when the surplus is not landing',
    scope: 'week',
    priority: 80,
    when: (context, draft) =>
      context.goal === 'bulk' &&
      context.weightTrend.status === 'below-target' &&
      (draft.runningDays ?? 0) > 1,
    apply: (context, draft) => ({
      patch: { runningDays: draft.runningDays - 1, runningIntensity: INTENSITY.EASY },
      message: `One running day is removed and the rest kept easy. You are gaining ${context.weightTrend.observedRate} kg/week against a ${context.weightTrend.targetRate} target, and cardio is burning part of the surplus you are trying to keep.`,
    }),
  }),

  defineRule({
    id: 'running.add-when-gaining-too-fast',
    name: 'More running when weight climbs too fast',
    scope: 'week',
    priority: 75,
    when: (context, draft) =>
      context.goal === 'bulk' &&
      context.weightTrend.status === 'above-target' &&
      remainingDays(context, draft) > 0,
    apply: (context, draft) => ({
      patch: { runningDays: (draft.runningDays ?? 0) + 1 },
      message: `A running day is added. Weight is climbing at ${context.weightTrend.observedRate} kg/week against a target of ${context.weightTrend.targetRate}, and gaining faster than that is mostly fat.`,
    }),
  }),

  defineRule({
    id: 'running.easy-in-recovery-phase',
    name: 'Easy running in a recovery week',
    scope: 'week',
    priority: 70,
    when: (context, draft) => draft.phase === PHASE.RECOVERY,
    apply: () => ({
      patch: { runningIntensity: INTENSITY.EASY },
      message: `Runs stay easy this week. In a recovery block their job is blood flow, not fitness.`,
    }),
  }),

  defineRule({
    id: 'running.default-intensity',
    name: 'Default running intensity',
    scope: 'week',
    priority: 10,
    when: (context, draft) => !draft.runningIntensity,
    apply: (context, draft) => {
      const order = [INTENSITY.EASY, INTENSITY.MODERATE, INTENSITY.HARD];
      const cap = draft.intensityCap ?? INTENSITY.HARD;
      const wanted = INTENSITY.MODERATE;
      const capped = order[Math.min(order.indexOf(wanted), order.indexOf(cap))];

      return {
        patch: { runningIntensity: capped },
        message: `Runs run at ${capped} effort by default this week.`,
      };
    },
  }),
];
