/**
 * meal-planning-engine.js — builds one MealPlanWeek.
 *
 * It calculates no calorie or macro target. Every number it aims at comes from
 * the NutritionWeek the nutrition engine produced, and every food comes from
 * the food database by property rather than by name.
 *
 * Pure. No storage, no events, no UI.
 */

import { defineFormula, createSlot } from './formula.js';
import { round, sum, percentOf, clamp } from './calculation-engine.js';
import { createMealContext } from './meal-context.js';
import { applyAll, makeReason } from '../rules/rule.js';
import {
  MEAL_RULE_SETS, buildMeal, sumFoods, judgeDayCost, findReplacement,
} from '../rules/meals/index.js';
import { MEAL_PLANNING, UNITS } from './constants.js';

export const MEAL_ENGINE_VERSION = '1.0.0';

/**
 * How close a day landed, per macro and overall.
 * @returns {{calories, proteinG, carbsG, fatG, overall}} each 0–100
 */
function accuracy(actual, targets) {
  const closeness = (got, want) => {
    if (!want) return 100;
    return round(clamp(100 - Math.abs(got - want) / want * 100, 0, 100), 1);
  };

  const parts = {
    calories: closeness(actual.calories, targets.calories),
    proteinG: closeness(actual.proteinG, targets.proteinG),
    carbsG: closeness(actual.carbsG, targets.carbsG),
    fatG: closeness(actual.fatG, targets.fatG),
  };

  // Protein counts double: it is the target worth hitting when others slip.
  parts.overall = round(
    (parts.calories + parts.proteinG * 2 + parts.carbsG + parts.fatG) / 5, 1);

  return parts;
}

/** Build one day of meals. */
function buildDay({ day, context, ruleSets, weeklyCounts }) {
  const reasons = [];

  /* Day-level decisions: how many meals, how dense, what budget, what timing. */
  let draft = { day };
  for (const stage of ['distribution', 'appetite', 'budget', 'timing']) {
    const applied = applyAll(ruleSets[stage], { ...context, day }, draft);
    draft = applied.draft;
    reasons.push(...applied.reasons.map((reason) => ({ ...reason, date: day.date })));
  }

  const shape = draft.shape ?? [];
  const usedCounts = { ...weeklyCounts };
  const dailyCounts = {};

  /* One meal per slot. */
  const meals = shape.map((slotSpec) => {
    const carbBias = slotSpec.carbBias ?? 1;

    const targets = {
      calories: round(day.targets.calories * slotSpec.share, 0),
      proteinG: round(day.targets.proteinG * slotSpec.share, 1),
      carbsG: round(day.targets.carbsG * slotSpec.share * carbBias, 1),
      fatG: round(day.targets.fatG * slotSpec.share, 1),
      fibreG: round((day.targets.fibreG ?? 0) * slotSpec.share, 1),
    };

    const meal = buildMeal({ slot: slotSpec.slot, targets, context, day: draft, usedCounts });

    for (const food of meal.foods) {
      usedCounts[food.foodId] = (usedCounts[food.foodId] ?? 0) + 1;
      dailyCounts[food.foodId] = (dailyCounts[food.foodId] ?? 0) + 1;
    }

    return meal;
  });

  /* Swap out anything that ended up on the plate too many times today. */
  const swapped = enforceVariety({ meals, context, dailyCounts, usedCounts, reasons, date: day.date });

  const actual = sumFoods(swapped.flatMap((meal) => meal.foods));
  const prepMinutes = swapped.reduce((total, meal) => total + meal.prepMinutes, 0);

  const cost = judgeDayCost(actual.costMad, draft.budgetMad ?? 0);
  reasons.push(makeReason(
    { id: cost.withinBudget ? 'budget.within' : 'budget.exceeded', name: 'Day cost', scope: 'day' },
    cost.message,
    { date: day.date, costMad: actual.costMad, budgetMad: draft.budgetMad, overBy: cost.overBy }
  ));

  /* What is wrong with the finished day. */
  const safety = applyAll(ruleSets.safety, {
    ...context, meals: swapped, actual, targets: day.targets, prepMinutes,
  }, {});
  reasons.push(...safety.reasons.map((reason) => ({ ...reason, date: day.date })));

  return {
    day: {
      date: day.date,
      weekday: day.weekday,
      meals: swapped,

      calories: actual.calories,
      proteinG: actual.proteinG,
      carbsG: actual.carbsG,
      fatG: actual.fatG,
      fibreG: actual.fibreG,
      waterL: day.targets.waterL,

      costMad: actual.costMad,
      prepMinutes,
      withinBudget: cost.withinBudget,
      overBudgetBy: cost.overBy,

      targets: day.targets,
      accuracy: accuracy(actual, day.targets),

      trainingDay: day.trainingDay,
      runningDay: day.runningDay,
      restDay: day.restDay,

      flags: safety.draft,
      reason: makeReason(
        { id: 'meal-day.built', name: 'Day built', scope: 'day' },
        `${swapped.length} meals, ${actual.calories} kcal and ${actual.proteinG} g of protein against targets of ${day.targets.calories} and ${day.targets.proteinG}. About ${round(actual.costMad, 2)} MAD and ${prepMinutes} minutes of preparation.`,
        { date: day.date }
      ),
      reasons,
    },
    usedCounts,
  };
}

