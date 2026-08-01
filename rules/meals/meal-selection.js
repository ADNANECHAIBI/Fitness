/**
 * meal-selection.js — building one meal from a macro target.
 *
 * The solver is greedy, and deliberately so: pick a protein anchor and portion
 * it, then a carbohydrate source, then fat, then something for fibre. It does
 * not search for an optimum, and it will not land exactly on the targets. The
 * error it does leave is measured and reported as macro accuracy rather than
 * hidden — a plan that claims to be exact would be lying.
 */

import { round, clamp } from '../../engines/calculation-engine.js';
import { rankFoods, explainFood, ROLE } from './food-priority.js';
import { makeReason } from '../rule.js';
import { MEAL_PLANNING, SLOT_FOOD_TYPES, UNITS } from '../../engines/constants.js';

/** Round a portion to something a person would actually weigh out. */
export function practicalPortion(food, grams) {
  const bounds = MEAL_PLANNING.PORTION_BOUNDS[food.group] ?? { min: 20, max: 300, step: 10 };
  const bounded = clamp(grams, bounds.min, bounds.max);

  // Countable foods move in whole units — three eggs, not 137 grams of egg.
  if (food.servingLabel && /\b(1|one)\b/.test(food.servingLabel) && food.servingG >= 20) {
    const units = Math.max(1, Math.round(bounded / food.servingG));
    return round(units * food.servingG, 0);
  }

  return round(Math.round(bounded / bounds.step) * bounds.step, 0);
}

/** Grams of a food needed to supply a target amount of one macro. */
function gramsFor(food, macroKey, targetGrams) {
  const per100 = food[macroKey];
  if (!per100 || per100 <= 0) return null;
  return (targetGrams / per100) * 100;
}

/** Nutrition for a portion, via the database rather than by hand. */
function portionOf(foodDb, food, grams) {
  return foodDb.portion(food.id, grams);
}

/**
 * Build one meal.
 *
 * @param {object} options
 * @param {string} options.slot
 * @param {{calories, proteinG, carbsG, fatG, fibreG}} options.targets
 * @param {object} options.context   the meal context
 * @param {object} options.day       day-level draft (appetite, budget flags)
 * @param {Record<string,number>} options.usedCounts
 * @returns {object} Meal
 */
