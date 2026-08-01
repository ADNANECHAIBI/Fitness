/**
 * nutrition-engine.js — builds one NutritionWeek.
 *
 * It calculates requirements. It does not choose food, build meals or know
 * anything about a screen — meal composition belongs to the engine that comes
 * after this one.
 *
 * Nothing here re-derives what another engine owns: energy from the energy
 * engine, the calorie adjustment from the adjustment engine, weight trend from
 * the body engine, training volume from the workout and running weeks,
 * adherence from the execution engines.
 *
 * Pure. No storage, no events, no UI.
 */

import { defineFormula, createSlot } from './formula.js';
import { round, clamp, sum } from './calculation-engine.js';
import { createNutritionContext } from './nutrition-context.js';
import { applyAll, makeReason } from '../rules/rule.js';
import { NUTRITION_RULE_SETS } from '../rules/nutrition/index.js';
import {
  UNITS, MACROS, MEAL_DISTRIBUTION, CALORIE_CYCLING, HYDRATION,
  HYDRATION_EXTRA, REFEED, NUTRITION_GOAL,
} from './constants.js';

export const NUTRITION_ENGINE_VERSION = '1.0.0';

/* ── Per-day shaping ────────────────────────────────────────────────────── */

/**
 * Spread the week's energy across its days.
 *
 * Training days take more and rest days less, and the week still averages the
 * target — the same cycling convention the planner already uses, applied here
 * at the level of actual macros.
 */
function shapeDays(context, week) {
  const days = context.days;
  if (!days.length || week.calories === null) {
    return { days: [], refeedDate: null };
  }

  const restCount = days.filter((day) => day.isRestDay).length;
  const workingCount = days.length - restCount;

  const restCalories = round(week.calories * (1 - CALORIE_CYCLING.REST_DAY_DELTA), 0);
  const trainingCalories = workingCount > 0
    ? round((week.calories * days.length - restCalories * restCount) / workingCount, 0)
    : restCalories;

  /* A refeed lands on the hardest training day of the week. */
  const refeedDate = week.refeed
    ? [...days].sort((a, b) => b.trainingMinutes - a.trainingMinutes)[0]?.date ?? null
    : null;

  const shaped = days.map((day) => {
    const isRefeed = day.date === refeedDate;

    const calories = isRefeed
      ? round(context.energy.tdee * REFEED.CALORIE_SHARE_OF_TDEE, 0)
      : (day.isRestDay ? restCalories : trainingCalories);

    /* Protein and fat hold; carbohydrate absorbs the difference. */
    const proteinG = week.proteinG;
    const fatG = week.fatG;
    const carbsG = Math.max(0, round(
      (calories - proteinG * UNITS.KCAL_PER_G_PROTEIN - fatG * UNITS.KCAL_PER_G_FAT)
      / UNITS.KCAL_PER_G_CARB, 0));

    const fibreG = round(clamp(
      (calories / 1000) * MACROS.FIBRE_G_PER_1000_KCAL,
      MACROS.FIBRE_MIN_G, MACROS.FIBRE_MAX_G), 0);

    const waterL = round(clamp(
      (week.waterBaselineL ?? HYDRATION.MIN_L)
      + ((day.gym?.minutes ?? 0) / UNITS.MINUTES_PER_HOUR) * HYDRATION.L_PER_TRAINING_HOUR
      + ((day.run?.minutes ?? 0) / UNITS.MINUTES_PER_HOUR) * HYDRATION_EXTRA.L_PER_RUNNING_HOUR,
      HYDRATION.MIN_L, HYDRATION.MAX_L), 2);

    return {
      date: day.date,
      weekday: day.weekday,

      calories,
      proteinG,
      carbsG,
      fatG,
      fibreG,
      waterL,

      mealDistribution: distributeMeals(calories, proteinG, context.mealCount),

      trainingDay: day.isTrainingDay,
      runningDay: day.isRunningDay,
      restDay: day.isRestDay,
      refeedDay: isRefeed,

      notes: dayNotes(day, { isRefeed, restCalories, trainingCalories }),
      reason: dayReason(day, { isRefeed, calories, carbsG, context, week }),
    };
  });

  return { days: shaped, refeedDate };
}

