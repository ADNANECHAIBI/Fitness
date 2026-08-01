/**
 * WeeklyReport — one record per week.
 *
 * The summaries are stored as numbers computed at the time the week closed.
 * That is deliberate: a report is a snapshot of what happened, and must not
 * change later when old records are edited.
 */

import { defineSchema, rules } from '../validators/index.js';
import { createModel, today } from './base-model.js';

const summary = (shape) => rules.object(shape);

export const WeeklyReportSchema = defineSchema('WeeklyReport', {
  weekStart: { rule: rules.isoDate(), required: true, default: today, label: 'Week starting' },
  weightKg:  { rule: rules.number({ min: 25, max: 300, unit: 'kg' }), label: 'Weight', unit: 'kg' },

  // Photo references, not image data — storage holds ids, files come later.
  photos: { rule: rules.list(rules.string({ max: 120 }), { max: 12 }), default: () => [], label: 'Photos' },

  runningSummary: {
    rule: summary({
      runs: rules.number({ min: 0, max: 100, integer: true }),
      distanceKm: rules.number({ min: 0, max: 2000 }),
      durationMin: rules.number({ min: 0, max: 10080 }),
    }),
    default: () => ({}), label: 'Running summary',
  },
  gymSummary: {
    rule: summary({
      sessions: rules.number({ min: 0, max: 30, integer: true }),
      sets: rules.number({ min: 0, max: 1000, integer: true }),
      volumeKg: rules.number({ min: 0, max: 1000000 }),
    }),
    default: () => ({}), label: 'Gym summary',
  },
  nutritionSummary: {
    rule: summary({
      avgCalories: rules.number({ min: 0, max: 12000 }),
      avgProteinG: rules.number({ min: 0, max: 600 }),
      daysLogged: rules.number({ min: 0, max: 7, integer: true }),
    }),
    default: () => ({}), label: 'Nutrition summary',
  },

  recovery:      { rule: rules.number({ min: 1, max: 10, integer: true }), label: 'Recovery' },
  notes:         { rule: rules.string({ max: 1000 }), label: 'Notes' },
  coachFeedback: { rule: rules.string({ max: 1000 }), label: 'Coach feedback' },
});

export const WeeklyReport = createModel(WeeklyReportSchema, { idPrefix: 'week' });
