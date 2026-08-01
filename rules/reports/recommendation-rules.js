/**
 * recommendation-rules.js — what to do next, and why it is being said.
 *
 * The hard rule of phase 16: nothing is suggested without evidence. Every
 * item carries four things —
 *
 *   reason        the sentence, built from the numbers, not from a template
 *   evidence      the numbers themselves, so the sentence can be checked
 *   confidence    how much of the week was actually on record
 *   sourceEngine  who produced the numbers the advice rests on
 *
 * — and the engine drops any item that arrives without them. A rule that
 * cannot show its evidence is a rule with an opinion, and this file is not
 * for opinions.
 *
 * The rules that decline to act matter as much as the ones that act. When the
 * scale has stalled but half the week is unlogged, the right output is "not
 * enough evidence to change anything, and here is why" — which is why
 * `hold-calories` exists next to `increase-calories`.
 */

import { defineRule } from '../rule.js';
import {
  REPORTS, WARNING, SURPLUS_GOALS, DEFICIT_GOALS, NUTRITION_SAFETY,
  ADJUSTMENT, RUNNING_LOAD, UNITS,
} from '../../engines/constants.js';
import { round } from '../../engines/calculation-engine.js';

const add = (draft, item) => ({ recommendations: [...(draft.recommendations ?? []), item] });

/** True when the week raised a warning of that type. */
const warned = (context, type) => context.warnings.some((warning) => warning.type === type);

/**
 * Confidence for one recommendation.
 *
 * It starts at the week's data coverage and can only be lowered — a rule may
 * cap itself where its own evidence is thin even though the week is well
 * logged, and none may claim more certainty than the data supports.
 */
function confidence(context, cap = REPORTS.CONFIDENCE_LEVEL.HIGH) {
  const order = [
    REPORTS.CONFIDENCE_LEVEL.LOW,
    REPORTS.CONFIDENCE_LEVEL.MEDIUM,
    REPORTS.CONFIDENCE_LEVEL.HIGH,
  ];
  return order[Math.min(order.indexOf(context.coverage.level), order.indexOf(cap))];
}

