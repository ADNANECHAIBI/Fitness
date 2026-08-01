/**
 * budget-rules.js — money.
 *
 * The budget is a real constraint, and when it cannot be met the engine says
 * so rather than quietly producing a plan nobody can afford.
 */

import { defineRule } from '../rule.js';
import { round } from '../../engines/calculation-engine.js';
import { BUDGET } from '../../engines/constants.js';

export const budgetRules = [
  defineRule({
    id: 'budget.daily-allowance',
    name: 'The daily allowance',
    scope: 'day',
    priority: 100,
    when: (context) => context.budget.madPerDay > 0,
    apply: (context) => ({
      patch: { budgetMad: context.budget.madPerDay, budgetPressure: 0 },
      message: `About ${context.budget.madPerDay} MAD for the day — ${context.budget.source}.`,
    }),
  }),

  defineRule({
    id: 'budget.assumed-not-stated',
    name: 'The budget was assumed',
    scope: 'day',
    priority: 95,
    when: (context) => !context.budget.stated,
    apply: (context) => ({
      patch: { budgetAssumed: true },
      message: `No budget was set, so ${context.budget.madPerDay} MAD a day is assumed from your stated budget level. Setting a real figure will change what gets chosen.`,
    }),
  }),

  defineRule({
    id: 'budget.tight-prioritises-cost',
    name: 'A tight budget changes the priorities',
    scope: 'day',
    priority: 85,
    when: (context, draft) => {
      const floor = cheapestPossibleDay(context);
      return floor !== null && floor > draft.budgetMad * BUDGET.PRESSURE_THRESHOLD;
    },
    apply: (context, draft) => {
      const floor = cheapestPossibleDay(context);
      return {
        patch: { budgetPressure: 1, costFirst: true, floorCostMad: floor },
        message: `Cost is weighted heavily today. Even built from the cheapest adequate sources the day comes to about ${floor} MAD of the ${draft.budgetMad} available, so price is chosen over variety and convenience.`,
      };
    },
  }),

  defineRule({
    id: 'budget.comfortable',
    name: 'The budget is comfortable',
    scope: 'day',
    priority: 60,
    when: (context, draft) => draft.budgetPressure === 0 && context.budget.madPerDay >= BUDGET.MAD_PER_DAY.high,
    apply: () => ({
      patch: { varietyFirst: true },
      message: `The budget is comfortable, so variety and preparation time carry more weight than price.`,
    }),
  }),
];

/**
 * What the day would cost built entirely from the cheapest sources of each
 * macro. It is a floor, not a plan — nobody eats only lentils and bread — but
 * it is the honest way to ask whether the budget can carry the targets at all.
 *
 * @returns {number|null} dirham
 */
export function cheapestPossibleDay(context) {
  const targets = context.day?.targets;
  if (!targets?.calories) return null;

  const cheapestPer = (criteria, macroKey) => {
    const candidates = context.pool
      .filter((food) => food[macroKey] > 0 && food.priceMadPerKg !== null && criteria(food))
      // dirham per gram of the macro
      .map((food) => food.priceMadPerKg / (food[macroKey] * 10));

    return candidates.length ? Math.min(...candidates) : null;
  };

  const proteinRate = cheapestPer((food) => food.proteinG >= 10, 'proteinG');
  const carbRate = cheapestPer((food) => food.carbsG >= 15, 'carbsG');
  const fatRate = cheapestPer((food) => food.fatG >= 15, 'fatG');

  if (proteinRate === null || carbRate === null || fatRate === null) return null;

  return round(
    targets.proteinG * proteinRate + targets.carbsG * carbRate + targets.fatG * fatRate, 2);
}

/**
 * Judge a finished day against its budget.
 * @returns {{withinBudget: boolean, overBy: number, message: string}}
 */
export function judgeDayCost(costMad, budgetMad) {
  const ceiling = budgetMad * (1 + BUDGET.TOLERANCE);

  if (costMad <= budgetMad) {
    return {
      withinBudget: true,
      overBy: 0,
      message: `The day costs about ${round(costMad, 2)} MAD, inside the ${round(budgetMad, 2)} MAD budget.`,
    };
  }

  if (costMad <= ceiling) {
    return {
      withinBudget: true,
      overBy: round(costMad - budgetMad, 2),
      message: `The day costs about ${round(costMad, 2)} MAD, ${round(costMad - budgetMad, 2)} over the ${round(budgetMad, 2)} MAD budget but inside the ${Math.round(BUDGET.TOLERANCE * 100)}% tolerance.`,
    };
  }

  return {
    withinBudget: false,
    overBy: round(costMad - budgetMad, 2),
    message: `This day cannot be built inside the budget. It costs about ${round(costMad, 2)} MAD against ${round(budgetMad, 2)} available — ${round(costMad - budgetMad, 2)} MAD over. The cheapest adequate foods were already chosen; hitting these macros needs either more money or lower targets. Prices in the database are estimates, so check them against a real shop before trusting the gap.`,
  };
}
