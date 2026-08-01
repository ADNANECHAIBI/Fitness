/**
 * recovery-rules.js — how hard the sessions may be run.
 *
 * The planner has already decided how many days and how much volume. These
 * rules decide the intensity inside them, and enforce spacing between hard
 * sessions for the same muscles.
 */

import { defineRule } from '../rule.js';
import { WORKOUT, STRAIN, PROGRESSION } from '../../engines/constants.js';
import { round } from '../../engines/calculation-engine.js';

export const workoutRecoveryRules = [
  defineRule({
    id: 'workout-recovery.deload-intensity',
    name: 'Deload caps effort',
    scope: 'week',
    priority: 100,
    when: (context) => context.deload,
    apply: (context, draft) => ({
      patch: {
        targetRpe: Math.min(draft.targetRpe ?? 8, 6),
        loadFactor: PROGRESSION.DELOAD_LOAD_FACTOR,
      },
      message: `Working sets stop at RPE 6 and loads come down to ${Math.round(PROGRESSION.DELOAD_LOAD_FACTOR * 100)}% of what you last used. The point of the week is to arrive at the next one fresher, not to hold on to numbers.`,
    }),
  }),

  defineRule({
    id: 'workout-recovery.high-strain-caps-effort',
    name: 'High strain caps effort',
    scope: 'week',
    priority: 90,
    when: (context, draft) =>
      !context.deload && context.recovery.strainIndex >= 60 && (draft.targetRpe ?? 8) > 7,
    apply: (context, draft) => ({
      patch: { targetRpe: 7 },
      message: `Effort is capped at RPE 7 rather than ${draft.targetRpe}. Strain is at ${context.recovery.strainIndex} out of 100, and training to near-failure on top of that buys fatigue rather than progress.`,
    }),
  }),

  defineRule({
    id: 'workout-recovery.low-score-caps-effort',
    name: 'Low self-reported recovery caps effort',
    scope: 'week',
    priority: 85,
    when: (context, draft) =>
      context.recovery.score !== null &&
      context.recovery.score <= STRAIN.LOW_RECOVERY_SCORE &&
      (draft.targetRpe ?? 8) > 7,
    apply: (context) => ({
      patch: { targetRpe: 7, loadFactor: 0.9 },
      message: `Effort is capped at RPE 7 and loads held at 90%. You rated recovery ${context.recovery.score} out of ${STRAIN.RECOVERY_SCALE_MAX}.`,
    }),
  }),

  defineRule({
    id: 'workout-recovery.spacing',
    name: 'Spacing between hard sessions for a muscle',
    scope: 'week',
    priority: 70,
    when: (context, draft) => (draft.dayTemplates?.length ?? 0) > 0 && context.gymDayCount > 1,
    apply: (context, draft) => ({
      patch: { minHoursBetweenRepeats: WORKOUT.MIN_HOURS_BETWEEN_HARD_SESSIONS },
      message: `Sessions rotate through ${draft.dayTemplates.length} template${draft.dayTemplates.length === 1 ? '' : 's'}, so the same muscles get at least ${WORKOUT.MIN_HOURS_BETWEEN_HARD_SESSIONS} hours before they are trained hard again.`,
    }),
  }),

  defineRule({
    id: 'workout-recovery.default-load-factor',
    name: 'Full load by default',
    scope: 'week',
    priority: 10,
    when: (context, draft) => draft.loadFactor === undefined,
    apply: () => ({
      patch: { loadFactor: 1 },
      message: `Loads run at full weight this week — nothing in your recovery data calls for holding back.`,
    }),
  }),
];
