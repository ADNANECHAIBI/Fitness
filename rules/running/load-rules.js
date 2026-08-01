/**
 * load-rules.js — how far the week may run.
 *
 * Rules set a weekly distance budget; the session rules spend it.
 */

import { defineRule } from '../rule.js';
import { RUNNING_PROGRAM, RUNNING_LOAD } from '../../engines/constants.js';
import { round } from '../../engines/calculation-engine.js';

export const loadRules = [
  defineRule({
    id: 'running-load.baseline',
    name: 'Weekly distance baseline',
    scope: 'week',
    priority: 100,
    when: (context) => context.runningDayCount > 0,
    apply: (context) => {
      const base = RUNNING_PROGRAM.BASE_WEEKLY_KM[context.level] ?? RUNNING_PROGRAM.BASE_WEEKLY_KM.beginner;
      const target = context.history.lastWeekKm > 0 ? context.history.lastWeekKm : base;

      return {
        patch: { weeklyKm: round(target, 1), fromHistory: context.history.lastWeekKm > 0 },
        message: context.history.lastWeekKm > 0
          ? `Starting from last week's ${context.history.lastWeekKm} km. Volume is built from what you actually ran, not from a table.`
          : `Starting at ${base} km for the week — the ${context.level} baseline, since nothing has been logged yet.`,
      };
    },
  }),

  defineRule({
    id: 'running-load.progress-gradually',
    name: 'Raise distance gradually',
    scope: 'week',
    priority: 90,
    when: (context, draft) =>
      draft.fromHistory &&
      !context.deload &&
      !context.layoff.onBreak &&
      context.history.lastWeekRuns >= 2,
    apply: (context, draft) => {
      const raised = round(draft.weeklyKm * (1 + RUNNING_PROGRAM.MAX_WEEKLY_INCREASE), 1);
      return {
        patch: { weeklyKm: raised },
        message: `Up to ${raised} km, ${Math.round(RUNNING_PROGRAM.MAX_WEEKLY_INCREASE * 100)}% more than last week. That ceiling is a convention rather than a proven injury threshold, but it keeps the jumps small enough to notice a problem before it becomes one.`,
      };
    },
  }),

  defineRule({
    id: 'running-load.deload',
    name: 'Deload cuts distance',
    scope: 'week',
    priority: 95,
    when: (context) => context.deload,
    apply: (context, draft) => {
      const cut = round(draft.weeklyKm * 0.6, 1);
      return {
        patch: { weeklyKm: cut, easyOnly: true },
        message: `Distance drops to ${cut} km and every run stays easy. It is a deload week — running hard through one undoes the point of it.`,
      };
    },
  }),

  defineRule({
    id: 'running-load.returning',
    name: 'Reduced distance on return',
    scope: 'week',
    priority: 92,
    when: (context) => context.layoff.onBreak,
    apply: (context, draft) => {
      const cut = round(draft.weeklyKm * RUNNING_PROGRAM.RETURN_DISTANCE_FACTOR, 1);
      return {
        patch: { weeklyKm: cut, easyOnly: true, returning: true },
        message: `Back at ${cut} km, ${Math.round(RUNNING_PROGRAM.RETURN_DISTANCE_FACTOR * 100)}% of normal, all of it easy. It has been ${context.layoff.days} days since your last run — aerobic fitness comes back quickly, but tendons take longer than lungs.`,
      };
    },
  }),

  defineRule({
    id: 'running-load.acute-spike',
    name: 'Recent load has spiked',
    scope: 'week',
    priority: 85,
    when: (context, draft) =>
      context.load.ratio !== null &&
      context.load.ratio > RUNNING_LOAD.SAFE_RATIO[1] &&
      !context.deload && !context.layoff.onBreak,
    apply: (context, draft) => ({
      patch: { weeklyKm: round(draft.weeklyKm * 0.85, 1), easyOnly: true },
      message: `Distance is held back to ${round(draft.weeklyKm * 0.85, 1)} km and kept easy. Your last week of running was ${context.load.ratio} times your recent average — that ratio is the clearest early signal there is, and it is above the ${RUNNING_LOAD.SAFE_RATIO[1]} mark.`,
    }),
  }),

  defineRule({
    id: 'running-load.lifting-is-heavy',
    name: 'Lifting is taking the recovery',
    scope: 'week',
    priority: 80,
    when: (context, draft) =>
      context.load.liftingStrain >= RUNNING_LOAD.LIFTING_HEAVY_STRAIN && !context.deload,
    apply: (context, draft) => ({
      patch: { weeklyKm: round(draft.weeklyKm * 0.9, 1), easyOnly: true },
      message: `Running eases to ${round(draft.weeklyKm * 0.9, 1)} km, all easy. Strain from the lifting week is at ${context.load.liftingStrain} out of 100, and both kinds of training draw on the same recovery.`,
    }),
  }),

  defineRule({
    id: 'running-load.bulking-caps-cardio',
    name: 'A bulk caps the cardio',
    scope: 'week',
    priority: 70,
    when: (context) => context.goal === 'bulk',
    apply: (context, draft) => ({
      patch: { weeklyKm: draft.weeklyKm, bulkCapped: true },
      message: `Running is kept to what maintains aerobic fitness rather than what builds it. You are trying to gain weight, and every kilometre is energy that has to be eaten back.`,
    }),
  }),
];
