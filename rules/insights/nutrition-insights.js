/**
 * nutrition-insights.js — what the eating and the shopping say.
 *
 * Targets come from the nutrition engine, costs and macro accuracy from the
 * meal planning engine, intake from what was logged. This file compares them
 * and says which comparison is worth reading.
 */

import { defineRule } from '../rule.js';
import {
  INSIGHT_CATEGORY, INSIGHT_SEVERITY, INSIGHTS, WARNING, REPORTS,
} from '../../engines/constants.js';
import { round } from '../../engines/calculation-engine.js';

const add = (draft, insight) => ({ insights: [...(draft.insights ?? []), insight] });

export const nutritionInsightRules = [
  defineRule({
    id: 'insight.low-protein',
    name: 'Protein is under target',
    scope: 'insight',
    priority: 78,
    when: (context) => context.warned(WARNING.LOW_PROTEIN),
    apply: (context, draft) => {
      const warning = context.warning(WARNING.LOW_PROTEIN);
      const evidence = warning.evidence;
      const gap = evidence.targetProteinG !== null && evidence.avgProteinG !== null
        ? round(evidence.targetProteinG - evidence.avgProteinG, 0)
        : null;

      const reason = `Protein averaged ${evidence.avgProteinG} g against the nutrition engine's ${evidence.targetProteinG} g target — ${evidence.percent}%${gap !== null ? `, about ${gap} g a day short` : ''} across ${evidence.daysLogged} logged days${evidence.safetyFloorG ? `, with the safety floor at ${evidence.safetyFloorG} g` : ''}.`;

      return {
        patch: add(draft, {
          id: 'insight.low-protein',
          key: 'nutrition.low-protein',
          category: INSIGHT_CATEGORY.NUTRITION,
          severity: warning.severity === 'high' ? INSIGHT_SEVERITY.CRITICAL : INSIGHT_SEVERITY.WARNING,
          priority: INSIGHTS.PRIORITY.HIGH,
          title: 'Protein is short',
          summary: `${evidence.avgProteinG} g a day against a ${evidence.targetProteinG} g target.`,
          reason,
          evidence: { ...evidence, gapG: gap },
          confidence: context.confidence(),
          sourceEngine: 'nutrition-engine',
          date: context.date,
          relatedData: { warning: WARNING.LOW_PROTEIN, explanations: ['nutrition.proteinPercent'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.calories-low',
    name: 'Intake is under target',
    scope: 'insight',
    priority: 74,
    when: (context) => context.warned(WARNING.CALORIES_TOO_LOW),
    apply: (context, draft) => {
      const warning = context.warning(WARNING.CALORIES_TOO_LOW);
      const evidence = warning.evidence;

      const reason = `Intake averaged ${evidence.avgCalories} kcal against a ${evidence.targetCalories} kcal target — ${evidence.percent}% — over ${evidence.daysLogged} logged days on a ${evidence.goal} goal. Days that were not logged are not in that average, so under-logging and under-eating look identical here.`;

      return {
        patch: add(draft, {
          id: 'insight.calories-low',
          key: 'nutrition.calories-low',
          category: INSIGHT_CATEGORY.NUTRITION,
          severity: warning.severity === 'high' ? INSIGHT_SEVERITY.WARNING : INSIGHT_SEVERITY.NEUTRAL,
          priority: INSIGHTS.PRIORITY.MEDIUM,
          title: 'Intake is under the target',
          summary: `${evidence.avgCalories} kcal a day against ${evidence.targetCalories} kcal.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'nutrition-engine',
          date: context.date,
          relatedData: { warning: WARNING.CALORIES_TOO_LOW, explanations: ['nutrition.caloriePercent'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.budget-exceeded',
    name: 'The meal plan is over budget',
    scope: 'insight',
    priority: 55,
    when: (context) => context.warned(WARNING.BUDGET_EXCEEDED),
    apply: (context, draft) => {
      const warning = context.warning(WARNING.BUDGET_EXCEEDED);
      const evidence = {
        ...warning.evidence,
        overByMad: warning.evidence.costMad !== null && warning.evidence.budgetMad !== null
          ? round(warning.evidence.costMad - warning.evidence.budgetMad, 2)
          : null,
        macroAccuracyPercent: context.report.meals.macroAccuracyPercent,
      };

      const reason = `The meal planning engine built the week at about ${evidence.costMad} MAD against a ${evidence.budgetMad} MAD budget, over by roughly ${evidence.overByMad} MAD. Those prices are the food database's estimates, which are the least reliable numbers in the project.`;

      return {
        patch: add(draft, {
          id: 'insight.budget-exceeded',
          key: 'budget.exceeded',
          category: INSIGHT_CATEGORY.BUDGET,
          severity: INSIGHT_SEVERITY.WARNING,
          priority: INSIGHTS.PRIORITY.MEDIUM,
          title: 'The week costs more than the budget',
          summary: `About ${evidence.costMad} MAD planned against a ${evidence.budgetMad} MAD budget.`,
          reason,
          evidence,
          confidence: context.confidence(REPORTS.CONFIDENCE_LEVEL.MEDIUM),
          sourceEngine: 'meal-planning-engine',
          date: context.date,
          relatedData: { warning: WARNING.BUDGET_EXCEEDED, explanations: ['meals.costMad'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.budget-comfortable',
    name: 'The plan fits the budget',
    scope: 'insight',
    priority: 20,
    when: (context) =>
      context.report.meals.planned &&
      context.report.meals.withinBudget === true &&
      context.report.meals.costMad !== null,
    apply: (context, draft) => {
      const evidence = {
        costMad: context.report.meals.costMad,
        budgetMad: context.report.meals.budgetMadPerWeek,
        dailyCostMad: context.report.meals.dailyCostMad,
        varietyFoods: context.report.meals.varietyFoods,
      };

      const reason = `The week was planned at about ${evidence.costMad} MAD inside a ${evidence.budgetMad} MAD budget, using ${evidence.varietyFoods} distinct foods. It is a plan that fits on estimated prices, not a receipt.`;

      return {
        patch: add(draft, {
          id: 'insight.budget-comfortable',
          key: 'budget.comfortable',
          category: INSIGHT_CATEGORY.BUDGET,
          severity: INSIGHT_SEVERITY.POSITIVE,
          priority: INSIGHTS.PRIORITY.BACKGROUND,
          title: 'The meal plan fits the budget',
          summary: `${evidence.costMad} MAD planned against ${evidence.budgetMad} MAD.`,
          reason,
          evidence,
          confidence: context.confidence(REPORTS.CONFIDENCE_LEVEL.MEDIUM),
          sourceEngine: 'meal-planning-engine',
          date: context.date,
          relatedData: { explanations: ['meals.costMad'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.macro-accuracy',
    name: 'The meals miss the macros',
    scope: 'insight',
    priority: 35,
    when: (context) =>
      context.report.meals.macroAccuracyPercent !== null &&
      context.report.meals.macroAccuracyPercent < REPORTS.MACRO_ACCURACY_LOW,
    apply: (context, draft) => {
      const evidence = {
        macroAccuracyPercent: context.report.meals.macroAccuracyPercent,
        threshold: REPORTS.MACRO_ACCURACY_LOW,
        compliancePercent: context.report.meals.compliancePercent,
      };

      const reason = `The meal planner landed at ${evidence.macroAccuracyPercent}% macro accuracy, below the ${evidence.threshold}% line. It is a greedy heuristic over a finite food list with rounded portions, so a gap is expected — it is reported rather than hidden.`;

      return {
        patch: add(draft, {
          id: 'insight.macro-accuracy',
          key: 'meals.macro-accuracy',
          category: INSIGHT_CATEGORY.MEALS,
          severity: INSIGHT_SEVERITY.NEUTRAL,
          priority: INSIGHTS.PRIORITY.LOW,
          title: 'The built meals sit off the macro targets',
          summary: `${evidence.macroAccuracyPercent}% macro accuracy on the planned week.`,
          reason,
          evidence,
          confidence: context.confidence(REPORTS.CONFIDENCE_LEVEL.MEDIUM),
          sourceEngine: 'meal-planning-engine',
          date: context.date,
          relatedData: { explanations: ['meals.macroAccuracyPercent'] },
        }),
        message: reason,
      };
    },
  }),

  defineRule({
    id: 'insight.nutrition-on-target',
    name: 'Eating matched the plan',
    scope: 'insight',
    priority: 45,
    when: (context) =>
      context.report.nutrition.adherencePercent !== null &&
      context.report.nutrition.adherencePercent >= REPORTS.ADHERENCE_PERFECT &&
      (context.report.nutrition.proteinPercent ?? 0) >= REPORTS.PROTEIN_HIT_SHARE * 100,
    apply: (context, draft) => {
      const evidence = {
        adherencePercent: context.report.nutrition.adherencePercent,
        onPlanDays: context.report.nutrition.onPlanDays,
        proteinPercent: context.report.nutrition.proteinPercent,
        avgCalories: context.report.nutrition.avgCalories,
        targetCalories: context.report.nutrition.targetCalories,
      };

      const reason = `${evidence.onPlanDays} of seven days landed inside ±${round(REPORTS.CALORIE_TOLERANCE * 100, 0)}% of the calorie target, with protein at ${evidence.proteinPercent}% of its own.`;

      return {
        patch: add(draft, {
          id: 'insight.nutrition-on-target',
          key: 'nutrition.on-target',
          category: INSIGHT_CATEGORY.NUTRITION,
          severity: INSIGHT_SEVERITY.POSITIVE,
          priority: INSIGHTS.PRIORITY.MEDIUM,
          title: 'Eating matched the plan',
          summary: `${evidence.onPlanDays} of seven days on target, protein at ${evidence.proteinPercent}%.`,
          reason,
          evidence,
          confidence: context.confidence(),
          sourceEngine: 'nutrition-engine',
          date: context.date,
          relatedData: { explanations: ['nutrition.adherencePercent'] },
        }),
        message: reason,
      };
    },
  }),
];