/** How the day's energy splits across meals. Slots only — no food. */
function distributeMeals(calories, proteinG, mealCount) {
  const shape = MEAL_DISTRIBUTION[mealCount] ?? MEAL_DISTRIBUTION[4];

  return shape.map((meal) => ({
    slot: meal.slot,
    share: meal.share,
    calories: round(calories * meal.share, 0),
    proteinG: round(proteinG * meal.share, 0),
  }));
}

function dayNotes(day, { isRefeed }) {
  if (isRefeed) return 'Refeed day — the extra energy comes from carbohydrate, not from fat.';
  if (day.isTrainingDay && day.isRunningDay) return 'Lifting and running on the same day: the largest carbohydrate day of the week.';
  if (day.isRestDay) return 'Rest day — protein holds, carbohydrate comes down.';
  return null;
}

function dayReason(day, { isRefeed, calories, carbsG, context, week }) {
  const scope = 'day';

  if (isRefeed) {
    return makeReason(
      { id: 'nutrition-day.refeed', name: 'Refeed day', scope },
      `${calories} kcal — up at maintenance for one day, on the heaviest training day of the week. Carbohydrate carries the increase, which is what makes the next few sessions feel better.`,
      { date: day.date }
    );
  }

  if (day.isRestDay) {
    return makeReason(
      { id: 'nutrition-day.rest', name: 'Rest day', scope },
      `${calories} kcal, about ${Math.round(CALORIE_CYCLING.REST_DAY_DELTA * 100)}% under the weekly average, with ${carbsG} g of carbohydrate. Nothing is being fuelled today, and protein stays where it is because recovery does not stop.`,
      { date: day.date }
    );
  }

  const parts = [];
  if (day.gym) parts.push(`${day.gym.sets} sets of lifting`);
  if (day.run) parts.push(`${day.run.distanceKm} km of running`);

  return makeReason(
    { id: 'nutrition-day.training', name: 'Training day', scope },
    `${calories} kcal with ${carbsG} g of carbohydrate — ${parts.join(' and ')} today, and the extra energy over a rest day is what fuels it.`,
    { date: day.date }
  );
}

/* ── The engine ─────────────────────────────────────────────────────────── */

