/**
 * exercise-selection.js — turning a movement slot into an exercise.
 *
 * Nothing here names an exercise. The rules build the criteria; the database
 * answers; the ranking picks. That is what lets a record be edited and the
 * programme change with it.
 *
 * Two stages:
 *   1. criteriaRules — build the query for one slot (rules stack)
 *   2. rankCandidates — score what came back and take the top one
 */

import { defineRule } from '../rule.js';
import { CATEGORY } from '../../data/taxonomy.js';
import { WORKOUT } from '../../engines/constants.js';

/* ── Stage 1: what to ask the database for ──────────────────────────────── */

export const criteriaRules = [
  defineRule({
    id: 'selection.slot-pattern',
    name: 'Ask for the slot\'s movement pattern',
    scope: 'slot',
    priority: 100,
    when: (context) => Boolean(context.slot),
    apply: (context) => ({
      patch: { movement: context.slot.movement, type: 'strength' },
      message: `Looking for a ${String(context.slot.movement).replace(/_/g, ' ')} movement.`,
    }),
  }),

  defineRule({
    id: 'selection.slot-muscles',
    name: 'Aim the slot at its muscles',
    scope: 'slot',
    priority: 95,
    when: (context) => (context.slot.muscles?.length ?? 0) > 0,
    apply: (context) => ({
      patch: { primaryMuscles: context.slot.muscles },
      message: `Aimed at ${context.slot.muscles.join(' and ')} — an isolation slot without a target picks the same exercise every day of the week.`,
    }),
  }),

  defineRule({
    id: 'selection.compound-first',
    name: 'Compounds lead the session',
    scope: 'slot',
    priority: 90,
    when: (context) => context.slot.position === 0 || context.slot.position === 1,
    apply: () => ({
      patch: { category: CATEGORY.COMPOUND },
      message: `A compound movement, because the first exercises of a session are where you are freshest and they train the most muscle for the time spent.`,
    }),
  }),

  defineRule({
    id: 'selection.isolation-later',
    name: 'Isolation fills the tail',
    scope: 'slot',
    priority: 85,
    when: (context) => context.slot.movement === 'isolation',
    apply: () => ({
      patch: { category: [CATEGORY.ISOLATION, CATEGORY.ACCESSORY] },
      message: `An isolation exercise, placed late so it does not cost anything on the main lifts.`,
    }),
  }),

  defineRule({
    id: 'selection.difficulty-cap',
    name: 'Cap difficulty at the training level',
    scope: 'slot',
    priority: 80,
    when: (context) => Boolean(context.level),
    apply: (context) => ({
      patch: { maxDifficulty: context.level },
      message: `Limited to ${context.level} exercises or easier — a movement you cannot yet perform well is not a training stimulus, it is a rehearsal for an injury.`,
    }),
  }),

  defineRule({
    id: 'selection.equipment',
    name: 'Only what can be performed',
    scope: 'slot',
    priority: 75,
    when: (context, draft) => Array.isArray(context.week.equipment),
    apply: (context) => ({
      patch: { equipment: context.week.equipment },
      message: `Restricted to what your equipment allows.`,
    }),
  }),

  defineRule({
    id: 'selection.exclude-blocked',
    name: 'Leave out anything excluded',
    scope: 'slot',
    priority: 70,
    when: (context) =>
      (context.week.blockedExercises?.length ?? 0) > 0 || context.usedIds.length > 0,
    apply: (context, draft) => ({
      patch: {
        exclude: [...new Set([...(draft.exclude ?? []), ...(context.week.blockedExercises ?? []), ...context.usedIds])],
      },
      message: `Excluding what is already in this session and anything you have ruled out.`,
    }),
  }),
];

/* ── Stage 2: choosing among what came back ─────────────────────────────── */

/**
 * Score a candidate. Higher wins. Every component is explained by
 * `explainChoice` below, so the reason a record was picked is reconstructible.
 *
 * @param {object} candidate
 * @param {object} options
 * @returns {{score: number, parts: object}}
 */
export function scoreCandidate(candidate, {
  recentIds = [], correctiveTags = [], pullBias = false, level = 'beginner',
  preferContinuity = false,
} = {}) {
  const parts = {};

  const recentIndex = recentIds.indexOf(candidate.id);
  const trainedRecently = recentIndex !== -1;

  /*
   * Rotation cuts both ways, and which way depends on the slot.
   *
   * Main compounds want CONTINUITY: progressive overload is measured against
   * the same lift week to week, so rotating the squat away every few weeks
   * throws away the only record of whether it is going up.
   *
   * Accessories want VARIATION: they exist to cover what the compounds miss,
   * and swapping them keeps the work from going stale without costing any
   * progression signal.
   */
  parts.rotation = preferContinuity
    ? (trainedRecently ? 30 : 10)
    : (trainedRecently ? Math.max(0, 10 - (recentIds.length - recentIndex)) : 30);

  // A compound trains more for the same minute.
  parts.category = candidate.category === CATEGORY.COMPOUND ? 12 : 0;

  // Matching a stated corrective need is worth more than a generic choice.
  parts.corrective = candidate.tags.some((tag) => correctiveTags.includes(tag)) ? 18 : 0;

  // Rounded shoulders: prefer exercises tagged for posture on pulling slots.
  parts.posture = pullBias && candidate.tags.includes('posture') ? 8 : 0;

  // Prefer the difficulty that matches the level rather than always the easiest.
  parts.difficulty = candidate.difficulty === level ? 6 : 0;

  // A staple movement is a safer default than an unusual one.
  parts.staple = candidate.tags.includes('staple') ? 5 : 0;

  const score = Object.values(parts).reduce((total, value) => total + value, 0);
  return { score, parts };
}

/**
 * Rank candidates and return them best-first, deterministically.
 * Ties break on id so the same inputs always give the same programme.
 */
export function rankCandidates(candidates, options = {}) {
  return candidates
    .map((candidate) => ({ candidate, ...scoreCandidate(candidate, options) }))
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));
}

/**
 * A sentence explaining why this record won, built from the score parts.
 * @returns {string}
 */
export function explainChoice(record, parts, { slotMovement, alternativesCount, preferContinuity = false }) {
  const reasons = [];

  if (parts.corrective > 0) reasons.push('it also serves a corrective need you listed');

  if (preferContinuity) {
    reasons.push(parts.rotation >= 30
      ? 'you have been training it, so the load has somewhere to progress from'
      : 'it becomes the lift this slot is measured by');
  } else {
    reasons.push(parts.rotation >= 30
      ? 'you have not trained it in the last few weeks'
      : 'it fits the rotation');
  }
  if (parts.category > 0) reasons.push('it is a compound, so it earns its place early in the session');
  if (parts.posture > 0) reasons.push('it biases the shoulder blades backward');

  const pattern = String(slotMovement).replace(/_/g, ' ');
  return `${record.name} fills the ${pattern} slot: ${reasons.join(', ')}. ` +
    `${alternativesCount} other exercise${alternativesCount === 1 ? '' : 's'} could have taken it.`;
}

/** How many working sets an exercise gets, before time trimming. */
export function setsFor(record, weekDraft) {
  const table = weekDraft.setsPerExercise ?? WORKOUT.SETS_PER_EXERCISE;
  return table[record.category] ?? table.accessory ?? 3;
}
