/**
 * meal-distribution.js — how many meals, and how the day splits between them.
 *
 * The nutrition engine already split the day; these rules may reshape it when
 * appetite or training calls for something different. They never change the
 * day's totals — only how those totals are divided.
 */

import { defineRule } from '../rule.js';
import { MEAL_PLANNING, MEAL_SHAPES } from '../../engines/constants.js';

export const distributionRules = [
  defineRule({
    id: 'distribution.from-appetite',
    name: 'Meal count from appetite',
    scope: 'day',
    priority: 100,
    when: () => true,
    apply: (context) => {
      const count = MEAL_PLANNING.MEALS_BY_APPETITE[context.appetite] ?? 4;
      return {
        patch: { mealCount: count },
        message: context.appetite === 'low'
          ? `${count} meals today. A small appetite does better with more, smaller meals than with three large ones it cannot finish.`
          : context.appetite === 'high'
            ? `${count} meals today — a strong appetite can take the day's food in fewer, larger sittings.`
            : `${count} meals today.`,
      };
    },
  }),

  defineRule({
    id: 'distribution.more-meals-on-big-days',
    name: 'An extra meal on the largest days',
    scope: 'day',
    priority: 90,
    when: (context, draft) =>
      context.day.trainingDay &&
      context.day.runningDay &&
      draft.mealCount < MEAL_PLANNING.MAX_MEALS,
    apply: (context, draft) => ({
      patch: { mealCount: draft.mealCount + 1 },
      message: `One more meal than usual: lifting and running on the same day makes this the largest day of the week, and spreading it out is easier than eating it in ${draft.mealCount}.`,
    }),
  }),

  defineRule({
    id: 'distribution.fewer-meals-on-rest-days',
    name: 'Fewer meals on a rest day',
    scope: 'day',
    priority: 80,
    when: (context, draft) =>
      context.day.restDay &&
      context.appetite !== 'low' &&
      draft.mealCount > MEAL_PLANNING.MIN_MEALS,
    apply: (context, draft) => ({
      patch: { mealCount: draft.mealCount - 1 },
      message: `One fewer meal on a rest day — there is less food to fit in, and nothing to fuel around.`,
    }),
  }),

  defineRule({
    id: 'distribution.shape',
    name: 'How the day divides',
    scope: 'day',
    priority: 70,
    when: (context, draft) => Boolean(draft.mealCount),
    apply: (context, draft) => {
      const shape = MEAL_SHAPES[draft.mealCount] ?? MEAL_SHAPES[4];
      return {
        patch: { shape },
        message: `Split across ${shape.map((meal) => meal.slot.replace(/_/g, ' ')).join(', ')}.`,
      };
    },
  }),
];