export const DEFAULT_NUTRITION_BUILDER = defineFormula({
  id: 'rule-based-nutrition-engine',
  name: 'Rule-based nutrition engine',
  source: 'Protein and diet composition after the International Society of Sports Nutrition position stands: Jäger R, et al. J Int Soc Sports Nutr. 2017;14:20, and Aragon AA, et al. 2017;14:16. Fibre from the Institute of Medicine reference intake of 14 g per 1000 kcal. Energy and the trend correction come from the energy and adjustment engines, which carry their own citations. Refeed and diet-break cadence are coaching conventions rather than findings.',
  accuracy: 'estimate',
  useWhen: 'Setting daily and weekly intake targets from a profile, a training week and what the scale has actually done.',
  caveat: 'Every number here is a starting point corrected by measurement, not a prescription. It is not medical or dietetic advice, it does not know about any medical condition, medication, allergy or eating disorder, and the steeper deficits in particular are worth discussing with a doctor or a dietitian before running.',

  compute(context, ruleSets = NUTRITION_RULE_SETS) {
    const reasons = [];
    const notes = [];

    let week = { previousCalories: context.previousCalories ?? null };

    /* Order matters: whether the week is a break decides the calories. */
    for (const stage of ['dietBreak', 'refeed', 'calorie', 'macro', 'recovery', 'goal', 'hydration', 'safety']) {
      const applied = applyAll(ruleSets[stage], context, week);
      week = applied.draft;
      reasons.push(...applied.reasons);
    }

    const { days, refeedDate } = shapeDays(context, week);

    if (week.calories === null) {
      notes.push('No targets could be calculated — complete the profile and they will appear.');
    }
    if (week.safetyFloorHit) {
      notes.push('A safety floor was applied this week. The target you would otherwise have been given was lower than is sensible to eat.');
    }
    if (context.weightTrend.readings < 3) {
      notes.push('Targets are not yet corrected against the scale — that starts after three weigh-ins in the recent window.');
    }

    const dailyCalories = days.length
      ? round(sum(days.map((day) => day.calories)) / days.length, 0)
      : week.calories;

    return {
      weekNumber: context.weekNumber,
      goal: context.goal,
      startDate: context.weekStart,
      endDate: context.weekEnd,

      dailyCalories,
      weeklyCalories: days.length ? round(sum(days.map((day) => day.calories)), 0) : null,

      proteinTargetG: week.proteinG ?? null,
      carbTargetG: week.carbsG ?? null,
      fatTargetG: week.fatG ?? null,
      fibreTargetG: week.fibreG ?? null,
      waterTargetL: days.length ? round(sum(days.map((day) => day.waterL)) / days.length, 2) : null,
      sodiumMg: week.sodiumMg ?? null,

      expectedWeightTrend: {
        kgPerWeek: week.expectedRateKgPerWeek ?? 0,
        observedKgPerWeek: context.weightTrend.ratePerWeek,
        status: context.weightTrend.status,
        warning: week.rateWarning ?? null,
      },

      recoverySupport: {
        level: week.recoverySupport ?? 'none-needed',
        strainIndex: context.recovery.strainIndex,
        score: context.recovery.score,
      },

      adjustment: {
        action: week.adjustmentAction ?? 'hold',
        deltaKcal: week.adjustedBy ?? 0,
        postponed: Boolean(week.postponed),
        source: 'adjustment-engine',
      },

      refeed: { active: Boolean(week.refeed), date: refeedDate, reason: week.refeedReason ?? null },
      dietBreak: { active: Boolean(week.dietBreak), reason: week.dietBreakReason ?? null },
      safety: {
        floorHit: Boolean(week.safetyFloorHit),
        ceilingHit: Boolean(week.safetyCeilingHit),
        aggressiveCut: Boolean(week.aggressiveCut),
      },

      days,
      notes,
      reasons,

      meta: {
        generatedAt: new Date().toISOString(),
        engineVersion: NUTRITION_ENGINE_VERSION,
        engineId: 'rule-based-nutrition-engine',
        bmr: context.energy.bmr,
        tdee: context.energy.tdee,
        mealsPerDay: context.mealCount,
      },
    };
  },
});

export const nutritionSlot = createSlot('nutrition-engine', DEFAULT_NUTRITION_BUILDER);

export const NutritionEngine = Object.freeze({
  /**
   * Build a week of nutrition targets.
   * @param {object} input see createNutritionContext
   * @returns {object} NutritionWeek
   */
  build(input, { ruleSets = NUTRITION_RULE_SETS } = {}) {
    return this.buildFromContext(createNutritionContext(input), { ruleSets });
  },

  buildFromContext(context, { ruleSets = NUTRITION_RULE_SETS } = {}) {
    const week = nutritionSlot.current.compute(context, ruleSets);
    week.meta.formula = nutritionSlot.current.describe();
    return week;
  },

  /** Every reason in a week, flattened — for a report or a coaching layer. */
  allReasons(nutritionWeek) {
    return [
      ...nutritionWeek.reasons,
      ...nutritionWeek.days.map((day) => day.reason).filter(Boolean),
    ];
  },

  formulas() { return { nutrition: nutritionSlot.current.describe() }; },
});

export { createNutritionContext, NUTRITION_GOAL };
