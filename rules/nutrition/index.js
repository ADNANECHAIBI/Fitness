/**
 * rules/nutrition/index.js — the nutrition rule sets, in pipeline order.
 *
 *   dietBreak → is the whole week at maintenance   (stack, resolves to a flag)
 *   refeed    → is one day at maintenance          (stack)
 *   calorie   → the daily target                   (stack)
 *   macro     → protein, fat, carbohydrate, fibre  (stack)
 *   recovery  → extra fuel when recovery is poor   (stack)
 *   goal      → bulk or cut commentary and rates   (stack)
 *   hydration → fluid and sodium                   (stack)
 *   safety    → floors and caps, always last       (stack)
 */

export { calorieRules } from './calorie-rules.js';
export { macroRules } from './macro-rules.js';
export { safetyRules } from './safety-rules.js';
export { bulkRules } from './bulk-rules.js';
export { cutRules } from './cut-rules.js';
export { nutritionRecoveryRules } from './recovery-rules.js';
export { refeedRules } from './refeed-rules.js';
export { dietBreakRules } from './diet-break-rules.js';
export { hydrationRules } from './hydration-rules.js';

import { calorieRules } from './calorie-rules.js';
import { macroRules } from './macro-rules.js';
import { safetyRules } from './safety-rules.js';
import { bulkRules } from './bulk-rules.js';
import { cutRules } from './cut-rules.js';
import { nutritionRecoveryRules } from './recovery-rules.js';
import { refeedRules } from './refeed-rules.js';
import { dietBreakRules } from './diet-break-rules.js';
import { hydrationRules } from './hydration-rules.js';

export const NUTRITION_RULE_SETS = Object.freeze({
  dietBreak: dietBreakRules,
  refeed: refeedRules,
  calorie: calorieRules,
  macro: macroRules,
  recovery: nutritionRecoveryRules,
  goal: [...bulkRules, ...cutRules],
  hydration: hydrationRules,
  safety: safetyRules,
});

export function allNutritionRules() {
  return Object.values(NUTRITION_RULE_SETS).flat();
}
