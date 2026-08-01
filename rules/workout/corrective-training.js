/**
 * corrective-training.js — extra work bolted on without eating the session.
 *
 * Corrective exercises are appended at the end and capped in number, so the
 * session's main purpose is never diluted. If time runs out, this is the first
 * thing trimmed — and the trim is explained.
 */

import { defineRule } from '../rule.js';
import { WORKOUT } from '../../engines/constants.js';

export const correctiveRules = [
  defineRule({
    id: 'corrective.stated-needs',
    name: 'Corrective work for a stated need',
    scope: 'week',
    priority: 100,
    when: (context) => context.correctiveNeeds.length > 0,
    apply: (context) => ({
      patch: { correctiveTags: [...context.correctiveNeeds] },
      message: `Up to ${WORKOUT.MAX_CORRECTIVE_EXERCISES} corrective exercises are added to each session for: ${context.correctiveNeeds.join(', ')}. They go at the end, at low load, so they add to the session rather than take from it.`,
    }),
  }),

  defineRule({
    id: 'corrective.rounded-shoulders-needs-pulling',
    name: 'Rounded shoulders bias the pulling volume',
    scope: 'week',
    priority: 90,
    when: (context) => context.correctiveNeeds.includes('rounded-shoulders'),
    apply: () => ({
      patch: { pullBias: true },
      message: `Pulling volume is biased upward against pressing. Rounded shoulders respond to strengthening what holds the shoulder blades back far more than to stretching what feels tight — and pressing without matching pulling is what got most people there.`,
    }),
  }),

  defineRule({
    id: 'corrective.none-stated',
    name: 'No corrective work requested',
    scope: 'week',
    priority: 10,
    when: (context) => context.correctiveNeeds.length === 0,
    apply: () => ({
      patch: { correctiveTags: [] },
      message: `No corrective work is added — none is set in your settings.`,
    }),
  }),
];
