/**
 * meal-context.js — the facts the meal rules read.
 *
 * It computes no macro target of its own. Everything nutritional arrives from
 * the NutritionWeek the nutrition engine already produced; this file only
 * derives what the *food* side needs — the budget, the constraints, the time,
 * and which foods are eligible at all.
 *
 * Pure.
 */

import { round, clamp } from './calculation-engine.js';
import { FoodDB } from '../data/foods/index.js';
import {
  MEAL_PLANNING, BUDGET, MEAL_SHAPES, UNITS,
} from './constants.js';

/**
 * The daily food budget in dirham, and where the figure came from.
 * @returns {{madPerDay: number, source: string, stated: boolean}}
 */
export function resolveBudget(settings) {
  if (settings?.budgetMadPerDay > 0) {
    return { madPerDay: settings.budgetMadPerDay, source: 'stated daily budget', stated: true };
  }
  if (settings?.budgetMadPerMonth > 0) {
    return {
      madPerDay: round(settings.budgetMadPerMonth / BUDGET.DAYS_PER_MONTH, 2),
      source: 'stated monthly budget',
      stated: true,
    };
  }

  const level = settings?.budgetLevel ?? 'medium';
  return {
    madPerDay: BUDGET.MAD_PER_DAY[level] ?? BUDGET.MAD_PER_DAY.medium,
    source: `assumed from a "${level}" budget level`,
    stated: false,
  };
}

/**
 * Build the meal-planning context.
 *
 * @param {object} input
 * @param {object} input.nutritionWeek   the only source of macro targets
 * @param {object} [input.profile]
 * @param {object} [input.settings]
 * @param {object} [input.workoutWeek]
 * @param {object} [input.runningWeek]
 * @param {object} [input.foodDb]        injected so tests can use a fixture
 * @returns {object}
 */
export function createMealContext({
  nutritionWeek,
  profile = null,
  settings = null,
  goals = [],
  workoutWeek = null,
  runningWeek = null,
  foodDb = FoodDB,
} = {}) {
  const budget = resolveBudget(settings);
  const appetite = settings?.appetite ?? 'normal';

  const prepMinutes = settings?.cookingMinutesPerDay ?? MEAL_PLANNING.DEFAULT_PREP_MINUTES;

  /* Dietary constraints. These are hard: nothing gets past them. */
  const constraints = {
    vegetarian: Boolean(settings?.vegetarian),
    vegan: Boolean(settings?.vegan),
    excludedFoods: settings?.excludedFoods ?? [],
    moroccanOnly: Boolean(settings?.moroccanOnly),
  };

  /* The eligible pool, computed once. Everything downstream draws from it. */
  const pool = foodDb.query({
    vegetarian: constraints.vegetarian || constraints.vegan ? true : undefined,
    vegan: constraints.vegan ? true : undefined,
    moroccan: constraints.moroccanOnly ? true : undefined,
    exclude: constraints.excludedFoods,
  });

  /* Which days carry training, read from the weeks already built. */
  const trainingByDate = new Map();
  for (const day of workoutWeek?.days ?? []) {
    trainingByDate.set(day.date, { ...(trainingByDate.get(day.date) ?? {}), gym: day });
  }
  for (const session of runningWeek?.sessions ?? []) {
    trainingByDate.set(session.date, { ...(trainingByDate.get(session.date) ?? {}), run: session });
  }

  const days = (nutritionWeek?.days ?? []).map((day) => ({
    /* The nutrition targets, untouched. */
    date: day.date,
    weekday: day.weekday,
    targets: {
      calories: day.calories,
      proteinG: day.proteinG,
      carbsG: day.carbsG,
      fatG: day.fatG,
      fibreG: day.fibreG,
      waterL: day.waterL,
    },
    nutritionMeals: day.mealDistribution ?? [],
    trainingDay: day.trainingDay,
    runningDay: day.runningDay,
    restDay: day.restDay,
    refeedDay: Boolean(day.refeedDay),
    training: trainingByDate.get(day.date) ?? null,
  }));

  return Object.freeze({
    weekNumber: nutritionWeek?.weekNumber ?? 1,
    startDate: nutritionWeek?.startDate ?? null,
    endDate: nutritionWeek?.endDate ?? null,
    goal: nutritionWeek?.goal ?? 'maintenance',

    profile,
    settings,
    goals,

    days,
    dayCount: days.length,

    budget: {
      ...budget,
      madPerWeek: round(budget.madPerDay * UNITS.DAYS_PER_WEEK, 2),
    },

    appetite,
    prepMinutes,
    constraints,

    /** Every food that passes the hard constraints. */
    pool,
    poolSize: pool.length,
    foodDb,

    /** Whether the pool is rich enough to plan from at all. */
    hasProtein: pool.some((food) => food.proteinG >= 10),
    hasCarbs: pool.some((food) => food.carbsG >= 40),
    hasFat: pool.some((food) => food.fatG >= 20),
  });
}

/** The meal shape for a count, falling back to the nearest defined one. */
export function shapeFor(mealCount) {
  const count = clamp(mealCount, MEAL_PLANNING.MIN_MEALS, MEAL_PLANNING.MAX_MEALS);
  return MEAL_SHAPES[count] ?? MEAL_SHAPES[4];
}

export { MEAL_PLANNING, BUDGET };