export const recommendationRules = [
  defineRule({
    id: 'recommend.deload',
    name: 'Take a deload week',
    scope: 'week',
    priority: 100,
    when: (context) =>
      !context.deload.detected &&
      warned(context, WARNING.OVERREACHING) &&
      warned(context, WARNING.UNDER_RECOVERY),
    apply: (context, draft) => {
      const evidence = {
        runningLoadRatio: context.running.trainingLoad?.ratio ?? null,
        safeBand: RUNNING_LOAD.SAFE_RATIO,
        recoveryStatus: context.recovery.status,
        strainIndex: context.recovery.strainIndex,
        avgFatigue: context.recovery.avgFatigue,
        volumeKg: context.gym.volumeKg,
      };

      const reason = `Load and recovery are pointing opposite ways: running load is ${evidence.runningLoadRatio}× the four-week average while recovery reads ${evidence.recoveryStatus} at a strain index of ${evidence.strainIndex}. Two signals, one week — a deload is the cheap way to find out which is real.`;

      return {
        patch: add(draft, {
          id: 'deload',
          action: 'plan-a-deload-week',
          reason,
          evidence,
          confidence: confidence(context),
          sourceEngine: 'running-progress-engine + planner-engine',
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'recommend.ease-running',
    name: 'Hold the running volume where it is',
    scope: 'week',
    priority: 90,
    when: (context) =>
      warned(context, WARNING.OVERREACHING) &&
      !warned(context, WARNING.UNDER_RECOVERY),
    apply: (context, draft) => {
      const evidence = {
        ratio: context.running.trainingLoad?.ratio ?? null,
        acute: context.running.trainingLoad?.acute ?? null,
        chronic: context.running.trainingLoad?.chronic ?? null,
        safeBand: RUNNING_LOAD.SAFE_RATIO,
        distanceKm: context.running.distanceKm,
      };

      const reason = `Running load is ${evidence.ratio}× the four-week average, above the ${RUNNING_LOAD.SAFE_RATIO[1]} line, but recovery is not complaining. Repeating this week's ${evidence.distanceKm} km rather than adding to it lets the chronic load catch up.`;

      return {
        patch: add(draft, {
          id: 'ease-running',
          action: 'hold-running-volume',
          reason,
          evidence,
          confidence: confidence(context),
          sourceEngine: 'running-progress-engine',
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'recommend.increase-calories',
    name: 'Raise the calorie target',
    scope: 'week',
    priority: 85,
    when: (context) =>
      SURPLUS_GOALS.includes(context.goal) &&
      warned(context, WARNING.WEIGHT_STALLED) &&
      context.adherence.overall !== null &&
      context.adherence.overall >= REPORTS.ADHERENCE_LOW &&
      context.nutrition.daysLogged >= UNITS.DAYS_PER_WEEK * REPORTS.CONFIDENCE.MEDIUM_COVERAGE,
    apply: (context, draft) => {
      const evidence = {
        goal: context.goal,
        weeklyChangeKg: context.weight.weeklyChangeKg,
        flatWeeks: context.flatWeightWeeks,
        avgCalories: context.nutrition.avgCalories,
        targetCalories: context.nutrition.targetCalories,
        adherencePercent: context.adherence.overall,
        daysLogged: context.nutrition.daysLogged,
        stepKcal: ADJUSTMENT.STEP_KCAL,
      };

      const reason = `The scale has been flat for ${evidence.flatWeeks} weeks at ${evidence.weeklyChangeKg} kg per week while adherence held at ${evidence.adherencePercent}% and intake averaged ${evidence.avgCalories} kcal against a ${evidence.targetCalories} kcal target. The plan was followed and the weight did not move, which is what a maintenance intake looks like — the adjustment engine owns the size of any change.`;

      return {
        patch: add(draft, {
          id: 'increase-calories',
          action: 'raise-calorie-target',
          reason,
          evidence,
          confidence: confidence(context),
          sourceEngine: 'body-engine + adjustment-engine',
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'recommend.hold-calories',
    name: 'Change nothing about the calories yet',
    scope: 'week',
    priority: 84,
    when: (context) =>
      warned(context, WARNING.WEIGHT_STALLED) &&
      (context.adherence.overall === null ||
        context.adherence.overall < REPORTS.ADHERENCE_LOW ||
        context.nutrition.daysLogged < UNITS.DAYS_PER_WEEK * REPORTS.CONFIDENCE.MEDIUM_COVERAGE),
    apply: (context, draft) => {
      const evidence = {
        weeklyChangeKg: context.weight.weeklyChangeKg,
        flatWeeks: context.flatWeightWeeks,
        adherencePercent: context.adherence.overall,
        daysLogged: context.nutrition.daysLogged,
        threshold: REPORTS.ADHERENCE_LOW,
      };

      const reason = `The scale is flat, but adherence came out at ${evidence.adherencePercent ?? 'unmeasured'}% over ${evidence.daysLogged} logged days. A target that was not followed cannot be said to have failed, so there is nothing here to change it on — log a full week first.`;

      return {
        patch: add(draft, {
          id: 'hold-calories',
          action: 'hold-the-plan',
          reason,
          evidence,
          confidence: confidence(context, REPORTS.CONFIDENCE_LEVEL.MEDIUM),
          sourceEngine: 'reports-engine',
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'recommend.reduce-calories',
    name: 'Lower the calorie target',
    scope: 'week',
    priority: 83,
    when: (context) =>
      DEFICIT_GOALS.includes(context.goal) &&
      warned(context, WARNING.WEIGHT_STALLED) &&
      context.adherence.overall !== null &&
      context.adherence.overall >= REPORTS.ADHERENCE_LOW &&
      context.nutrition.daysLogged >= UNITS.DAYS_PER_WEEK * REPORTS.CONFIDENCE.MEDIUM_COVERAGE,
    apply: (context, draft) => {
      const evidence = {
        goal: context.goal,
        weeklyChangeKg: context.weight.weeklyChangeKg,
        flatWeeks: context.flatWeightWeeks,
        avgCalories: context.nutrition.avgCalories,
        targetCalories: context.nutrition.targetCalories,
        adherencePercent: context.adherence.overall,
        maxDeficitFraction: NUTRITION_SAFETY.MAX_DEFICIT_FRACTION,
      };

      const reason = `Weight has been flat for ${evidence.flatWeeks} weeks on a deficit goal with adherence at ${evidence.adherencePercent}%. The nutrition engine's safety floors cap how far the target may fall, so any cut is bounded by them rather than by this report.`;

      return {
        patch: add(draft, {
          id: 'reduce-calories',
          action: 'lower-calorie-target',
          reason,
          evidence,
          confidence: confidence(context),
          sourceEngine: 'body-engine + adjustment-engine',
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'recommend.raise-protein',
    name: 'Bring protein back to target',
    scope: 'week',
    priority: 80,
    when: (context) => warned(context, WARNING.LOW_PROTEIN),
    apply: (context, draft) => {
      const evidence = {
        avgProteinG: context.nutrition.avgProteinG,
        targetProteinG: context.nutrition.targetProteinG,
        percent: context.nutrition.proteinPercent,
        floorGPerKg: NUTRITION_SAFETY.MIN_PROTEIN_G_PER_KG,
        weightKg: context.weight.currentKg,
        daysLogged: context.nutrition.daysLogged,
      };

      const gap = evidence.targetProteinG !== null && evidence.avgProteinG !== null
        ? round(evidence.targetProteinG - evidence.avgProteinG, 0)
        : null;

      const reason = `Protein averaged ${evidence.avgProteinG} g against ${evidence.targetProteinG} g${gap !== null ? `, a gap of about ${gap} g a day` : ''}. Protein is the one macro the plan is built around holding, and it is short over ${evidence.daysLogged} logged days.`;

      return {
        patch: add(draft, {
          id: 'raise-protein',
          action: 'raise-protein-intake',
          reason,
          evidence: { ...evidence, gapG: gap },
          confidence: confidence(context),
          sourceEngine: 'nutrition-engine',
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'recommend.review-schedule',
    name: 'The plan is asking for more days than the week has',
    scope: 'week',
    priority: 75,
    when: (context) =>
      warned(context, WARNING.MISSED_WORKOUTS) &&
      context.repeatedMissWeeks >= REPORTS.WEIGHT_STALL_WEEKS - 1,
    apply: (context, draft) => {
      const evidence = {
        weeks: context.repeatedMissWeeks,
        planned: context.gym.plannedSessions,
        completed: context.gym.completedSessions,
        missed: context.gym.missedSessions,
      };

      const reason = `Sessions have been missed in ${evidence.weeks} consecutive weeks — ${evidence.completed} of ${evidence.planned} completed this week. A plan that is repeatedly not finished is worth rewriting to the days that exist rather than repeating.`;

      return {
        patch: add(draft, {
          id: 'review-schedule',
          action: 'reduce-planned-training-days',
          reason,
          evidence,
          confidence: confidence(context),
          sourceEngine: 'execution-engine + planner-engine',
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'recommend.rebuild-meals',
    name: 'Rebuild the meal plan inside the budget',
    scope: 'week',
    priority: 50,
    when: (context) => warned(context, WARNING.BUDGET_EXCEEDED),
    apply: (context, draft) => {
      const evidence = {
        costMad: context.meals.costMad,
        budgetMad: context.meals.budgetMadPerWeek,
        overByMad: context.meals.costMad !== null && context.meals.budgetMadPerWeek !== null
          ? round(context.meals.costMad - context.meals.budgetMadPerWeek, 2)
          : null,
        macroAccuracyPercent: context.meals.macroAccuracyPercent,
      };

      const reason = `The plan costs about ${evidence.costMad} MAD against a ${evidence.budgetMad} MAD budget, over by roughly ${evidence.overByMad} MAD. Regenerating it lets the meal engine trade variety for price rather than leaving the gap to be absorbed.`;

      return {
        patch: add(draft, {
          id: 'rebuild-meals',
          action: 'regenerate-meal-plan',
          reason,
          evidence,
          confidence: confidence(context, REPORTS.CONFIDENCE_LEVEL.MEDIUM),
          sourceEngine: 'meal-planning-engine',
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'recommend.log-more',
    name: 'Log more of the week',
    scope: 'week',
    priority: 40,
    when: (context) => context.coverage.level === REPORTS.CONFIDENCE_LEVEL.LOW,
    apply: (context, draft) => {
      const evidence = {
        coverage: context.coverage.ratio,
        daysWithData: context.coverage.daysWithData,
        daysInWeek: UNITS.DAYS_PER_WEEK,
        droppedRecords: context.quality.dropped,
      };

      const reason = `${evidence.daysWithData} of ${evidence.daysInWeek} days carry any log. Every number in this report is real, but it describes those days rather than the week, and no adjustment should be made on it.`;

      return {
        patch: add(draft, {
          id: 'log-more',
          action: 'log-more-days',
          reason,
          evidence,
          confidence: confidence(context, REPORTS.CONFIDENCE_LEVEL.HIGH),
          sourceEngine: 'reports-engine',
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'recommend.hold-course',
    name: 'Keep the plan as it is',
    scope: 'week',
    priority: 10,
    when: (context) =>
      context.warnings.length === 0 &&
      context.adherence.overall !== null &&
      context.adherence.overall >= REPORTS.ADHERENCE_LOW &&
      context.coverage.level !== REPORTS.CONFIDENCE_LEVEL.LOW,
    apply: (context, draft) => {
      const evidence = {
        adherencePercent: context.adherence.overall,
        weeklyChangeKg: context.weight.weeklyChangeKg,
        coverage: context.coverage.ratio,
        volumeKg: context.gym.volumeKg,
        distanceKm: context.running.distanceKm,
      };

      const reason = `Nothing crossed a threshold this week: adherence ${evidence.adherencePercent}%, the scale moving ${evidence.weeklyChangeKg ?? 'unmeasured'} kg per week, ${evidence.volumeKg} kg of tonnage and ${evidence.distanceKm} km run. A week that works is not a week to change.`;

      return {
        patch: add(draft, {
          id: 'hold-course',
          action: 'keep-the-plan',
          reason,
          evidence,
          confidence: confidence(context),
          sourceEngine: 'reports-engine',
        }),
        message: reason,
      };
    },
  }),
];