/**
 * Replace foods that appear too often in one day.
 * Reuses the replacement rules rather than making its own judgement.
 */
function enforceVariety({ meals, context, dailyCounts, usedCounts, reasons, date }) {
  const over = Object.entries(dailyCounts)
    .filter(([, count]) => count > MEAL_PLANNING.MAX_DAILY_REPEATS)
    .map(([foodId]) => foodId);

  if (!over.length) return meals;

  const seen = {};

  return meals.map((meal) => ({
    ...meal,
    foods: meal.foods.map((food) => {
      if (!over.includes(food.foodId)) return food;

      seen[food.foodId] = (seen[food.foodId] ?? 0) + 1;
      if (seen[food.foodId] <= MEAL_PLANNING.MAX_DAILY_REPEATS) return food;

      const replacement = findReplacement({
        original: food, context, role: food.role, reason: 'repetition', usedCounts,
      });
      if (!replacement) return food;

      reasons.push({ ...replacement.reason, date });

      const portion = context.foodDb.portion(replacement.food.id, food.quantity);
      return {
        ...food,
        foodId: replacement.food.id,
        name: replacement.food.name,
        calories: portion.calories,
        proteinG: portion.proteinG,
        carbsG: portion.carbsG,
        fatG: portion.fatG,
        fibreG: portion.fiberG,
        costMad: portion.priceMad,
        cookingMin: replacement.food.cookingMin,
        replacedFoodId: food.foodId,
        reason: replacement.reason,
      };
    }),
  })).map((meal) => ({ ...meal, ...sumFoods(meal.foods) }));
}

