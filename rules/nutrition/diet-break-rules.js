/**
 * diet-break-rules.js — a planned week at maintenance.
 *
 * Longer and less frequent than a refeed. The case for it is adherence and
 * training quality over a long diet, more than any metabolic reset.
 */

import { defineRule } from '../rule.js';
import { DIET_BREAK } from '../../engines/constants.js';

export const dietBreakRules = [
  defineRule({
    id: 'diet-break.not-in-a-deficit',
    name: 'No break outside a deficit',
    scope: 'week',
    priority: 100,
    when: (context) => !context.inDeficit,
    apply: () => ({
      patch: { dietBreak: false },
      message: `No diet break — there is no deficit to take a break from.`,
    }),
  }),

  defineRule({
    id: 'diet-break.long-deficit',
    name: 'A long deficit earns a break',
    scope: 'week',
    priority: 90,
    when: (context) =>
      context.inDeficit && context.weeksInDeficit >= DIET_BREAK.AFTER_WEEKS,
    apply: (context) => ({
      patch: { dietBreak: true, dietBreakReason: 'duration' },
      message: `A diet break this week — ${context.weeksInDeficit} consecutive weeks in a deficit. A full week at maintenance, then the deficit resumes. Diets fail from accumulated fatigue and hunger far more often than from the wrong numbers.`,
    }),
  }),

  defineRule({
    id: 'diet-break.stalled-and-tired',
    name: 'Stalled and under-recovered',
    scope: 'week',
    priority: 85,
    when: (context) =>
      context.inDeficit &&
      context.recovery.isLow &&
      context.weightTrend.status === 'above-target' &&
      context.weeksInDeficit >= DIET_BREAK.STALL_WEEKS,
    apply: (context) => ({
      patch: { dietBreak: true, dietBreakReason: 'stall' },
      message: `A diet break this week. The scale has stalled and recovery is rated ${context.recovery.score} out of 10 after ${context.weeksInDeficit} weeks of dieting — cutting further into that rarely restarts anything, and a week at maintenance usually does.`,
    }),
  }),

  defineRule({
    id: 'diet-break.not-due',
    name: 'No break due',
    scope: 'week',
    priority: 10,
    when: (context, draft) => draft.dietBreak === undefined,
    apply: (context) => ({
      patch: { dietBreak: false },
      message: `No diet break — ${context.weeksInDeficit} weeks in, and one falls due at ${DIET_BREAK.AFTER_WEEKS} or sooner if progress and recovery both stall.`,
    }),
  }),
];
