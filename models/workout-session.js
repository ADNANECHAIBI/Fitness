/**
 * WorkoutSession — what actually happened, as opposed to what was planned.
 *
 * One record per attempted session. It is written the moment a session starts,
 * not when it ends: a session abandoned halfway is still data, and losing it
 * would be losing the most useful kind.
 */

import { defineSchema, rules } from '../validators/index.js';
import { createModel, today } from './base-model.js';
import { SESSION_STATE, EXERCISE_STATUS, EXECUTION } from '../engines/constants.js';
import { VERDICT } from '../rules/execution/completion-rules.js';
import { RECORD_TYPE } from '../rules/execution/pr-rules.js';

/** One logged set inside an exercise. */
const setRule = rules.object({
  index: rules.number({ min: 1, max: 50, integer: true }),
  reps: rules.number({ min: 0, max: 200, integer: true }),
  weightKg: rules.number({ min: 0, max: 500 }),
  rpe: rules.number({ min: 1, max: 10 }),
  restSec: rules.number({ min: 0, max: EXECUTION.MAX_REST_SEC, integer: true }),
  completed: rules.boolean(),
  failed: rules.boolean(),
  at: rules.string({ max: 40 }),
});

/** One exercise inside a session: the plan alongside what was done. */
const exerciseRule = rules.object({
  exerciseId: rules.string({ max: 60 }),
  name: rules.string({ max: 80 }),

  plannedSets: rules.number({ min: 0, max: 50, integer: true }),
  plannedReps: rules.number({ min: 0, max: 200, integer: true }),
  plannedWeightKg: rules.number({ min: 0, max: 500 }),
  plannedRpe: rules.number({ min: 1, max: 10 }),
  plannedRestSec: rules.number({ min: 0, max: EXECUTION.MAX_REST_SEC, integer: true }),

  completedSets: rules.number({ min: 0, max: 50, integer: true }),
  completedReps: rules.number({ min: 0, max: 2000, integer: true }),
  actualWeightKg: rules.number({ min: 0, max: 500 }),
  actualRpe: rules.number({ min: 1, max: 10 }),
  actualRestSec: rules.number({ min: 0, max: EXECUTION.MAX_REST_SEC }),

  status: rules.oneOf(Object.values(EXERCISE_STATUS)),
  sets: rules.list(setRule, { max: 50 }),
  notes: rules.string({ max: 400 }),

  /* Written by the execution engine when the session closes. A schema drops
     keys it does not declare, so anything the engine produces has to be
     declared here or it is lost on the round-trip through storage. */
  corrective: rules.boolean(),
  muscle: rules.string({ max: 40 }),
  progressionEligible: rules.boolean(),
  lateFatigue: rules.boolean(),
});

/** One reason, as produced by the rules engine. */
const reasonRule = rules.object({
  ruleId: rules.string({ max: 80 }),
  rule: rules.string({ max: 80 }),
  scope: rules.string({ max: 20 }),
  message: rules.string({ max: 600 }),
  exerciseId: rules.string({ max: 60 }),
});

/** One detected record. */
const recordRule = rules.object({
  type: rules.oneOf(Object.values(RECORD_TYPE)),
  exerciseId: rules.string({ max: 60 }),
  value: rules.number({ min: 0, max: 100000 }),
  previous: rules.number({ min: 0, max: 100000 }),
  unit: rules.string({ max: 10 }),
  estimated: rules.boolean(),
  date: rules.isoDate(),
});

export const WorkoutSessionSchema = defineSchema('WorkoutSession', {
  date: { rule: rules.isoDate(), required: true, default: today, label: 'Date' },
  weekNumber: { rule: rules.number({ min: 1, max: 500, integer: true }), label: 'Week' },
  goal: { rule: rules.string({ max: 60 }), label: 'Goal' },

  state: { rule: rules.oneOf(Object.values(SESSION_STATE)), default: SESSION_STATE.PLANNED, label: 'State' },

  startedAt: { rule: rules.string({ max: 40 }), label: 'Started' },
  endedAt: { rule: rules.string({ max: 40 }), label: 'Ended' },
  pausedSec: { rule: rules.number({ min: 0, max: 86400, integer: true }), default: 0, label: 'Paused for' },

  plannedDurationMin: { rule: rules.number({ min: 0, max: 600 }), label: 'Planned duration' },
  actualDurationMin: { rule: rules.number({ min: 0, max: 600 }), label: 'Actual duration' },

  completionPercent: { rule: rules.number({ min: 0, max: 100 }), default: 0, label: 'Completion' },

  /** Reported by the person, 1–10. Null until they say. */
  fatigue: { rule: rules.number({ min: EXECUTION.FATIGUE_MIN, max: EXECUTION.FATIGUE_MAX }), label: 'Fatigue' },

  exercises: { rule: rules.list(exerciseRule, { max: 20 }), default: () => [], label: 'Exercises' },

  notes: { rule: rules.string({ max: 1000 }), label: 'Notes' },

  /* ── The engine's verdict, kept so nothing has to be recomputed ────────── */

  verdict: { rule: rules.oneOf(Object.values(VERDICT)), label: 'Verdict' },

  /** Whether next week's progression may treat this as evidence of success. */
  progressable: { rule: rules.boolean(), default: false, label: 'Counts toward progression' },

  records: { rule: rules.list(recordRule, { max: 30 }), default: () => [], label: 'Records' },

  feedback: {
    rule: rules.object({
      verdict: rules.string({ max: 20 }),
      summary: rules.string({ max: 400 }),
      items: rules.list(rules.object({
        kind: rules.string({ max: 30 }),
        message: rules.string({ max: 600 }),
      }), { max: 30 }),
    }),
    label: 'Feedback',
  },

  reasons: { rule: rules.list(reasonRule, { max: 60 }), default: () => [], label: 'Reasons' },

  /** Kept only while a session is paused. */
  pausedAt: { rule: rules.string({ max: 40 }), label: 'Paused at' },
});

export const WorkoutSession = createModel(WorkoutSessionSchema, { idPrefix: 'session' });
