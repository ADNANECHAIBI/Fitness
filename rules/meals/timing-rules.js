/**
 * timing-rules.js — where the carbohydrate goes within the day.
 *
 * These shift shares between meals. The day's totals are set by the nutrition
 * engine and are never changed here — only their placement.
 */

import { defineRule } from '../rule.js';
import { round } from '../../engines/calculation-engine.js';

/** Move a share of the day's carbohydrate toward chosen slots. */
function biasToward(shape, slots, fraction) {
  const targets = shape.filter((meal) => slots.includes(meal.slot));
  const others = shape.filter((meal) => !slots.includes(meal.slot));
  if (!targets.length || !others.length) return shape;

  const moved = fraction / others.length;

  return shape.map((meal) => {
    if (slots.includes(meal.slot)) {
      return { ...meal, carbBias: round((meal.carbBias ?? 1) + fraction / targets.length, 3) };
    }
    return { ...meal, carbBias: round(Math.max(0.4, (meal.carbBias ?? 1) - moved), 3) };
  });
}

export const timingRules = [
  defineRule({
    id: 'timing.carbs-around-lifting',
    name: 'Carbohydrate around the lifting session',
    scope: 'day',
    priority: 100,
    when: (context, draft) => context.day.trainingDay && Boolean(draft.shape),
    apply: (context, draft) => ({
      patch: { shape: biasToward(draft.shape, ['lunch', 'afternoon_snack', 'dinner'], 0.3) },
      message: `Carbohydrate is weighted toward the meals nearest the session. What matters most over a day is the total, but eating the bulk of it around training makes the session and the recovery from it easier.`,
    }),
  }),

  defineRule({
    id: 'timing.carbs-before-running',
    name: 'Carbohydrate before the run',
    scope: 'day',
    priority: 90,
    when: (context, draft) => context.day.runningDay && Boolean(draft.shape),
    apply: (context, draft) => ({
      patch: {
        shape: biasToward(draft.shape, ['breakfast', 'morning_snack', 'afternoon_snack'], 0.2),
        extraWater: true,
      },
      message: `Some carbohydrate moves earlier, before the run, and fluid goes up with it. Running on an empty tank is possible but it is not where the good sessions come from.`,
    }),
  }),

  defineRule({
    id: 'timing.rest-day-even',
    name: 'An even spread on a rest day',
    scope: 'day',
    priority: 70,
    when: (context, draft) => context.day.restDay && Boolean(draft.shape),
    apply: (context, draft) => ({
      patch: { shape: draft.shape.map((meal) => ({ ...meal, carbBias: 1 })) },
      message: `Carbohydrate is spread evenly — there is no session to fuel, so timing stops mattering and only the total does.`,
    }),
  }),

  defineRule({
    id: 'timing.protein-spread',
    name: 'Protein at every meal',
    scope: 'day',
    priority: 60,
    when: (context, draft) => Boolean(draft.shape),
    apply: () => ({
      patch: { proteinEveryMeal: true },
      message: `Protein is spread across every meal rather than concentrated in one. Muscle protein synthesis responds to each feeding, so several moderate doses beat one large one.`,
    }),
  }),
];