export const DEFAULT_MEAL_BUILDER = defineFormula({
  id: 'greedy-meal-planner',
  name: 'Greedy meal planner',
  source: 'A greedy constructive heuristic: anchor each meal on a protein source, then fill carbohydrate, fat and fibre. Portion sizes are rounded to practical increments. It is not an optimiser and does not search the solution space.',
  accuracy: 'estimate',
  useWhen: 'Turning the nutrition targets into a week of meals from what is available and affordable.',
  caveat: 'It will not land exactly on the macros — the gap is reported as macro accuracy rather than hidden. Costs come from the price estimates in the food database, which are the least reliable data in the project and should be checked against a real shop.',

  compute(context, ruleSets = MEAL_RULE_SETS) {
    const notes = [];
    const reasons = [];

    if (!context.days.length) {
      notes.push('No nutrition targets to plan against — the nutrition week is empty.');
      return emptyWeek(context, notes);
    }

    if (!context.hasProtein) {
      notes.push('No usable protein source passes your dietary constraints, so the plan cannot be built properly. Widen the constraints or add foods to the database.');
    }

    let weeklyCounts = {};
    const days = [];

    for (const day of context.days) {
      if (day.targets.calories === null || !day.targets.calories) {
        notes.push(`${day.date}: no calorie target, so no meals were planned.`);
        continue;
      }

      const built = buildDay({ day, context, ruleSets, weeklyCounts });
      days.push(built.day);
      weeklyCounts = built.usedCounts;
      reasons.push(...built.day.reasons);
    }

    const weeklyCost = round(sum(days.map((day) => day.costMad)), 2);
    const dailyCost = days.length ? round(weeklyCost / days.length, 2) : 0;

    const overall = days.length
      ? round(sum(days.map((day) => day.accuracy.overall)) / days.length, 1)
      : 0;

    if (overall < MEAL_PLANNING.GOOD_ACCURACY * 100) {
      notes.push(`The plan lands at ${overall}% macro accuracy. Portions are rounded to practical sizes and the food list is finite, so some gap is expected — protein is weighted double in that figure because it is the target worth hitting.`);
    }

    const overBudgetDays = days.filter((day) => !day.withinBudget);
    if (overBudgetDays.length) {
      notes.push(`${overBudgetDays.length} day${overBudgetDays.length === 1 ? '' : 's'} could not be built inside the budget.`);
    }

    if (!context.budget.stated) {
      notes.push('The budget was assumed rather than set. Costs are estimates on top of an assumption.');
    }

    return {
      weekNumber: context.weekNumber,
      startDate: context.startDate,
      endDate: context.endDate,
      goal: context.goal,

      days,

      weeklyCostMad: weeklyCost,
      dailyCostAverageMad: dailyCost,
      budgetMadPerWeek: context.budget.madPerWeek,
      withinBudget: weeklyCost <= context.budget.madPerWeek,

      macroAccuracy: {
        overall,
        calories: average(days, 'calories'),
        proteinG: average(days, 'proteinG'),
        carbsG: average(days, 'carbsG'),
        fatG: average(days, 'fatG'),
      },

      variety: {
        distinctFoods: Object.keys(weeklyCounts).length,
        mostUsed: Object.entries(weeklyCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([foodId, count]) => ({ foodId, count })),
      },

      notes,
      reasons,

      meta: {
        generatedAt: new Date().toISOString(),
        engineVersion: MEAL_ENGINE_VERSION,
        engineId: 'greedy-meal-planner',
        poolSize: context.poolSize,
        budgetSource: context.budget.source,
      },
    };
  },
});

function average(days, key) {
  if (!days.length) return 0;
  return round(sum(days.map((day) => day.accuracy[key])) / days.length, 1);
}

function emptyWeek(context, notes) {
  return {
    weekNumber: context.weekNumber,
    startDate: context.startDate,
    endDate: context.endDate,
    goal: context.goal,
    days: [],
    weeklyCostMad: 0,
    dailyCostAverageMad: 0,
    budgetMadPerWeek: context.budget.madPerWeek,
    withinBudget: true,
    macroAccuracy: { overall: 0, calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    variety: { distinctFoods: 0, mostUsed: [] },
    notes,
    reasons: [],
    meta: {
      generatedAt: new Date().toISOString(),
      engineVersion: MEAL_ENGINE_VERSION,
      engineId: 'greedy-meal-planner',
      poolSize: context.poolSize,
      budgetSource: context.budget.source,
    },
  };
}

export const mealSlot = createSlot('meal-planner', DEFAULT_MEAL_BUILDER);

export const MealPlanningEngine = Object.freeze({
  /**
   * Build a week of meals.
   * @param {object} input see createMealContext
   * @returns {object} MealPlanWeek
   */
  build(input, { ruleSets = MEAL_RULE_SETS } = {}) {
    return this.buildFromContext(createMealContext(input), { ruleSets });
  },

  buildFromContext(context, { ruleSets = MEAL_RULE_SETS } = {}) {
    const week = mealSlot.current.compute(context, ruleSets);
    week.meta.formula = mealSlot.current.describe();
    return week;
  },

  /** Every reason in a plan, flattened — week, day, meal and food. */
  allReasons(mealWeek) {
    return [
      ...mealWeek.reasons,
      ...mealWeek.days.flatMap((day) => [
        day.reason,
        ...day.meals.flatMap((meal) => [
          ...meal.reasons,
          ...meal.foods.map((food) => food.reason),
        ]),
      ]),
    ].filter(Boolean);
  },

  formulas() { return { mealPlanning: mealSlot.current.describe() }; },
});

export { createMealContext };