export function buildMeal({ slot, targets, context, day, usedCounts }) {
  const slotTypes = SLOT_FOOD_TYPES[slot] ?? [];
  const foods = [];
  const reasons = [];

  const maxPrepMin = Math.max(5, Math.round(context.prepMinutes / Math.max(1, day.mealCount)));

  const scoring = {
    slotTypes,
    maxPrepMin,
    usedCounts,
    calorieDense: Boolean(day.calorieDense),
    budgetPressure: day.budgetPressure ?? 0,
  };

  const remaining = { ...targets };

  /* 1. Protein anchor. Every meal gets one — that is the timing rule's point. */
  const proteinPool = context.pool.filter((food) => food.proteinG >= 8 && food.cookingMin <= maxPrepMin);
  const proteinPick = pick(proteinPool, { ...scoring, role: ROLE.PROTEIN });

  if (proteinPick) {
    const grams = practicalPortion(proteinPick.food, gramsFor(proteinPick.food, 'proteinG', remaining.proteinG) ?? 0);
    const item = toMealFood(context, proteinPick, grams, ROLE.PROTEIN, proteinPool.length - 1);
    foods.push(item);
    subtract(remaining, item);
  }

  /* 2. Carbohydrate. */
  if (remaining.carbsG > 5) {
    const carbPool = context.pool.filter((food) =>
      food.carbsG >= 15 && food.cookingMin <= maxPrepMin && !foods.some((item) => item.foodId === food.id));
    const carbPick = pick(carbPool, { ...scoring, role: ROLE.CARB });

    if (carbPick) {
      const grams = practicalPortion(carbPick.food, gramsFor(carbPick.food, 'carbsG', remaining.carbsG) ?? 0);
      const item = toMealFood(context, carbPick, grams, ROLE.CARB, carbPool.length - 1);
      foods.push(item);
      subtract(remaining, item);
    }
  }

  /* 3. Fat, only if the first two did not already cover it. */
  if (remaining.fatG > 4) {
    const fatPool = context.pool.filter((food) =>
      food.fatG >= 15 && food.cookingMin <= maxPrepMin && !foods.some((item) => item.foodId === food.id));
    const fatPick = pick(fatPool, { ...scoring, role: ROLE.FAT });

    if (fatPick) {
      const grams = practicalPortion(fatPick.food, gramsFor(fatPick.food, 'fatG', remaining.fatG) ?? 0);
      const item = toMealFood(context, fatPick, grams, ROLE.FAT, fatPool.length - 1);
      foods.push(item);
      subtract(remaining, item);
    }
  }

  /* 4. Something for fibre, unless a small appetite says otherwise. */
  const wantsFibre = remaining.fibreG > 3 && !day.fibreCeiling && foods.length < MEAL_PLANNING.MAX_FOODS_PER_MEAL;
  if (wantsFibre) {
    const fibrePool = context.pool.filter((food) =>
      food.fiberG >= 2 && ['vegetable', 'fruit'].includes(food.group) &&
      food.cookingMin <= maxPrepMin && !foods.some((item) => item.foodId === food.id));
    const fibrePick = pick(fibrePool, { ...scoring, role: ROLE.FIBRE });

    if (fibrePick) {
      const grams = practicalPortion(fibrePick.food, gramsFor(fibrePick.food, 'fiberG', remaining.fibreG) ?? 0);
      const item = toMealFood(context, fibrePick, grams, ROLE.FIBRE, fibrePool.length - 1);
      foods.push(item);
      subtract(remaining, item);
    }
  }

  /*
   * Repair pass. The greedy build overshoots: a carbohydrate source brings
   * protein with it, a fat source brings calories, and each was portioned
   * against a target the others had not yet eaten into. Rather than pretend
   * the first pass was right, scale it back toward the target.
   */
  const repaired = refine(foods, targets, context);
  const totals = sumFoods(repaired);

  if (repaired.adjusted) {
    reasons.push(makeReason(
      { id: 'meal.portions-refined', name: 'Portions adjusted', scope: 'meal' },
      `Portions were scaled back after the first pass overshot — each food was sized against a target the others had not yet used up.`,
      { slot }
    ));
  }

  foods.length = 0;
  foods.push(...repaired);

  reasons.push(makeReason(
    { id: 'meal.composed', name: 'Meal composed', scope: 'meal' },
    foods.length
      ? `${slot.replace(/_/g, ' ')}: ${foods.length} item${foods.length === 1 ? '' : 's'} landing at ${totals.calories} kcal and ${totals.proteinG} g of protein against a target of ${Math.round(targets.calories)} and ${Math.round(targets.proteinG)}.`
      : `${slot.replace(/_/g, ' ')} could not be built — nothing in the available foods fits the constraints for this slot.`,
    { slot, target: targets, actual: totals }
  ));

  return {
    slot,
    foods,
    calories: totals.calories,
    proteinG: totals.proteinG,
    carbsG: totals.carbsG,
    fatG: totals.fatG,
    fibreG: totals.fibreG,
    costMad: totals.costMad,
    prepMinutes: foods.reduce((total, item) => Math.max(total, item.cookingMin), 0),
    cookingRequired: foods.some((item) => item.cookingMin > 0),
    targets,
    reasons,
  };
}

/**
 * Bring a built meal closer to its targets.
 *
 * Two moves only: scale everything to fix the calories, then resize the
 * protein anchor to fix the protein. Both stay inside practical portion
 * bounds, so the result is still something a person can weigh out.
 *
 * @returns {object[]} the adjusted foods, carrying an `adjusted` flag
 */
