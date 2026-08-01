/**
 * Gym — one record per set of one exercise. Keeping the grain at set level
 * means volume, intensity and progression can all be derived later without
 * restructuring anything.
 */

import { defineSchema, rules } from '../validators/index.js';
import { createModel, today } from './base-model.js';
import { EXERCISE_STATUS } from '../engines/constants.js';
import { MUSCLE as TAXONOMY_MUSCLE } from '../data/taxonomy.js';

/**
 * Accepted muscle names.
 *
 * The exercise database uses a finer taxonomy than this model originally did —
 * `upper_back` and `lats` rather than `back`, `front_delts` rather than
 * `shoulders`. A set logged from a database exercise carries the finer name,
 * and until both lists agreed those sets failed validation silently and never
 * reached the progression rules.
 *
 * The original coarse names are kept so stored records stay valid.
 */
export const MUSCLES = [
  // Taxonomy names, as used by the exercise database.
  ...Object.values(TAXONOMY_MUSCLE),
  // Legacy names, kept for records written before the two lists were aligned.
  'back', 'shoulders', 'full_body',
];

export const GymSchema = defineSchema('Gym', {
  date:      { rule: rules.isoDate(), required: true, default: today, label: 'Date' },
  exercise:  { rule: rules.string({ min: 2, max: 80 }), required: true, label: 'Exercise' },
  muscle:    { rule: rules.oneOf(MUSCLES), required: true, label: 'Muscle', options: MUSCLES },
  sets:      { rule: rules.number({ min: 1, max: 30, integer: true }), required: true, label: 'Sets' },
  reps:      { rule: rules.number({ min: 1, max: 100, integer: true }), required: true, label: 'Reps' },
  weightKg:  { rule: rules.number({ min: 0, max: 500, unit: 'kg' }), default: 0, label: 'Weight', unit: 'kg' },
  tempo:     { rule: rules.string({ max: 12 }), label: 'Tempo' },          // e.g. "3-1-1-0"
  rpe:       { rule: rules.number({ min: 1, max: 10 }), label: 'RPE' },
  restSec:   { rule: rules.number({ min: 0, max: 900, integer: true }), default: 90, label: 'Rest', unit: 's' },
  /**
   * Whether the set was actually completed as prescribed. A failed set is
   * still logged — it is evidence — but progression must not read it as a
   * success, which is what this field exists to prevent.
   */
  status:    { rule: rules.oneOf(Object.values(EXERCISE_STATUS)), default: EXERCISE_STATUS.COMPLETED, label: 'Status' },
  sessionId: { rule: rules.string({ max: 60 }), label: 'Session' },
  notes:     { rule: rules.string({ max: 400 }), label: 'Notes' },
});

export const Gym = createModel(GymSchema, { idPrefix: 'set' });
