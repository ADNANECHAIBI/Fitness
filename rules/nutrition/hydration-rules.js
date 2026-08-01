/**
 * hydration-rules.js — fluid and sodium.
 *
 * Baseline from body weight, plus what the week's training is likely to cost.
 * Sweat rate varies enormously between people; these are starting points, and
 * thirst plus urine colour tell you more than any formula.
 */

import { defineRule } from '../rule.js';
import { round, clamp } from '../../engines/calculation-engine.js';
import { HYDRATION, HYDRATION_EXTRA, UNITS } from '../../engines/constants.js';

export const hydrationRules = [
  defineRule({
    id: 'hydration.baseline',
    name: 'Fluid from body weight',
    scope: 'week',
    priority: 100,
    when: (context) => context.weightKg > 0,
    apply: (context) => {
      const litres = round(context.weightKg * HYDRATION.L_PER_KG, 2);
      return {
        patch: { waterBaselineL: litres },
        message: `${litres} L a day before training — about ${HYDRATION.L_PER_KG * 1000} ml per kg of body weight.`,
      };
    },
  }),

  defineRule({
    id: 'hydration.training-and-running',
    name: 'More fluid for the training',
    scope: 'week',
    priority: 90,
    when: (context, draft) => draft.waterBaselineL > 0 && context.training.runningMinutes > 0,
    apply: (context) => ({
      patch: { runningHours: round(context.training.runningMinutes / UNITS.MINUTES_PER_HOUR, 2) },
      message: `Add roughly ${HYDRATION_EXTRA.L_PER_RUNNING_HOUR} L per hour of running and ${HYDRATION.L_PER_TRAINING_HOUR} L per hour of lifting, taken during and after the session rather than all at once.`,
    }),
  }),

  defineRule({
    id: 'hydration.heat',
    name: 'Heat raises the requirement',
    scope: 'week',
    priority: 85,
    when: (context) =>
      context.temperatureC !== null && context.temperatureC >= HYDRATION_EXTRA.HOT_WEATHER_C,
    apply: (context, draft) => ({
      patch: { waterBaselineL: round((draft.waterBaselineL ?? 0) + HYDRATION_EXTRA.HOT_WEATHER_EXTRA_L, 2), heat: true },
      message: `Another ${HYDRATION_EXTRA.HOT_WEATHER_EXTRA_L} L a day at ${context.temperatureC}°C. Sweat losses roughly double in heat, and the thirst signal lags behind them.`,
    }),
  }),

  defineRule({
    id: 'hydration.sodium',
    name: 'Sodium with sweat losses',
    scope: 'week',
    priority: 70,
    when: (context) => true,
    apply: (context, draft) => {
      const sweatL = round(
        (context.training.runningMinutes / UNITS.MINUTES_PER_HOUR) * HYDRATION_EXTRA.L_PER_RUNNING_HOUR +
        (context.training.gymMinutes / UNITS.MINUTES_PER_HOUR) * HYDRATION.L_PER_TRAINING_HOUR, 2);

      const weeklyExtra = sweatL * HYDRATION_EXTRA.SODIUM_MG_PER_L;
      const dailyExtra = round(weeklyExtra / UNITS.DAYS_PER_WEEK, 0);

      const total = round(clamp(
        HYDRATION_EXTRA.BASELINE_SODIUM_MG + dailyExtra,
        HYDRATION_EXTRA.BASELINE_SODIUM_MG,
        HYDRATION_EXTRA.MAX_SODIUM_MG
      ), 0);

      return {
        patch: { sodiumMg: total, sweatLitresPerWeek: sweatL },
        message: dailyExtra > 100
          ? `About ${total} mg of sodium a day — a baseline of ${HYDRATION_EXTRA.BASELINE_SODIUM_MG} mg plus roughly ${dailyExtra} mg to replace what this week's training sweats out. Sweat sodium varies several-fold between people; salt to taste and pay attention to cramping rather than treating this as exact.`
          : `About ${total} mg of sodium a day. This is guidance for an active person without high blood pressure — if you have been told to restrict salt, that instruction comes first.`,
      };
    },
  }),
];
