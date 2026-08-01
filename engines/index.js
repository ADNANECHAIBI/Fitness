/**
 * engines/index.js — barrel export.
 *
 * Layering (rule 8):
 *   calculation-engine  arithmetic only, knows nothing about training
 *   energy / body / strength / running   domain maths, built on the above
 *   adjustment          the only engine that decides anything, and it always
 *                       explains itself
 *
 * Engines are pure: no storage, no events, no DOM. Services call engines;
 * engines never call services.
 */

export { CalculationEngine } from './calculation-engine.js';
export * as calc from './calculation-engine.js';

export { EnergyEngine, bmrFormula, tdeeFormula, MIFFLIN_ST_JEOR, KATCH_MCARDLE_BMR } from './energy-engine.js';
export { BodyEngine, bmiFormula, bodyFatFormula, trendFormula } from './body-engine.js';
export { StrengthEngine, volumeFormula, oneRepMaxFormula, EPLEY, BRZYCKI } from './strength-engine.js';
export { RunningEngine, paceFormula, runEnergyFormula } from './running-engine.js';
export { AdjustmentEngine, adjustmentFormula, ACTION } from './adjustment-engine.js';
export { PlannerEngine, plannerSlot, PLANNER_VERSION } from './planner-engine.js';
export { WorkoutEngine, workoutSlot, WORKOUT_ENGINE_VERSION } from './workout-engine.js';
export { createWorkoutContext, ASSUMED_EQUIPMENT, TRACKED_MUSCLES } from './workout-context.js';
export { ExecutionEngine, executorSlot, EXECUTION_ENGINE_VERSION, sessionFromDay } from './execution-engine.js';
export { RunningProgramEngine, runningProgramSlot, RUNNING_ENGINE_VERSION } from './running-program-engine.js';
export { RunningProgressEngine } from './running-progress-engine.js';
export { RunningExecutionEngine, runExecutorSlot, executionFromSession } from './running-execution-engine.js';
export { createRunningContext, sessionLoad } from './running-context.js';
export * as sessionState from './session-state.js';
export { NutritionEngine, nutritionSlot, NUTRITION_ENGINE_VERSION } from './nutrition-engine.js';
export { createNutritionContext, normaliseGoal } from './nutrition-context.js';
export { MealPlanningEngine, mealSlot, MEAL_ENGINE_VERSION } from './meal-planning-engine.js';
export { createMealContext, resolveBudget } from './meal-context.js';
export { createPlanContext, STRAIN_INDEX, startOfWeek, weekDates } from './plan-context.js';
export { ReportsEngine, REPORTS_ENGINE_VERSION } from './reports-engine.js';
export { InsightsEngine, INSIGHTS_ENGINE_VERSION } from './insights-engine.js';
export { DashboardEngine, DASHBOARD_ENGINE_VERSION } from './dashboard-engine.js';
export { createDashboardContext, DASHBOARD_SOURCES } from './dashboard-context.js';
export { AnalyticsEngine, ANALYTICS_ENGINE_VERSION } from './analytics-engine.js';
export { createAnalyticsContext, METRICS as ANALYTICS_METRICS } from './analytics-context.js';
export { trendOf, meanOf, totalOf, seriesOf } from './trend.js';
export { CoachEngine, COACH_ENGINE_VERSION } from './coach-engine.js';
export { createCoachContext } from './coach-context.js';
export { createAdvice, rankAdvice, mergeDuplicateAdvice, suppressOverlaps } from './coach-advice.js';
export { BackupEngine, BACKUP_ENGINE_VERSION, IMPORT_INTENT } from './backup-engine.js';
export { SECTIONS as BACKUP_SECTIONS, SECTION_NAMES, BACKUP_SCOPE, IMPORT_MODE, sectionsFor } from './backup-schema.js';
export { migrate, canMigrate, MIGRATIONS } from './backup-migration.js';
export { checkEnvelope, checkSection, checkIntegrity, SEVERITY as BACKUP_SEVERITY, CHECKS as BACKUP_CHECKS } from './backup-validation.js';

export { defineFormula, createSlot } from './formula.js';
export * as CONSTANTS from './constants.js';

import { EnergyEngine } from './energy-engine.js';
import { BodyEngine } from './body-engine.js';
import { StrengthEngine } from './strength-engine.js';
import { RunningEngine } from './running-engine.js';
import { AdjustmentEngine } from './adjustment-engine.js';
import { PlannerEngine } from './planner-engine.js';
import { WorkoutEngine } from './workout-engine.js';
import { RunningProgramEngine } from './running-program-engine.js';
import { NutritionEngine } from './nutrition-engine.js';
import { MealPlanningEngine } from './meal-planning-engine.js';

/**
 * Every formula currently active, for a "how is this calculated?" screen.
 * @returns {object[]}
 */
export function activeFormulas() {
  return [
    ...Object.values(EnergyEngine.formulas()),
    ...Object.values(BodyEngine.formulas()),
    ...Object.values(StrengthEngine.formulas()),
    ...Object.values(RunningEngine.formulas()),
    ...Object.values(AdjustmentEngine.formulas()),
    ...Object.values(PlannerEngine.formulas()),
    ...Object.values(WorkoutEngine.formulas()),
    ...Object.values(RunningProgramEngine.formulas()),
    ...Object.values(NutritionEngine.formulas()),
    ...Object.values(MealPlanningEngine.formulas()),
  ];
}
