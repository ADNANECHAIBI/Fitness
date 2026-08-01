/**
 * Running — one record per run.
 * Pace is derived, never stored: a stored copy would drift from distance/time.
 */

import { defineSchema, rules } from '../validators/index.js';
import { createModel, today } from './base-model.js';

export const DIFFICULTY = ['easy', 'moderate', 'hard', 'max'];

export const RunningSchema = defineSchema('Running', {
  date:        { rule: rules.isoDate(), required: true, default: today, label: 'Date' },
  distanceKm:  { rule: rules.number({ min: 0.1, max: 300, unit: 'km' }), required: true, label: 'Distance', unit: 'km' },
  // A single run cannot last 35 hours; 12 hours covers an ultra.
  durationMin: { rule: rules.minutes({ min: 1, max: 720 }), required: true, label: 'Time', unit: 'min' },
  cadenceSpm:  { rule: rules.number({ min: 100, max: 260, integer: true }), label: 'Cadence', unit: 'spm' },
  heartRateBpm:{ rule: rules.number({ min: 30, max: 230, integer: true }), label: 'Heart rate', unit: 'bpm' },
  calories:    { rule: rules.number({ min: 0, max: 10000, integer: true }), label: 'Calories', unit: 'kcal' },
  difficulty:  { rule: rules.oneOf(DIFFICULTY), default: 'moderate', label: 'Difficulty', options: DIFFICULTY },
  notes:       { rule: rules.string({ max: 400 }), label: 'Notes' },
});

export const Running = createModel(RunningSchema, { idPrefix: 'run' });
