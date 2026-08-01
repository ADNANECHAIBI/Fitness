/**
 * nutrition-rules.js — the numbers attached to each day.
 *
 * These set targets only: calories, protein and water. No food, no meals, no
 * timing. Those belong to a nutrition engine that does not exist yet.
 *
 * Calorie cycling keeps the weekly average equal to the target from the energy
 * engine — training days take more, rest days less, and the week still sums to
 * what the goal asks for.
 */

import { defineRule } from './rule.js';
import { DAY_TYPE, CALORIE_CYCLING, HYDRATION, MACRO_PER_KG, UNITS } from '../engines/constants.js';

export const nutritionRules = [
  defineRule({
    id: 'nutrition.no-target-without-profile',
    name: 'No targets without a profile',
    scope: 'nutrition',
    priority: 100,
    when: (context) => context.targets === null,
    apply: () => ({
      patch: { caloriesPerDay: null, proteinG: null },
      message: `No calorie or protein targets this week: the profile is missing the numbers they are calculated from.`,
    }),
  }),

  defineRule({
    id: 'nutrition.cycle-around-training',
    name: 'Calories cycled around training',
    scope: 'nutrition',
    priority: 90,
    when: (context) => context.targets !== null,
    apply: (context, draft) => {
      const dailyTarget = context.targets.calories;
      const weeklyTotal = dailyTarget * UNITS.DAYS_PER_WEEK;

      const restDays = draft.restDayCount ?? 0;
      const trainingDays = UNITS.DAYS_PER_WEEK - restDays;

      const restDayCalories = Math.round(dailyTarget * (1 - CALORIE_CYCLING.REST_DAY_DELTA));

      // Whatever the rest days give up is handed to the training days, so the
      // weekly total still matches the target exactly.
      const trainingDayCalories = trainingDays > 0
        ? Math.round((weeklyTotal - restDayCalories * restDays) / trainingDays)
        : restDayCalories;

      const floor = Math.round(dailyTarget * (1 - CALORIE_CYCLING.MAX_DAY_DEVIATION));
      const ceiling = Math.round(dailyTarget * (1 + CALORIE_CYCLING.MAX_DAY_DEVIATION));

      return {
        patch: {
          caloriesPerDay: {
            training: Math.min(Math.max(trainingDayCalories, floor), ceiling),
            rest: Math.min(Math.max(restDayCalories, floor), ceiling),
            average: dailyTarget,
          },
        },
        message: restDays > 0
          ? `Calories are cycled: about ${trainingDayCalories} kcal on training days and ${restDayCalories} on the ${restDays} rest day${restDays === 1 ? '' : 's'}. The week still averages ${dailyTarget} kcal, which is what the goal asks for.`
          : `Every day is a training day this week, so all of them sit at ${dailyTarget} kcal.`,
      };
    },
  }),

  defineRule({
    id: 'nutrition.protein-from-body-weight',
    name: 'Protein from body weight',
    scope: 'nutrition',
    priority: 80,
    when: (context) => context.targets !== null && context.profile?.weightKg > 0,
    apply: (context) => ({
      patch: { proteinG: context.targets.proteinG },
      message: `Protein stays flat at ${context.targets.proteinG} g every day — about ${context.goal === 'cut' ? MACRO_PER_KG.PROTEIN_CUT : MACRO_PER_KG.PROTEIN_DEFAULT} g per kg of body weight. It does not cycle with training, because the repair it feeds does not stop on rest days.`,
    }),
  }),

  defineRule({
    id: 'nutrition.water-from-weight-and-training',
    name: 'Water from body weight and training time',
    scope: 'nutrition',
    priority: 70,
    when: (context) => context.profile?.weightKg > 0,
    apply: (context) => {
      const baseline = context.profile.weightKg * HYDRATION.L_PER_KG;
      return {
        patch: { waterBaselineL: Number(baseline.toFixed(2)) },
        message: `Water starts at ${baseline.toFixed(1)} L a day from body weight, with another ${HYDRATION.L_PER_TRAINING_HOUR} L per hour of training added on top.`,
      };
    },
  }),
];

/**
 * Water for one day. Kept as a function rather than a rule because it depends
 * on that day's session length, which only exists once days are laid out.
 *
 * @returns {number} litres
 */
export function waterForDay({ baselineL, durationMin, type }) {
  const trainingHours = type === DAY_TYPE.REST ? 0 : (durationMin ?? 0) / UNITS.MINUTES_PER_HOUR;
  const total = (baselineL ?? HYDRATION.MIN_L) + trainingHours * HYDRATION.L_PER_TRAINING_HOUR;
  return Number(Math.min(Math.max(total, HYDRATION.MIN_L), HYDRATION.MAX_L).toFixed(2));
}
