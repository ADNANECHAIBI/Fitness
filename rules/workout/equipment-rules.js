/**
 * equipment-rules.js — what can actually be performed.
 *
 * These shape the query criteria that exercise-selection.js sends to the
 * database. They never pick an exercise; they decide what is eligible.
 */

import { defineRule } from '../rule.js';
import { ASSUMED_EQUIPMENT } from '../../engines/workout-context.js';
import { EQUIPMENT } from '../../data/taxonomy.js';

export const equipmentRules = [
  defineRule({
    id: 'equipment.use-what-was-stated',
    name: 'Use the stated equipment',
    scope: 'week',
    priority: 100,
    when: (context) => !context.equipmentAssumed && context.equipment.length > 0,
    apply: (context) => ({
      patch: { equipment: context.equipment },
      message: `Exercises are limited to what you said you have: ${context.equipment.join(', ')}.`,
    }),
  }),

  defineRule({
    id: 'equipment.assume-a-standard-gym',
    name: 'Assume a standard gym',
    scope: 'week',
    priority: 90,
    when: (context) => context.equipmentAssumed,
    apply: () => ({
      patch: { equipment: [...ASSUMED_EQUIPMENT], equipmentAssumed: true },
      message: `No equipment list was set, so a standard gym is assumed — barbell, dumbbells, bench, machines, cables and a pull-up bar. Set your equipment in settings and the programme will change to match.`,
    }),
  }),

  defineRule({
    id: 'equipment.bodyweight-only',
    name: 'Bodyweight only',
    scope: 'week',
    priority: 80,
    when: (context) =>
      !context.equipmentAssumed &&
      context.equipment.every((item) => item === EQUIPMENT.NONE || item === EQUIPMENT.MAT),
    apply: () => ({
      patch: { bodyweightOnly: true },
      message: `Everything is bodyweight this week. Load progresses by adding reps, slowing the tempo and moving to harder variations rather than by adding weight.`,
    }),
  }),
];
