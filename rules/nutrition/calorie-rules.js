/**
 * calorie-rules.js — the week's calorie target.
 *
 * The baseline comes from the energy engine; these rules move it. The
 * weight-trend decision is not re-derived here — the adjustment engine
 * already made it, with its evidence, and this file applies it.
 */

import { defineRule } from '../rule.js';
import { round } from '../../engines/calculation-engine.js';
import { NUTRITION_SAFETY, DIET_BREAK, REFEED } from '../../engines/constants.js';

export const calorieRules = [
  defineRule({
    id: 'calories.baseline',
    name: 'Baseline from the energy engine',
    scope: 'week',
    priority: 100,
    when: (context) => context.energy.baseTarget !== null,
    apply: (context) => ({
      patch: {
        calories: context.energy.baseTarget.calories,
        tdee: context.energy.tdee,
        source: 'energy-engine',
      },
      message: `Starting at ${context.energy.baseTarget.calories} kcal a day — maintenance of ${context.energy.tdee} kcal, adjusted for a ${context.goal.replace(/_/g, ' ')} goal.`,
    }),
  }),

  defineRule({
    id: 'calories.no-profile',
    name: 'Nothing to calculate from',
    scope: 'week',
    priority: 99,
    when: (context) => context.energy.baseTarget === null,
    apply: () => ({
      patch: { calories: null, tdee: null, source: 'none' },
      message: `No calorie target: the profile is missing the height, weight, age or sex the calculation needs.`,
    }),
  }),

  defineRule({
    id: 'calories.apply-trend-adjustment',
    name: 'Correct against what the scale did',
    scope: 'week',
    priority: 90,
    when: (context, draft) =>
      draft.calories !== null &&
      (context.adjustment.action === 'increase' || context.adjustment.action === 'decrease'),
    apply: (context) => ({
      patch: {
        calories: context.adjustment.newTargetKcal,
        adjustedBy: context.adjustment.deltaKcal,
        adjustmentAction: context.adjustment.action,
      },
      // The adjustment engine already explained itself; repeating its reasoning
      // here would be two places to change when the policy changes.
      message: context.adjustment.reason,
    }),
  }),

  defineRule({
    id: 'calories.hold-on-thin-evidence',
    name: 'Hold when the scale cannot say',
    scope: 'week',
    priority: 85,
    when: (context, draft) =>
      draft.calories !== null && context.adjustment.action === 'insufficient-data',
    apply: (context) => ({
      patch: { adjustedBy: 0, adjustmentAction: 'hold' },
      message: `Calories stay where they are. ${context.adjustment.reason.replace(/^[A-Z]/, (c) => c.toLowerCase())}`,
    }),
  }),

  defineRule({
    id: 'calories.diet-break',
    name: 'Diet break sets calories to maintenance',
    scope: 'week',
    priority: 80,
    when: (context, draft) => draft.dietBreak === true && draft.calories !== null,
    apply: (context, draft) => ({
      patch: { calories: round(context.energy.tdee * DIET_BREAK.CALORIE_SHARE_OF_TDEE, 0) },
      message: `Calories go up to maintenance, ${round(context.energy.tdee, 0)} kcal, for the whole week. A diet break is not a cheat week — it is a planned return to maintenance so hormones, training quality and appetite can recover before the deficit resumes.`,
    }),
  }),

  defineRule({
    id: 'calories.deload-easing',
    name: 'Ease the deficit in a deload week',
    scope: 'week',
    priority: 70,
    when: (context, draft) =>
      context.deload && context.inDeficit && draft.calories !== null && !draft.dietBreak,
    apply: (context, draft) => {
      const eased = round(draft.calories + (context.energy.tdee - draft.calories) * 0.4, 0);
      return {
        patch: { calories: eased },
        message: `The deficit is eased to ${eased} kcal for the deload. Cutting hard through the week meant for recovery is the fastest way to lose muscle rather than fat.`,
      };
    },
  }),

  defineRule({
    id: 'calories.low-recovery-holds-cuts',
    name: 'Low recovery postpones a cut',
    scope: 'week',
    priority: 75,
    when: (context, draft) =>
      context.recovery.isLow && draft.adjustmentAction === 'decrease' && draft.calories !== null,
    apply: (context, draft) => ({
      patch: { calories: draft.calories - (draft.adjustedBy ?? 0), adjustmentAction: 'hold', postponed: true },
      message: `The planned calorie reduction is postponed. You rated recovery ${context.recovery.score} out of 10, and cutting further on top of that costs training quality before it costs fat.`,
    }),
  }),
];
