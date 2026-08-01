/**
 * bulk-rules.js — what a surplus needs that a deficit does not.
 */

import { defineRule } from '../rule.js';
import { round } from '../../engines/calculation-engine.js';
import { NUTRITION_SAFETY, ADJUSTMENT } from '../../engines/constants.js';

export const bulkRules = [
  defineRule({
    id: 'bulk.expected-rate',
    name: 'What the scale should show',
    scope: 'week',
    priority: 100,
    when: (context) => context.inSurplus && context.weightKg > 0,
    apply: (context) => {
      const rate = round((ADJUSTMENT.TARGET_RATE_FRACTION[context.goal] ?? 0) * context.weightKg, 2);
      return {
        patch: { expectedRateKgPerWeek: rate },
        message: `Expect about +${rate} kg a week. Faster than that on a ${context.goal.replace(/_/g, ' ')} is mostly fat, and it is far easier to not gain it than to lose it later.`,
      };
    },
  }),

  defineRule({
    id: 'bulk.gaining-too-fast',
    name: 'Gaining faster than intended',
    scope: 'week',
    priority: 90,
    when: (context) =>
      context.inSurplus &&
      context.weightTrend.status === 'above-target' &&
      context.weightTrend.ratePerWeek !== null,
    apply: (context) => ({
      patch: { rateWarning: 'fast' },
      message: `The scale is moving at ${context.weightTrend.ratePerWeek} kg a week against a target of ${context.weightTrend.targetRate}. The calorie reduction above handles it; if it keeps running fast, the training is more likely the problem than the food.`,
    }),
  }),

  defineRule({
    id: 'bulk.not-gaining',
    name: 'Not gaining at all',
    scope: 'week',
    priority: 85,
    when: (context) =>
      context.inSurplus &&
      context.weightTrend.status === 'below-target' &&
      context.weightTrend.readings >= ADJUSTMENT.MIN_READINGS,
    apply: (context) => ({
      patch: { rateWarning: 'slow' },
      message: `Weight is moving at ${context.weightTrend.ratePerWeek} kg a week, under the ${context.weightTrend.targetRate} this goal wants. Calories go up above — but before assuming the number is wrong, check that the eating actually matched the target, because the most common cause is a gap between the two.`,
    }),
  }),

  defineRule({
    id: 'bulk.gain-rate-ceiling',
    name: 'Rate ceiling on a surplus',
    scope: 'week',
    priority: 70,
    when: (context) =>
      context.inSurplus &&
      context.weightTrend.ratePerWeek !== null &&
      context.weightKg > 0 &&
      context.weightTrend.ratePerWeek > context.weightKg * NUTRITION_SAFETY.MAX_GAIN_RATE,
    apply: (context) => ({
      patch: { rateWarning: 'excessive' },
      message: `Gaining ${context.weightTrend.ratePerWeek} kg a week is beyond what anyone builds muscle at — above roughly ${round(context.weightKg * NUTRITION_SAFETY.MAX_GAIN_RATE, 2)} kg a week the extra is fat and water. Worth a second look at how the weigh-ins are taken before changing anything drastic.`,
    }),
  }),
];
