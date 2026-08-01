/**
 * replacement-rules.js — swapping a food out.
 *
 * A replacement keeps the role and gets as close as it can on the macro that
 * role was chosen for. Every swap records what it replaced and why.
 */

import { defineRule } from '../rule.js';
import { rankFoods } from './food-priority.js';
import { makeReason } from '../rule.js';
import { round } from '../../engines/calculation-engine.js';

export const replacementRules = [
  defineRule({
    id: 'replacement.unavailable',
    name: 'Food is not available',
    scope: 'replacement',
    priority: 100,
    when: (context) => context.reason === 'unavailable',
    apply: (context) => ({
      patch: { swap: true, cause: 'unavailable' },
      message: `${context.original.name} is not available, so the closest alternative in the same role takes its place.`,
    }),
  }),

  defineRule({
    id: 'replacement.over-budget',
    name: 'Food costs too much',
    scope: 'replacement',
    priority: 90,
    when: (context) => context.reason === 'over-budget',
    apply: (context) => ({
      patch: { swap: true, cause: 'over-budget' },
      message: `${context.original.name} pushes the day over budget. A cheaper source of the same macro replaces it, which usually costs some variety rather than any nutrition.`,
    }),
  }),

  defineRule({
    id: 'replacement.excluded',
    name: 'Food is excluded',
    scope: 'replacement',
    priority: 95,
    when: (context) => context.reason === 'excluded',
    apply: (context) => ({
      patch: { swap: true, cause: 'excluded' },
      message: `${context.original.name} is on your excluded list and was replaced.`,
    }),
  }),

  defineRule({
    id: 'replacement.repeated-too-often',
    name: 'Food appears too often',
    scope: 'replacement',
    priority: 80,
    when: (context) => context.reason === 'repetition',
    apply: (context) => ({
      patch: { swap: true, cause: 'repetition' },
      message: `${context.original.name} already appears often enough this week. Eating one food every day is how a plan stops being followed, and it narrows what you get from it.`,
    }),
  }),
];

/**
 * Find the closest replacement for a food in a role.
 *
 * @param {object} options
 * @param {object} options.original   the MealFood being replaced
 * @param {object} options.context    meal context
 * @param {string} options.role
 * @param {string} options.reason     unavailable | over-budget | excluded | repetition
 * @param {string[]} [options.exclude]
 * @returns {{food: object, reason: object, delta: object}|null}
 */
export function findReplacement({ original, context, role, reason, exclude = [], usedCounts = {} }) {
  const source = context.foodDb.byId(original.foodId);
  if (!source) return null;

  const macroKey = { protein: 'proteinG', carb: 'carbsG', fat: 'fatG', fibre: 'fiberG' }[role] ?? 'proteinG';

  const candidates = context.pool.filter((food) =>
    food.id !== original.foodId &&
    !exclude.includes(food.id) &&
    food[macroKey] > 0 &&
    (reason !== 'over-budget' || (food.priceMadPerKg ?? Infinity) < (source.priceMadPerKg ?? 0)));

  if (!candidates.length) return null;

  const ranked = rankFoods(candidates, {
    role,
    usedCounts,
    budgetPressure: reason === 'over-budget' ? 1 : 0,
    maxPrepMin: context.prepMinutes,
  });

  const winner = ranked[0].food;

  return {
    food: winner,
    delta: {
      [macroKey]: round(winner[macroKey] - source[macroKey], 1),
      costMadPerKg: round((winner.priceMadPerKg ?? 0) - (source.priceMadPerKg ?? 0), 2),
    },
    reason: makeReason(
      { id: `replacement.${reason}`, name: 'Food replaced', scope: 'replacement' },
      `${winner.name} replaces ${source.name} in the ${role} role — ${
        reason === 'over-budget' ? 'it costs less per kilo'
        : reason === 'repetition' ? 'it keeps the week from repeating'
        : reason === 'excluded' ? 'the original is excluded'
        : 'the original is not available'
      }, and it supplies ${winner[macroKey]} g of ${role === 'carb' ? 'carbohydrate' : role} per 100 g against ${source[macroKey]}.`,
      { replaced: source.id, replacedBy: winner.id, cause: reason }
    ),
  };
}
