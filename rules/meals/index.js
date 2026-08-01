/**
 * rules/meals/index.js — the meal rule sets, in pipeline order.
 *
 *   distribution → how many meals and their shares   (stack, per day)
 *   appetite     → density versus volume             (stack, per day)
 *   budget       → the allowance and the pressure    (stack, per day)
 *   timing       → where the carbohydrate sits       (stack, per day)
 *   safety       → what is wrong with the result     (stack, per day, last)
 *
 * Selection and replacement are functions rather than rule lists, because they
 * run per meal and per food rather than per day.
 */

export { distributionRules } from './meal-distribution.js';
export { appetiteRules } from './appetite-rules.js';
export { budgetRules, judgeDayCost } from './budget-rules.js';
export { timingRules } from './timing-rules.js';
export { mealSafetyRules } from './safety-rules.js';
export { replacementRules, findReplacement } from './replacement-rules.js';
export { buildMeal, sumFoods, practicalPortion } from './meal-selection.js';
export { scoreFood, rankFoods, explainFood, ROLE, WEIGHTS } from './food-priority.js';

import { distributionRules } from './meal-distribution.js';
import { appetiteRules } from './appetite-rules.js';
import { budgetRules } from './budget-rules.js';
import { timingRules } from './timing-rules.js';
import { mealSafetyRules } from './safety-rules.js';
import { replacementRules } from './replacement-rules.js';

export const MEAL_RULE_SETS = Object.freeze({
  distribution: distributionRules,
  appetite: appetiteRules,
  budget: budgetRules,
  timing: timingRules,
  safety: mealSafetyRules,
  replacement: replacementRules,
});

export function allMealRules() {
  return Object.values(MEAL_RULE_SETS).flat();
}