function refine(foods, targets, context) {
  if (!foods.length) return foods;

  let current = [...foods];
  let adjusted = false;

  const resize = (item, grams) => {
    const food = context.foodDb.byId(item.foodId);
    const portion = context.foodDb.portion(item.foodId, practicalPortion(food, grams));
    if (!portion || portion.grams === item.quantity) return item;

    adjusted = true;
    return {
      ...item,
      quantity: portion.grams,
      calories: portion.calories,
      proteinG: portion.proteinG,
      carbsG: portion.carbsG,
      fatG: portion.fatG,
      fibreG: portion.fiberG,
      costMad: portion.priceMad,
    };
  };

  for (let pass = 0; pass < 2; pass += 1) {
    const totals = sumFoods(current);

    /* 1. Calories: scale every portion by the same factor. */
    if (targets.calories > 0) {
      const ratio = totals.calories / targets.calories;
      if (Math.abs(ratio - 1) > MEAL_PLANNING.MACRO_TOLERANCE) {
        current = current.map((item) => resize(item, item.quantity / ratio));
      }
    }

    /* 2. Protein: resize the anchor only, so the other roles keep their job. */
    const after = sumFoods(current);
    if (targets.proteinG > 0) {
      const gap = after.proteinG - targets.proteinG;

      if (Math.abs(gap) > targets.proteinG * MEAL_PLANNING.MACRO_TOLERANCE) {
        const anchorIndex = current.findIndex((item) => item.role === 'protein');
        const anchor = current[anchorIndex];

        if (anchor) {
          const food = context.foodDb.byId(anchor.foodId);
          const perGram = food.proteinG / 100;
          if (perGram > 0) {
            current = current.map((item, index) =>
              index === anchorIndex ? resize(item, anchor.quantity - gap / perGram) : item);
          }
        }
      }
    }
  }

  current.adjusted = adjusted;
  return current;
}

/** Highest-scoring candidate, or null. */
function pick(pool, options) {
  if (!pool.length) return null;
  const ranked = rankFoods(pool, options);
  return { ...ranked[0], alternatives: ranked.slice(1, 4).map((entry) => entry.food.id) };
}

/** Turn a chosen food and portion into a MealFood, with its reason. */
function toMealFood(context, chosen, grams, role, alternativeCount) {
  const portion = portionOf(context.foodDb, chosen.food, grams);

  return {
    foodId: chosen.food.id,
    name: chosen.food.name,
    role,
    quantity: portion.grams,
    unit: 'g',
    servingLabel: chosen.food.servingLabel,
    calories: portion.calories,
    proteinG: portion.proteinG,
    carbsG: portion.carbsG,
    fatG: portion.fatG,
    fibreG: portion.fiberG,
    costMad: portion.priceMad,
    costConfidence: portion.priceConfidence,
    cookingMin: chosen.food.cookingMin,
    alternatives: chosen.alternatives,
    reason: makeReason(
      { id: 'meal.food-chosen', name: 'Food chosen', scope: 'food' },
      explainFood(chosen.food, chosen.parts, { role, alternatives: alternativeCount }),
      { role, scoreParts: chosen.parts, foodId: chosen.food.id }
    ),
  };
}

function subtract(remaining, item) {
  remaining.calories -= item.calories;
  remaining.proteinG -= item.proteinG;
  remaining.carbsG -= item.carbsG;
  remaining.fatG -= item.fatG;
  remaining.fibreG = (remaining.fibreG ?? 0) - item.fibreG;
}

/** Add up a list of MealFoods. */
export function sumFoods(foods) {
  const total = (key) => round(foods.reduce((sum, item) => sum + (item[key] ?? 0), 0), 1);
  return {
    calories: Math.round(foods.reduce((sum, item) => sum + item.calories, 0)),
    proteinG: total('proteinG'),
    carbsG: total('carbsG'),
    fatG: total('fatG'),
    fibreG: total('fibreG'),
    costMad: total('costMad'),
  };
}
