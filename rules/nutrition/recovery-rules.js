/**
 * recovery-rules.js — feeding recovery rather than fighting it.
 */

import { defineRule } from '../rule.js';
import { round } from '../../engines/calculation-engine.js';
import { STRAIN, UNITS } from '../../engines/constants.js';

export const nutritionRecoveryRules = [
  defineRule({
    id: 'nutrition-recovery.low-score-raises-carbs',
    name: 'Low recovery raises carbohydrate',
    scope: 'week',
    priority: 100,
    when: (context, draft) =>
      context.recovery.isLow && draft.calories !== null && draft.carbsG > 0,
    apply: (context, draft) => {
      const extra = round(draft.carbsG * 0.15, 0);
      return {
        patch: {
          carbsG: draft.carbsG + extra,
          calories: draft.calories + extra * UNITS.KCAL_PER_G_CARB,
          recoverySupport: 'carbs-raised',
        },
        message: `Carbohydrate goes up by ${extra} g and calories with it. You rated recovery ${context.recovery.score} out of ${STRAIN.RECOVERY_SCALE_MAX}, and carbohydrate is the macro that most directly restores what hard training empties.`,
      };
    },
  }),

  defineRule({
    id: 'nutrition-recovery.high-strain-support',
    name: 'High strain gets more fuel',
    scope: 'week',
    priority: 90,
    when: (context, draft) =>
      context.recovery.strainIndex >= 60 && draft.calories !== null && !context.inDeficit,
    apply: (context, draft) => ({
      patch: { recoverySupport: 'fuelled' },
      message: `Strain is at ${context.recovery.strainIndex} out of 100. Calories are not being cut this week whatever the scale says — underfeeding a hard week is how a hard week becomes an injured one.`,
    }),
  }),

  defineRule({
    id: 'nutrition-recovery.adequate',
    name: 'Recovery is fine',
    scope: 'week',
    priority: 10,
    when: (context, draft) => draft.recoverySupport === undefined,
    apply: () => ({
      patch: { recoverySupport: 'none-needed' },
      message: `Nothing in the recovery data calls for extra food this week.`,
    }),
  }),
];
