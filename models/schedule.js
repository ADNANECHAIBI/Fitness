/**
 * Schedule — when training happens. One record per planned slot, so a week
 * can hold several and the calendar can read them without interpretation.
 */

import { defineSchema, rules } from '../validators/index.js';
import { createModel } from './base-model.js';
import { WEEKDAYS } from './profile.js';

export const SESSION_TYPE = ['gym', 'running', 'rest', 'mobility'];

/** "HH:MM" on a 24-hour clock. */
const clockTime = () => (value) => {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return { ok: false, value: null, error: 'must be a time (HH:MM)' };
  }
  return { ok: true, value, error: null };
};

export const ScheduleSchema = defineSchema('Schedule', {
  day:       { rule: rules.oneOf(WEEKDAYS), required: true, label: 'Day', options: WEEKDAYS },
  type:      { rule: rules.oneOf(SESSION_TYPE), required: true, label: 'Type', options: SESSION_TYPE },
  startTime: { rule: clockTime(), default: '18:00', label: 'Start' },
  // 6 hours is a generous ceiling; it makes a 35-hour session impossible.
  durationMin: { rule: rules.minutes({ min: 5, max: 360 }), default: 90, label: 'Duration', unit: 'min' },
  active:    { rule: rules.boolean(), default: true, label: 'Active' },
});

export const Schedule = createModel(ScheduleSchema, { idPrefix: 'slot' });
