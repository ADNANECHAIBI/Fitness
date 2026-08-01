/**
 * warning-rules.js — what the week says is going wrong.
 *
 * A warning is not advice. It names a fact and the threshold it crossed, and
 * stops there; what to do about it is the recommendation rules' job, and they
 * read these. Keeping the two apart is what makes it possible to show a
 * warning without acting on it — which is the right response to most single
 * weeks of data.
 *
 * Severity is a label, not a score: 'high' means it changes what next week
 * should look like, 'medium' means watch it, 'low' means it is worth knowing.
 */

import { defineRule } from '../rule.js';
import {
  WARNING, REPORTS, STRAIN, SLEEP, NUTRITION_SAFETY, RECOVERY_STATUS,
  DEFICIT_GOALS, SURPLUS_GOALS, UNITS,
} from '../../engines/constants.js';
import { round } from '../../engines/calculation-engine.js';

const add = (draft, item) => ({ warnings: [...(draft.warnings ?? []), item] });

/** Goals where the scale is supposed to be moving in one direction. */
const directionalGoal = (goal) =>
  DEFICIT_GOALS.includes(goal) || SURPLUS_GOALS.includes(goal);

export const warningRules = [
  defineRule({
    id: 'warning.weight-stalled',
    name: 'Weight has stopped moving',
    scope: 'week',
    priority: 90,
    when: (context) =>
      directionalGoal(context.goal) &&
      context.flatWeightWeeks >= REPORTS.WEIGHT_STALL_WEEKS,
    apply: (context, draft) => ({
      patch: add(draft, {
        type: WARNING.WEIGHT_STALLED,
        severity: 'medium',
        evidence: {
          weeks: context.flatWeightWeeks,
          weeklyChangeKg: context.weight.weeklyChangeKg,
          thresholdKg: REPORTS.WEIGHT_STALL_KG,
          goal: context.goal,
        },
        sourceEngine: 'body-engine',
      }),
      message: `The trend has moved less than ${REPORTS.WEIGHT_STALL_KG} kg per week for ${context.flatWeightWeeks} weeks while the goal is ${context.goal}. The current rate is ${context.weight.weeklyChangeKg} kg per week.`,
    }),
  }),

  defineRule({
    id: 'warning.overreaching',
    name: 'Load rising faster than it can be absorbed',
    scope: 'week',
    priority: 100,
    when: (context) =>
      context.running.trainingLoad?.verdict === 'spiking' &&
      context.running.trainingLoadReliable === true,
    apply: (context, draft) => ({
      patch: add(draft, {
        type: WARNING.OVERREACHING,
        severity: 'high',
        evidence: {
          ratio: context.running.trainingLoad.ratio,
          safeBand: context.running.trainingLoad.safeBand,
          acute: context.running.trainingLoad.acute,
          chronic: context.running.trainingLoad.chronic,
        },
        sourceEngine: 'running-progress-engine',
      }),
      message: `Running load for the last week is ${context.running.trainingLoad.ratio}× the four-week average, outside the ${context.running.trainingLoad.safeBand.join('–')} band, over ${context.running.runHistoryDays} days of history. The ratio is an association with injury risk, not a prediction of one.`,
    }),
  }),

  defineRule({
    id: 'warning.under-recovery',
    name: 'Recovery is behind the training',
    scope: 'week',
    priority: 95,
    when: (context) =>
      context.recovery.status === RECOVERY_STATUS.POOR ||
      (context.recovery.avgRecoveryScore !== null &&
        context.recovery.avgRecoveryScore <= STRAIN.LOW_RECOVERY_SCORE),
    apply: (context, draft) => ({
      patch: add(draft, {
        type: WARNING.UNDER_RECOVERY,
        severity: 'high',
        evidence: {
          status: context.recovery.status,
          score: context.recovery.avgRecoveryScore,
          strainIndex: context.recovery.strainIndex,
          strainComponents: context.recovery.strainComponents,
          sleepHours: context.recovery.avgSleepHours,
        },
        sourceEngine: 'planner-engine',
      }),
      message: `Recovery reads ${context.recovery.status}${context.recovery.avgRecoveryScore !== null ? ` at ${context.recovery.avgRecoveryScore}/10` : ''}, with a strain index of ${context.recovery.strainIndex ?? 'unknown'}.`,
    }),
  }),

  defineRule({
    id: 'warning.high-fatigue',
    name: 'Sessions are feeling hard',
    scope: 'week',
    priority: 70,
    when: (context) =>
      context.recovery.avgFatigue !== null &&
      context.recovery.avgFatigue >= REPORTS.FATIGUE_HIGH,
    apply: (context, draft) => ({
      patch: add(draft, {
        type: WARNING.HIGH_FATIGUE,
        severity: 'medium',
        evidence: {
          avgFatigue: context.recovery.avgFatigue,
          threshold: REPORTS.FATIGUE_HIGH,
          sessions: context.gym.sessions,
        },
        sourceEngine: 'execution-engine',
      }),
      message: `Sessions averaged ${context.recovery.avgFatigue}/10 for fatigue, at or above the ${REPORTS.FATIGUE_HIGH} line. Self-reported, and one hard week is not a pattern.`,
    }),
  }),

  defineRule({
    id: 'warning.low-protein',
    name: 'Protein under target',
    scope: 'week',
    priority: 80,
    when: (context) =>
      context.nutrition.proteinPercent !== null &&
      context.nutrition.proteinPercent < REPORTS.PROTEIN_HIT_SHARE * 100,
    apply: (context, draft) => {
      const floorG = context.weight.currentKg
        ? round(context.weight.currentKg * NUTRITION_SAFETY.MIN_PROTEIN_G_PER_KG, 0)
        : null;

      return {
        patch: add(draft, {
          type: WARNING.LOW_PROTEIN,
          severity: floorG !== null && context.nutrition.avgProteinG < floorG ? 'high' : 'medium',
          evidence: {
            avgProteinG: context.nutrition.avgProteinG,
            targetProteinG: context.nutrition.targetProteinG,
            percent: context.nutrition.proteinPercent,
            safetyFloorG: floorG,
            daysLogged: context.nutrition.daysLogged,
          },
          sourceEngine: 'nutrition-engine',
        }),
        message: `Protein averaged ${context.nutrition.avgProteinG} g against a target of ${context.nutrition.targetProteinG} g — ${context.nutrition.proteinPercent}%${floorG !== null ? `, with the safety floor at ${floorG} g` : ''}. Over ${context.nutrition.daysLogged} logged day${context.nutrition.daysLogged === 1 ? '' : 's'}.`,
      };
    },
  }),

  defineRule({
    id: 'warning.calories-too-low',
    name: 'Intake under target',
    scope: 'week',
    priority: 75,
    when: (context) =>
      context.nutrition.caloriePercent !== null &&
      context.nutrition.caloriePercent < REPORTS.CALORIE_LOW_SHARE * 100,
    apply: (context, draft) => ({
      patch: add(draft, {
        type: WARNING.CALORIES_TOO_LOW,
        severity: SURPLUS_GOALS.includes(context.goal) ? 'high' : 'medium',
        evidence: {
          avgCalories: context.nutrition.avgCalories,
          targetCalories: context.nutrition.targetCalories,
          percent: context.nutrition.caloriePercent,
          daysLogged: context.nutrition.daysLogged,
          goal: context.goal,
        },
        sourceEngine: 'nutrition-engine',
      }),
      message: `Intake averaged ${context.nutrition.avgCalories} kcal against a target of ${context.nutrition.targetCalories} — ${context.nutrition.caloriePercent}%. Averaged over the ${context.nutrition.daysLogged} day${context.nutrition.daysLogged === 1 ? '' : 's'} that were logged, so unlogged eating does not appear in it.`,
    }),
  }),

  defineRule({
    id: 'warning.missed-workouts',
    name: 'Sessions not completed',
    scope: 'week',
    priority: 85,
    when: (context) => (context.gym.missedSessions ?? 0) > 0,
    apply: (context, draft) => ({
      patch: add(draft, {
        type: WARNING.MISSED_WORKOUTS,
        severity: context.gym.completedSessions === 0 ? 'high' : 'medium',
        evidence: {
          planned: context.gym.plannedSessions,
          completed: context.gym.completedSessions,
          missed: context.gym.missedSessions,
          abandoned: context.gym.abandonedSessions,
        },
        sourceEngine: 'execution-engine',
      }),
      message: `${context.gym.missedSessions} of ${context.gym.plannedSessions} planned sessions were not completed. Whether that means the plan was too much or the week was, the data cannot say.`,
    }),
  }),

  defineRule({
    id: 'warning.missed-runs',
    name: 'Runs not completed',
    scope: 'week',
    priority: 65,
    when: (context) =>
      context.running.plannedRuns !== null &&
      context.running.plannedRuns > context.running.runs,
    apply: (context, draft) => ({
      patch: add(draft, {
        type: WARNING.MISSED_RUNS,
        severity: 'medium',
        evidence: {
          planned: context.running.plannedRuns,
          logged: context.running.runs,
          plannedKm: context.running.plannedKm,
          distanceKm: context.running.distanceKm,
        },
        sourceEngine: 'running-program-engine',
      }),
      message: `${context.running.runs} of ${context.running.plannedRuns} planned runs were logged, ${context.running.distanceKm} km of ${context.running.plannedKm ?? '—'} km.`,
    }),
  }),

  defineRule({
    id: 'warning.budget-exceeded',
    name: 'Meal plan over budget',
    scope: 'week',
    priority: 40,
    when: (context) => context.meals.planned && context.meals.withinBudget === false,
    apply: (context, draft) => ({
      patch: add(draft, {
        type: WARNING.BUDGET_EXCEEDED,
        severity: 'low',
        evidence: { costMad: context.meals.costMad, budgetMad: context.meals.budgetMadPerWeek },
        sourceEngine: 'meal-planning-engine',
      }),
      message: `The week's meals were planned at ${context.meals.costMad} MAD against a ${context.meals.budgetMadPerWeek} MAD budget. Prices are estimates from the food database.`,
    }),
  }),

  defineRule({
    id: 'warning.data-missing',
    name: 'Not enough of the week is on record',
    scope: 'week',
    priority: 30,
    when: (context) =>
      context.coverage.ratio < REPORTS.CONFIDENCE.MEDIUM_COVERAGE ||
      context.quality.dropped > 0,
    apply: (context, draft) => ({
      patch: add(draft, {
        type: WARNING.DATA_MISSING,
        severity: 'low',
        evidence: {
          coverage: context.coverage.ratio,
          daysWithData: context.coverage.daysWithData,
          daysInWeek: UNITS.DAYS_PER_WEEK,
          droppedRecords: context.quality.dropped,
          droppedBy: context.quality.droppedBy,
        },
        sourceEngine: 'reports-engine',
      }),
      message: `${context.coverage.daysWithData} of ${UNITS.DAYS_PER_WEEK} days carry any log${context.quality.dropped ? `, and ${context.quality.dropped} record${context.quality.dropped === 1 ? ' was' : 's were'} unreadable and dropped` : ''}. Every figure below is over what was logged, not over the week.`,
    }),
  }),

  defineRule({
    id: 'warning.short-sleep',
    name: 'Sleep under target',
    scope: 'week',
    priority: 60,
    when: (context) =>
      context.recovery.avgSleepHours !== null &&
      context.recovery.avgSleepHours < SLEEP.MIN_HOURS,
    apply: (context, draft) => ({
      patch: add(draft, {
        type: WARNING.UNDER_RECOVERY,
        severity: 'medium',
        evidence: {
          sleepHours: context.recovery.avgSleepHours,
          targetHours: SLEEP.TARGET_HOURS,
          minHours: SLEEP.MIN_HOURS,
        },
        sourceEngine: 'recovery',
      }),
      message: `Sleep is set at ${context.recovery.avgSleepHours} hours against a ${SLEEP.TARGET_HOURS} hour target. It is a setting rather than a nightly measurement, so it describes the habit, not the week.`,
    }),
  }),
];
