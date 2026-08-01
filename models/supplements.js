/** Supplements — one record per supplement the athlete takes. */

import { defineSchema, rules } from '../validators/index.js';
import { createModel } from './base-model.js';

export const TIMING = ['morning', 'pre_workout', 'post_workout', 'evening', 'with_meal'];

export const SupplementsSchema = defineSchema('Supplements', {
  name:   { rule: rules.string({ min: 2, max: 60 }), required: true, label: 'Name' },
  doseG:  { rule: rules.number({ min: 0, max: 200 }), label: 'Dose', unit: 'g' },
  timing: { rule: rules.oneOf(TIMING), default: 'morning', label: 'Timing', options: TIMING },
  active: { rule: rules.boolean(), default: true, label: 'Active' },
  notes:  { rule: rules.string({ max: 300 }), label: 'Notes' },
});

export const Supplements = createModel(SupplementsSchema, { idPrefix: 'supp' });
