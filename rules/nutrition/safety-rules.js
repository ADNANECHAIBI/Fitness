/**
 * safety-rules.js — the floors nothing is allowed through.
 *
 * These run last, after every other rule has had its say, and they only ever
 * move numbers upward or shrink a change. If one of them fires, something
 * upstream asked for a target that should not be prescribed.
 */

import { defineRule } from '../rule.js';
import { round } from '../../engines/calculation-engine.js';
import { NUTRITION_SAFETY, UNITS } from '../../engines/constants.js';

export const safetyRules = [
  defineRule({
    id: 'safety.calorie-floor',
    name: 'Calories never go below resting metabolism',
    scope: 'safety',
    priority: 100,
    when: (context, draft) =>
      draft.calories !== null &&
      context.energy.bmr !== null &&
      draft.calories < context.energy.bmr * NUTRITION_SAFETY.MIN_CALORIES_AS_BMR_MULTIPLE,
    apply: (context, draft) => ({
      patch: { calories: round(context.energy.bmr, 0), safetyFloorHit: true },
      message: `Calories are raised to ${round(context.energy.bmr, 0)} kcal, your estimated resting metabolism. The target asked for ${draft.calories}, which is below what your body uses at rest — a deficit that steep costs muscle, sleep and training quality, and it is not something to run without medical supervision.`,
    }),
  }),

  defineRule({
    id: 'safety.deficit-cap',
    name: 'Cap how far below maintenance the target goes',
    scope: 'safety',
    priority: 95,
    when: (context, draft) => {
      if (draft.calories === null || !context.energy.tdee) return false;
      const floor = context.energy.tdee * (1 - NUTRITION_SAFETY.MAX_DEFICIT_FRACTION);
      return draft.calories < floor;
    },
    apply: (context, draft) => {
      const floor = round(context.energy.tdee * (1 - NUTRITION_SAFETY.MAX_DEFICIT_FRACTION), 0);
      return {
        patch: { calories: floor, safetyFloorHit: true },
        message: `Calories are held at ${floor} kcal — ${Math.round(NUTRITION_SAFETY.MAX_DEFICIT_FRACTION * 100)}% below maintenance, which is as far as this engine will go. Larger deficits lose more muscle per kilo of fat, and they are harder to hold for long enough to matter.`,
      };
    },
  }),

  defineRule({
    id: 'safety.surplus-cap',
    name: 'Cap the surplus',
    scope: 'safety',
    priority: 94,
    when: (context, draft) => {
      if (draft.calories === null || !context.energy.tdee) return false;
      return draft.calories > context.energy.tdee * (1 + NUTRITION_SAFETY.MAX_SURPLUS_FRACTION);
    },
    apply: (context, draft) => {
      const ceiling = round(context.energy.tdee * (1 + NUTRITION_SAFETY.MAX_SURPLUS_FRACTION), 0);
      return {
        patch: { calories: ceiling, safetyCeilingHit: true },
        message: `Calories are capped at ${ceiling} kcal. Beyond about ${Math.round(NUTRITION_SAFETY.MAX_SURPLUS_FRACTION * 100)}% over maintenance the extra goes to fat rather than muscle — the body can only build so fast.`,
      };
    },
  }),

  defineRule({
    id: 'safety.weekly-change-cap',
    name: 'No sudden week-on-week swings',
    scope: 'safety',
    priority: 90,
    when: (context, draft) =>
      draft.previousCalories &&
      draft.calories !== null &&
      Math.abs(draft.calories - draft.previousCalories) > NUTRITION_SAFETY.MAX_WEEKLY_KCAL_CHANGE,
    apply: (context, draft) => {
      const direction = draft.calories > draft.previousCalories ? 1 : -1;
      const capped = draft.previousCalories + direction * NUTRITION_SAFETY.MAX_WEEKLY_KCAL_CHANGE;

      return {
        patch: { calories: capped },
        message: `The change is limited to ${NUTRITION_SAFETY.MAX_WEEKLY_KCAL_CHANGE} kcal, landing at ${capped}. Moving further than that in one week makes it impossible to tell what caused the result.`,
      };
    },
  }),

  defineRule({
    id: 'safety.protein-floor',
    name: 'Protein floor',
    scope: 'safety',
    priority: 85,
    when: (context, draft) =>
      context.weightKg > 0 && draft.proteinG < context.weightKg * NUTRITION_SAFETY.MIN_PROTEIN_G_PER_KG,
    apply: (context, draft) => {
      const floor = round(context.weightKg * NUTRITION_SAFETY.MIN_PROTEIN_G_PER_KG, 0);
      return {
        patch: { proteinG: floor },
        message: `Protein is raised to ${floor} g — ${NUTRITION_SAFETY.MIN_PROTEIN_G_PER_KG} g per kg, the floor for anyone training. Below it, some of what you lose or fail to build is muscle.`,
      };
    },
  }),

  defineRule({
    id: 'safety.fat-floor',
    name: 'Fat floor',
    scope: 'safety',
    priority: 80,
    when: (context, draft) =>
      context.weightKg > 0 && draft.fatG < context.weightKg * NUTRITION_SAFETY.MIN_FAT_G_PER_KG,
    apply: (context, draft) => {
      const floor = round(context.weightKg * NUTRITION_SAFETY.MIN_FAT_G_PER_KG, 0);
      return {
        patch: { fatG: floor },
        message: `Fat is raised to ${floor} g — ${NUTRITION_SAFETY.MIN_FAT_G_PER_KG} g per kg. Going lower for long enough affects hormone production, and it is a poor trade for the handful of calories it saves.`,
      };
    },
  }),

  defineRule({
    id: 'safety.fat-energy-share',
    name: 'Fat as a share of energy',
    scope: 'safety',
    priority: 78,
    when: (context, draft) => {
      if (!draft.calories || !draft.fatG) return false;
      return (draft.fatG * UNITS.KCAL_PER_G_FAT) / draft.calories < NUTRITION_SAFETY.MIN_FAT_ENERGY_SHARE;
    },
    apply: (context, draft) => {
      const floor = round((draft.calories * NUTRITION_SAFETY.MIN_FAT_ENERGY_SHARE) / UNITS.KCAL_PER_G_FAT, 0);
      return {
        patch: { fatG: floor },
        message: `Fat is raised to ${floor} g so it makes up at least ${Math.round(NUTRITION_SAFETY.MIN_FAT_ENERGY_SHARE * 100)}% of the day's energy.`,
      };
    },
  }),

  defineRule({
    id: 'safety.recompute-carbs',
    name: 'Rebalance carbohydrate after any floor',
    scope: 'safety',
    priority: 10,
    when: (context, draft) => draft.calories !== null && draft.proteinG && draft.fatG,
    apply: (context, draft) => {
      const remaining = draft.calories
        - draft.proteinG * UNITS.KCAL_PER_G_PROTEIN
        - draft.fatG * UNITS.KCAL_PER_G_FAT;
      const grams = Math.max(0, round(remaining / UNITS.KCAL_PER_G_CARB, 0));

      return {
        patch: { carbsG: grams },
        message: grams === draft.carbsG
          ? `Macros balance to the calorie target.`
          : `Carbohydrate is rebalanced to ${grams} g after the protein and fat floors were applied — it is the macro with room to give.`,
      };
    },
  }),
];
