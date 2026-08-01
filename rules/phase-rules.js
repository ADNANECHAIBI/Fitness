/**
 * phase-rules.js — which training phase the week belongs to.
 *
 * Exactly one rule wins (selectOne), so these are ordered by priority: the
 * conditions that must override everything sit highest.
 *
 * Phases follow a standard block progression — accumulate, intensify, realise,
 * restore — as described in Issurin VB. New horizons for the methodology and
 * physiology of training periodization. Sports Med. 2010;40(3):189-206.
 * The week counts here are practice conventions, not findings from that paper.
 */

import { defineRule } from './rule.js';
import { PHASE, PLANNER } from '../engines/constants.js';

export const phaseRules = [
  defineRule({
    id: 'phase.deload-forced-by-strain',
    name: 'Recovery phase forced by strain',
    scope: 'phase',
    priority: 100,
    when: (context) => context.strain.index >= PLANNER.DELOAD_STRAIN_THRESHOLD,
    apply: (context) => ({
      patch: { phase: PHASE.RECOVERY, deload: true },
      message: `This is a recovery week. Your strain index is ${context.strain.index} out of 100, at or above the ${PLANNER.DELOAD_STRAIN_THRESHOLD} threshold where continuing to add load stops paying off.`,
    }),
  }),

  defineRule({
    id: 'phase.deload-scheduled',
    name: 'Scheduled deload',
    scope: 'phase',
    priority: 90,
    when: (context) =>
      context.weekNumber > 1 && context.weekNumber % PLANNER.DELOAD_EVERY_WEEKS === 0,
    apply: (context) => ({
      patch: { phase: PHASE.RECOVERY, deload: true },
      message: `Week ${context.weekNumber} is a planned deload — one falls every ${PLANNER.DELOAD_EVERY_WEEKS} weeks so fatigue does not accumulate faster than fitness.`,
    }),
  }),

  defineRule({
    id: 'phase.returning-from-break',
    name: 'Returning after a break',
    scope: 'phase',
    priority: 80,
    when: (context) => context.layoff.onBreak,
    apply: (context) => ({
      patch: { phase: PHASE.FOUNDATION, returning: true },
      message: `Back to a foundation week: nothing was logged for ${context.layoff.days} days, so this week rebuilds the habit at reduced load rather than picking up where you left off.`,
    }),
  }),

  defineRule({
    id: 'phase.foundation-start',
    name: 'Opening foundation block',
    scope: 'phase',
    priority: 70,
    when: (context) => context.weekNumber <= PLANNER.PHASE_LENGTH_WEEKS.foundation,
    apply: (context) => ({
      patch: { phase: PHASE.FOUNDATION },
      message: `Week ${context.weekNumber} of the opening foundation block. The first ${PLANNER.PHASE_LENGTH_WEEKS.foundation} weeks build tolerance for the work that follows.`,
    }),
  }),

  defineRule({
    id: 'phase.peak-near-goal',
    name: 'Peak block near the goal',
    scope: 'phase',
    priority: 60,
    when: (context) =>
      context.goalProgress !== null && context.goalProgress >= 90 && !context.layoff.onBreak,
    apply: (context) => ({
      patch: { phase: PHASE.PEAK },
      message: `Peak block: you are ${context.goalProgress}% of the way to your goal weight, so the week protects what you have built instead of chasing more volume.`,
    }),
  }),

  defineRule({
    id: 'phase.strength-block',
    name: 'Strength block',
    scope: 'phase',
    priority: 50,
    when: (context) => {
      const cycle = PLANNER.PHASE_LENGTH_WEEKS.hypertrophy + PLANNER.PHASE_LENGTH_WEEKS.strength;
      const into = (context.weekNumber - PLANNER.PHASE_LENGTH_WEEKS.foundation - 1) % cycle;
      return into >= PLANNER.PHASE_LENGTH_WEEKS.hypertrophy;
    },
    apply: (context) => ({
      patch: { phase: PHASE.STRENGTH },
      message: `Strength block: after ${PLANNER.PHASE_LENGTH_WEEKS.hypertrophy} weeks of accumulating volume, this stretch shifts toward heavier, lower-volume work.`,
    }),
  }),

  defineRule({
    id: 'phase.hypertrophy-default',
    name: 'Hypertrophy block',
    scope: 'phase',
    priority: 10,
    when: () => true,                       // the fallback — always matches last
    apply: (context) => ({
      patch: { phase: PHASE.HYPERTROPHY },
      message: `Hypertrophy block, week ${context.weekNumber}. This is the default working phase for a ${context.goal} goal: moderate loads, higher volume.`,
    }),
  }),
];
