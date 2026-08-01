/**
 * achievement-rules.js — what the week did that is worth naming.
 *
 * Every rule reads the summaries the report already built and appends one
 * achievement. None of them recompute anything: a personal best is a record
 * the execution engine detected, a best pace is the running engine's pace
 * against the running progress engine's history.
 *
 * An achievement with no numbers behind it is not an achievement, so each
 * carries the evidence it was granted on.
 */

import { defineRule } from '../rule.js';
import { ACHIEVEMENT, REPORTS, PRECISION } from '../../engines/constants.js';
import { round } from '../../engines/calculation-engine.js';

/** Append one achievement to the draft. */
const add = (draft, item) => ({ achievements: [...(draft.achievements ?? []), item] });

export const achievementRules = [
  defineRule({
    id: 'achievement.personal-best',
    name: 'Personal best',
    scope: 'week',
    priority: 100,
    when: (context) => (context.gym.records ?? []).length > 0,
    apply: (context, draft) => {
      const records = context.gym.records;
      return {
        patch: add(draft, {
          type: ACHIEVEMENT.PERSONAL_BEST,
          count: records.length,
          evidence: { records },
          sourceEngine: 'execution-engine',
        }),
        message: `${records.length} personal record${records.length === 1 ? '' : 's'} fell this week: ${records.map((record) => `${record.exerciseId} ${record.value}${record.unit ?? ''}`).join(', ')}. Detected when each session closed, not recounted here.`,
      };
    },
  }),

  defineRule({
    id: 'achievement.longest-run',
    name: 'Longest run',
    scope: 'week',
    priority: 90,
    when: (context) =>
      context.running.longestRunKm !== null &&
      context.running.longestRunKm > 0 &&
      context.running.longestRunKm >= (context.running.allTime.longestRunKm ?? 0),
    apply: (context, draft) => ({
      patch: add(draft, {
        type: ACHIEVEMENT.LONGEST_RUN,
        valueKm: context.running.longestRunKm,
        evidence: { longestRunKm: context.running.longestRunKm, allTimeKm: context.running.allTime.longestRunKm },
        sourceEngine: 'running-progress-engine',
      }),
      message: `Longest run on record: ${context.running.longestRunKm} km.`,
    }),
  }),

  defineRule({
    id: 'achievement.best-pace',
    name: 'Fastest pace',
    scope: 'week',
    priority: 85,
    when: (context) =>
      context.running.bestPaceSecPerKm !== null &&
      context.running.allTime.bestPaceSecPerKm !== null &&
      context.running.bestPaceSecPerKm <= context.running.allTime.bestPaceSecPerKm,
    apply: (context, draft) => ({
      patch: add(draft, {
        type: ACHIEVEMENT.BEST_PACE,
        paceSecPerKm: context.running.bestPaceSecPerKm,
        evidence: {
          paceSecPerKm: context.running.bestPaceSecPerKm,
          allTimeSecPerKm: context.running.allTime.bestPaceSecPerKm,
        },
        sourceEngine: 'running-engine',
      }),
      message: `Fastest kilometre pace on record: ${context.running.bestPace}.`,
    }),
  }),

  defineRule({
    id: 'achievement.perfect-adherence',
    name: 'Perfect adherence',
    scope: 'week',
    priority: 80,
    when: (context) =>
      context.adherence.overall !== null &&
      context.adherence.overall >= REPORTS.ADHERENCE_PERFECT,
    apply: (context, draft) => ({
      patch: add(draft, {
        type: ACHIEVEMENT.PERFECT_ADHERENCE,
        percent: context.adherence.overall,
        evidence: { adherence: context.adherence },
        sourceEngine: 'reports-engine',
      }),
      message: `Adherence came out at ${context.adherence.overall}%, at or above the ${REPORTS.ADHERENCE_PERFECT}% line, across ${context.adherence.componentsCounted.join(', ')}.`,
    }),
  }),

  defineRule({
    id: 'achievement.most-consistent-week',
    name: 'Most consistent week',
    scope: 'week',
    priority: 70,
    when: (context) =>
      context.adherence.overall !== null &&
      context.previousAdherence.length > 0 &&
      context.adherence.overall > Math.max(...context.previousAdherence),
    apply: (context, draft) => ({
      patch: add(draft, {
        type: ACHIEVEMENT.MOST_CONSISTENT_WEEK,
        percent: context.adherence.overall,
        evidence: {
          adherence: context.adherence.overall,
          previousBest: Math.max(...context.previousAdherence),
          weeksCompared: context.previousAdherence.length,
        },
        sourceEngine: 'reports-engine',
      }),
      message: `The most consistent week so far: ${context.adherence.overall}%, past the previous best of ${Math.max(...context.previousAdherence)}% across ${context.previousAdherence.length} earlier week${context.previousAdherence.length === 1 ? '' : 's'}.`,
    }),
  }),

  defineRule({
    id: 'achievement.streak',
    name: 'Streak',
    scope: 'week',
    priority: 60,
    when: (context) => context.streakWeeks >= REPORTS.STREAK_MIN_WEEKS,
    apply: (context, draft) => ({
      patch: add(draft, {
        type: ACHIEVEMENT.STREAK,
        weeks: context.streakWeeks,
        evidence: { weeks: context.streakWeeks, threshold: REPORTS.ADHERENCE_LOW },
        sourceEngine: 'reports-engine',
      }),
      message: `${context.streakWeeks} weeks in a row at or above ${REPORTS.ADHERENCE_LOW}% adherence, this one included.`,
    }),
  }),

  defineRule({
    id: 'achievement.budget-success',
    name: 'Inside the budget',
    scope: 'week',
    priority: 50,
    when: (context) =>
      context.meals.planned &&
      context.meals.withinBudget === true &&
      context.meals.costMad !== null,
    apply: (context, draft) => ({
      patch: add(draft, {
        type: ACHIEVEMENT.BUDGET_SUCCESS,
        costMad: context.meals.costMad,
        evidence: { costMad: context.meals.costMad, budgetMad: context.meals.budgetMadPerWeek },
        sourceEngine: 'meal-planning-engine',
      }),
      message: `The week's meals were planned at about ${context.meals.costMad} MAD against a budget of ${context.meals.budgetMadPerWeek} MAD. The prices are estimates, so this is a plan that fits, not a receipt.`,
    }),
  }),

  defineRule({
    id: 'achievement.goal-reached',
    name: 'Goal weight reached',
    scope: 'week',
    priority: 110,
    when: (context) =>
      context.weight.progressPercent !== null && context.weight.progressPercent >= 100,
    apply: (context, draft) => ({
      patch: add(draft, {
        type: ACHIEVEMENT.GOAL_REACHED,
        weightKg: context.weight.lastKg,
        evidence: {
          currentKg: context.weight.lastKg,
          goalKg: context.weight.goalKg,
          progressPercent: context.weight.progressPercent,
        },
        sourceEngine: 'body-engine',
      }),
      message: `The scale reached the goal weight: ${round(context.weight.lastKg, PRECISION.KG)} kg against a target of ${context.weight.goalKg} kg.`,
    }),
  }),
];
