/**
 * Goals — one record per target being chased. Progress is derived from the
 * relevant repository, never stored here, so it can never go stale.
 */

import { defineSchema, rules } from '../validators/index.js';
import { createModel, today } from './base-model.js';

export const METRIC = ['weight', 'distance', 'strength', 'measurement', 'habit'];
export const STATUS = ['active', 'reached', 'paused', 'abandoned'];

export const GoalsSchema = defineSchema('Goals', {
  metric:    { rule: rules.oneOf(METRIC), required: true, label: 'Metric', options: METRIC },
  label:     { rule: rules.string({ min: 2, max: 80 }), required: true, label: 'Label' },
  target:    { rule: rules.number({ min: 0, max: 100000 }), required: true, label: 'Target' },
  unit:      { rule: rules.string({ max: 12 }), default: 'kg', label: 'Unit' },
  startValue:{ rule: rules.number({ min: 0, max: 100000 }), label: 'Starting value' },
  startDate: { rule: rules.isoDate(), default: today, label: 'Start date' },
  dueDate:   { rule: rules.isoDate({ notAfter: '2100-12-31' }), label: 'Due date' },
  status:    { rule: rules.oneOf(STATUS), default: 'active', label: 'Status', options: STATUS },
});

export const Goals = createModel(GoalsSchema, { idPrefix: 'goal' });
