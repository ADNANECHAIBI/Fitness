/**
 * Nutrition — one record per day, not per meal. `meals` counts how many were
 * eaten; the meals themselves belong to a later phase.
 */

import { defineSchema, rules } from '../validators/index.js';
import { createModel, today } from './base-model.js';

export const NutritionSchema = defineSchema('Nutrition', {
  date:        { rule: rules.isoDate(), required: true, default: today, label: 'Date' },
  calories:    { rule: rules.number({ min: 0, max: 12000, integer: true }), label: 'Calories', unit: 'kcal' },
  proteinG:    { rule: rules.number({ min: 0, max: 600 }), label: 'Protein', unit: 'g' },
  carbsG:      { rule: rules.number({ min: 0, max: 1500 }), label: 'Carbs', unit: 'g' },
  fatG:        { rule: rules.number({ min: 0, max: 500 }), label: 'Fat', unit: 'g' },
  meals:       { rule: rules.number({ min: 0, max: 12, integer: true }), default: 0, label: 'Meals' },
  waterL:      { rule: rules.number({ min: 0, max: 15, unit: 'L' }), label: 'Water', unit: 'L' },
  creatineG:   { rule: rules.number({ min: 0, max: 30 }), label: 'Creatine', unit: 'g' },
  notes:       { rule: rules.string({ max: 400 }), label: 'Notes' },
});

export const Nutrition = createModel(NutritionSchema, { idPrefix: 'nut' });
