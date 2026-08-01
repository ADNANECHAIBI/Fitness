/**
 * PlanSnapshot — a record that a week was generated, and what it asked for.
 *
 * The engines derive their weeks on demand and are cached rather than stored,
 * so without this there would be no record that a week ever existed. Reports
 * and the deficit counter both read it.
 *
 * It stores summary numbers only. Regenerating the full week is the engines'
 * job, and they will produce the same answer from the same inputs.
 */

import { defineSchema, rules } from '../validators/index.js';
import { createModel, today } from './base-model.js';

export const PlanSnapshotSchema = defineSchema('PlanSnapshot', {
  weekStart: { rule: rules.isoDate(), required: true, default: today, label: 'Week starting' },
  weekNumber: { rule: rules.number({ min: 1, max: 1000, integer: true }), label: 'Week' },
  phase: { rule: rules.string({ max: 30 }), label: 'Phase' },
  goal: { rule: rules.string({ max: 30 }), label: 'Goal' },
  deload: { rule: rules.boolean(), default: false, label: 'Deload' },

  gymDays: { rule: rules.number({ min: 0, max: 7, integer: true }), label: 'Gym days' },
  runningDays: { rule: rules.number({ min: 0, max: 7, integer: true }), label: 'Running days' },
  weeklySets: { rule: rules.number({ min: 0, max: 1000, integer: true }), label: 'Weekly sets' },
  weeklyKm: { rule: rules.number({ min: 0, max: 1000 }), label: 'Weekly distance' },

  dailyCalories: { rule: rules.number({ min: 0, max: 12000, integer: true }), label: 'Daily calories' },
  proteinG: { rule: rules.number({ min: 0, max: 600, integer: true }), label: 'Protein' },
  mealCostMadPerDay: { rule: rules.number({ min: 0, max: 2000 }), label: 'Meal cost' },
  macroAccuracy: { rule: rules.number({ min: 0, max: 100 }), label: 'Macro accuracy' },

  /** True when the nutrition week ran a deficit — the diet-break counter reads it. */
  deficit: { rule: rules.boolean(), default: false, label: 'In deficit' },
});

export const PlanSnapshot = createModel(PlanSnapshotSchema, { idPrefix: 'plan' });
