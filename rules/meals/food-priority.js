/**
 * food-priority.js — scoring a food for a role in a meal.
 *
 * Nothing here names a food. A role is a set of properties — "the protein
 * anchor of a cheap, quick breakfast" — and the score ranks whatever the
 * database returns for it.
 *
 * The weights are policy and live in one place so they can be tuned.
 */

import { round, divide } from '../../engines/calculation-engine.js';

export const ROLE = Object.freeze({
  PROTEIN: 'protein',
  CARB: 'carb',
  FAT: 'fat',
  FIBRE: 'fibre',
});

/** What each role is looking for, as a share of the score. */
export const WEIGHTS = Object.freeze({
  protein: { density: 40, cost: 25, prep: 15, availability: 10, variety: 20, slotMatch: 10 },
  carb:    { density: 30, cost: 30, prep: 20, availability: 10, variety: 20, slotMatch: 10 },
  fat:     { density: 30, cost: 20, prep: 25, availability: 10, variety: 20, slotMatch: 10 },
  fibre:   { density: 30, cost: 25, prep: 20, availability: 10, variety: 20, slotMatch: 10 },
});

/** Grams of the target macro per 100 kcal — how efficiently a food delivers it. */
function macroDensity(food, role) {
  if (!food.calories) return 0;
  const grams = {
    protein: food.proteinG,
    carb: food.carbsG,
    fat: food.fatG,
    fibre: food.fiberG,
  }[role] ?? 0;

  return (grams / food.calories) * 100;
}

/**
 * Score one food for one role.
 *
 * @param {object} food
 * @param {object} options
 * @param {string} options.role
 * @param {string[]} [options.slotTypes]   FoodDB meal types the slot accepts
 * @param {number} [options.maxPrepMin]    time available for this meal
 * @param {Record<string,number>} [options.usedCounts] food id → times used
 * @param {boolean} [options.calorieDense] prefer energy-dense foods
 * @returns {{score: number, parts: object}}
 */
export function scoreFood(food, {
  role = ROLE.PROTEIN, slotTypes = [], maxPrepMin = 60,
  usedCounts = {}, calorieDense = false, budgetPressure = 0,
} = {}) {
  const weights = WEIGHTS[role] ?? WEIGHTS.protein;
  const parts = {};

  /* How much of the wanted macro arrives per calorie. */
  const density = macroDensity(food, role);
  const densityCeiling = { protein: 25, carb: 22, fat: 11, fibre: 8 }[role] ?? 20;
  parts.density = round((Math.min(density, densityCeiling) / densityCeiling) * weights.density, 1);

  /* Cheap wins, and wins harder when the budget is tight. */
  const costPer100kcal = food.priceMadPerKg && food.calories
    ? divide(food.priceMadPerKg / 10, food.calories / 100)
    : null;
  const costScore = costPer100kcal === null ? 0.5
    : Math.max(0, 1 - Math.min(costPer100kcal / 5, 1));
  parts.cost = round(costScore * weights.cost * (1 + budgetPressure), 1);

  /* Quick wins, and anything over the time available scores nothing. */
  const prepScore = food.cookingMin > maxPrepMin ? 0 : 1 - (food.cookingMin / Math.max(maxPrepMin, 1));
  parts.prep = round(Math.max(0, prepScore) * weights.prep, 1);

  parts.availability = round(
    ({ everywhere: 1, common: 0.75, seasonal: 0.4, specialty: 0.2 }[food.availability] ?? 0.5)
    * weights.availability, 1);

  /* Repeats are penalised, which is what keeps a week from being one food. */
  const used = usedCounts[food.id] ?? 0;
  parts.variety = round(Math.max(0, 1 - used * 0.35) * weights.variety, 1);

  parts.slotMatch = slotTypes.length && food.mealTypes.some((type) => slotTypes.includes(type))
    ? weights.slotMatch : 0;

  /* A small appetite needs energy in less volume. */
  parts.density_bonus = calorieDense ? round(Math.min(food.calories / 600, 1) * 10, 1) : 0;

  const score = round(Object.values(parts).reduce((total, value) => total + value, 0), 1);
  return { score, parts };
}

/** Rank candidates best-first. Ties break on id, so plans are reproducible. */
export function rankFoods(foods, options = {}) {
  return foods
    .map((food) => ({ food, ...scoreFood(food, options) }))
    .sort((a, b) => b.score - a.score || a.food.id.localeCompare(b.food.id));
}

/** A sentence explaining why a food won its role. */
export function explainFood(food, parts, { role, alternatives }) {
  const reasons = [];
  const top = Object.entries(parts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const phrase = {
    density: `it carries a lot of ${role === 'carb' ? 'carbohydrate' : role} per calorie`,
    cost: 'it is among the cheapest sources available',
    prep: 'it needs little or no preparation',
    availability: 'it is easy to find',
    variety: 'it has not been used much this week',
    slotMatch: 'it suits this time of day',
    density_bonus: 'it packs energy into a small volume',
  }[top] ?? 'it fits the requirements';

  reasons.push(phrase);
  if (parts.cost > 15 && top !== 'cost') reasons.push('and it is inexpensive');
  if (parts.prep > 12 && top !== 'prep') reasons.push('and it is quick');

  return `${food.name} fills the ${role} role because ${reasons.join(', ')}. ` +
    `${alternatives} other food${alternatives === 1 ? '' : 's'} could have taken it.`;
}
