/**
 * injury-rules.js — what must be left out, and what replaces it.
 *
 * The engine never argues with a restriction. If a movement is out, it is out,
 * and something covering the same purpose takes its place.
 */

import { defineRule } from '../rule.js';

export const injuryRules = [
  defineRule({
    id: 'injury.restricted-movements',
    name: 'Restricted movement patterns',
    scope: 'week',
    priority: 100,
    when: (context) => context.restrictedMovements.length > 0,
    apply: (context) => ({
      patch: { blockedMovements: [...context.restrictedMovements] },
      message: `These movement patterns are excluded entirely: ${context.restrictedMovements.join(', ')}. Sessions that would have used them get a different pattern with a similar purpose.`,
    }),
  }),

  defineRule({
    id: 'injury.excluded-exercises',
    name: 'Excluded exercises',
    scope: 'week',
    priority: 95,
    when: (context) => context.excludedExercises.length > 0,
    apply: (context) => ({
      patch: { blockedExercises: [...context.excludedExercises] },
      message: `${context.excludedExercises.length} exercise${context.excludedExercises.length === 1 ? ' is' : 's are'} excluded by your settings. The database supplies alternatives for the same movement pattern.`,
    }),
  }),

  defineRule({
    id: 'injury.noted-but-unstructured',
    name: 'Injury noted in free text',
    scope: 'week',
    priority: 60,
    when: (context) =>
      context.injuries.trim().length > 0 &&
      context.restrictedMovements.length === 0 &&
      context.excludedExercises.length === 0,
    apply: () => ({
      patch: { injuryNoteOnly: true },
      message: `You have noted an injury, but nothing is set as a restricted movement, so nothing has been excluded. The engine cannot read free text — add the affected movement pattern or exercise to your settings and it will be left out.`,
    }),
  }),
];
