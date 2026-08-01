/**
 * cut-rules.js — what a deficit needs.
 *
 * The aggressive-cut path exists because it was asked for. It is bounded by
 * the safety rules and it says plainly what it costs.
 */

import { defineRule } from '../rule.js';
import { round } from '../../engines/calculation-engine.js';
import { NUTRITION_SAFETY, ADJUSTMENT, NUTRITION_GOAL } from '../../engines/constants.js';

export const cutRules = [
  defineRule({
    id: 'cut.expected-rate',
    name: 'What the scale should show',
    scope: 'week',
    priority: 100,
    when: (context) => context.inDeficit && context.weightKg > 0,
    apply: (context) => {
      const rate = round((ADJUSTMENT.TARGET_RATE_FRACTION[context.goal] ?? 0) * context.weightKg, 2);
      return {
        patch: { expectedRateKgPerWeek: rate },
        message: `Expect about ${rate} kg a week. Losing faster than that costs more muscle per kilo, and the weight comes back more readily.`,
      };
    },
  }),

  defineRule({
    id: 'cut.aggressive-costs',
    name: 'What an aggressive cut costs',
    scope: 'week',
    priority: 95,
    when: (context) => context.goal === NUTRITION_GOAL.AGGRESSIVE_CUT,
    apply: () => ({
      patch: { aggressiveCut: true },
      message: `This is the steepest deficit the engine will prescribe. It works, but expect training performance to drop, hunger to be constant, and more of the loss to come from muscle than on a slower cut. It is not a setting to hold for months, and it is worth discussing with a doctor if you have any medical condition or take medication.`,
    }),
  }),

  defineRule({
    id: 'cut.losing-too-fast',
    name: 'Losing faster than is useful',
    scope: 'week',
    priority: 90,
    when: (context) =>
      context.inDeficit &&
      context.weightTrend.ratePerWeek !== null &&
      context.weightKg > 0 &&
      context.weightTrend.ratePerWeek < -(context.weightKg * NUTRITION_SAFETY.MAX_LOSS_RATE),
    apply: (context) => ({
      patch: { rateWarning: 'excessive', easeDeficit: true },
      message: `You are losing ${Math.abs(context.weightTrend.ratePerWeek)} kg a week, past the ${round(context.weightKg * NUTRITION_SAFETY.MAX_LOSS_RATE, 2)} kg ceiling of 1% of body weight. Calories go up rather than down — faster is not better here, and this rate is where strength starts going with the fat.`,
    }),
  }),

  defineRule({
    id: 'cut.stalled',
    name: 'The scale has stopped moving',
    scope: 'week',
    priority: 85,
    when: (context) =>
      context.inDeficit &&
      context.weightTrend.status === 'above-target' &&
      context.weightTrend.readings >= ADJUSTMENT.MIN_READINGS &&
      context.weeksInDeficit >= 2,
    apply: (context) => ({
      patch: { rateWarning: 'stalled' },
      message: `Weight has been flat for ${context.weeksInDeficit} weeks in a deficit. Before cutting further: a stall this early is usually water retention from training or from stress, or an underestimate of what is actually being eaten. The reduction above is small on purpose.`,
    }),
  }),

  defineRule({
    id: 'cut.protect-training-quality',
    name: 'Protect the training',
    scope: 'week',
    priority: 70,
    when: (context) =>
      context.inDeficit && context.performance.failedExercises >= 2,
    apply: (context) => ({
      patch: { trainingSuffering: true },
      message: `${context.performance.failedExercises} exercises missed their targets last week. In a deficit that is expected up to a point, but if it keeps happening the deficit is too steep for the training you are asking for — one of the two has to give.`,
    }),
  }),
];
