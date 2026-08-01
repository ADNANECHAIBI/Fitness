/**
 * macro-rules.js — protein, fat, carbohydrate and fibre.
 *
 * Protein and fat are set from body weight; carbohydrate takes whatever energy
 * is left, which is what makes it the macro that moves with training volume.
 */

import { defineRule } from '../rule.js';
import { round, clamp } from '../../engines/calculation-engine.js';
import { MACROS, NUTRITION_SAFETY, UNITS } from '../../engines/constants.js';

export const macroRules = [
  defineRule({
    id: 'macros.protein-from-body-weight',
    name: 'Protein from body weight',
    scope: 'week',
    priority: 100,
    when: (context, draft) => draft.calories !== null && context.weightKg > 0,
    apply: (context) => {
      const perKg = MACROS.PROTEIN_G_PER_KG[context.goal] ?? 1.8;
      const grams = round(context.weightKg * perKg, 0);

      return {
        patch: { proteinG: grams, proteinPerKg: perKg },
        message: `${grams} g of protein a day — ${perKg} g per kg. It does not change between training and rest days, because the repair it feeds does not stop on a rest day.`,
      };
    },
  }),

  defineRule({
    id: 'macros.protein-higher-in-a-deficit',
    name: 'More protein while cutting',
    scope: 'week',
    priority: 90,
    when: (context) => context.inDeficit,
    apply: (context, draft) => ({
      patch: { proteinG: draft.proteinG },
      message: `Protein sits at the high end because you are in a deficit. It is the single biggest lever for keeping muscle while losing weight, and it is also the most filling macro.`,
    }),
  }),

  defineRule({
    id: 'macros.fat-from-body-weight',
    name: 'Fat from body weight',
    scope: 'week',
    priority: 85,
    when: (context, draft) => draft.calories !== null && context.weightKg > 0,
    apply: (context) => {
      const perKg = MACROS.FAT_G_PER_KG[context.goal] ?? 0.9;
      const grams = round(context.weightKg * perKg, 0);

      return {
        patch: { fatG: grams, fatPerKg: perKg },
        message: `${grams} g of fat a day — ${perKg} g per kg, enough for hormone production and to absorb the fat-soluble vitamins.`,
      };
    },
  }),

  defineRule({
    id: 'macros.carbs-take-the-remainder',
    name: 'Carbohydrate fills what is left',
    scope: 'week',
    priority: 80,
    when: (context, draft) => draft.calories !== null && draft.proteinG && draft.fatG,
    apply: (context, draft) => {
      const remaining = draft.calories
        - draft.proteinG * UNITS.KCAL_PER_G_PROTEIN
        - draft.fatG * UNITS.KCAL_PER_G_FAT;

      const grams = Math.max(0, round(remaining / UNITS.KCAL_PER_G_CARB, 0));

      return {
        patch: { carbsG: grams },
        message: `${grams} g of carbohydrate — whatever energy is left once protein and fat are set. That is deliberate: carbohydrate is the macro that should move with training, and it is what fuels the hard sessions.`,
      };
    },
  }),

  defineRule({
    id: 'macros.carbs-scale-with-training',
    name: 'More carbohydrate on a heavy training week',
    scope: 'week',
    priority: 70,
    when: (context, draft) =>
      draft.carbsG > 0 && (context.training.runningKm > 20 || context.training.gymSets > 60),
    apply: (context, draft) => ({
      patch: { carbsG: draft.carbsG },
      message: `The week holds ${context.training.gymSets} working sets and ${context.training.runningKm} km of running. Carbohydrate is already carrying that load — if sessions start feeling flat, it is the first thing to raise.`,
    }),
  }),

  defineRule({
    id: 'macros.fibre-from-calories',
    name: 'Fibre from total energy',
    scope: 'week',
    priority: 60,
    when: (context, draft) => draft.calories !== null,
    apply: (context, draft) => {
      const grams = round(
        clamp(
          (draft.calories / 1000) * MACROS.FIBRE_G_PER_1000_KCAL,
          MACROS.FIBRE_MIN_G,
          MACROS.FIBRE_MAX_G
        ), 0);

      return {
        patch: { fibreG: grams },
        message: `${grams} g of fibre — about ${MACROS.FIBRE_G_PER_1000_KCAL} g per 1000 kcal. Raise it slowly if you are nowhere near it now; a sudden jump is uncomfortable.`,
      };
    },
  }),
];
