/**
 * queries.js — the questions a consumer asks.
 *
 * Every function here is a delegation. There is no logic in this file by
 * design: if a query needed a calculation, that calculation belongs in the
 * engine that owns the subject, and this file would call it.
 */

import { PlannerService } from '../services/planner-service.js';
import { WorkoutPlanService } from '../services/workout-plan-service.js';
import { RunningProgramService } from '../services/running-program-service.js';
import { NutritionPlanService } from '../services/nutrition-plan-service.js';
import { MealPlanService } from '../services/meal-plan-service.js';
import { ExecutionService } from '../services/execution-service.js';
import { DashboardService } from './dashboard-service.js';
import { ProgressService } from './progress-service.js';
import { RecoveryService } from './recovery-service.js';
import { NotificationEngine } from './notification-engine.js';
import { ReportService } from './report-service.js';
import { InsightsService } from './insights-service.js';
import { startOfWeek } from '../engines/plan-context.js';
import { today } from '../models/index.js';

/** ISO date, n days from a date. */
const shift = (days, from = today()) =>
  new Date(new Date(`${from}T00:00:00Z`).getTime() + days * 86400000)
    .toISOString().slice(0, 10);

export const Queries = Object.freeze({
  /* ── Days ─────────────────────────────────────────────────────────────── */

  getToday() { return DashboardService.snapshot(today()); },
  getTomorrow() { return DashboardService.snapshot(shift(1)); },
  getDay(date) { return DashboardService.snapshot(date); },

  /* ── Weeks ────────────────────────────────────────────────────────────── */

  getCurrentWeek() {
    return {
      plan: PlannerService.plan(),
      workout: WorkoutPlanService.week(),
      running: RunningProgramService.week(),
      nutrition: NutritionPlanService.week(),
      meals: MealPlanService.week(),
    };
  },

  getWeek(weekStart) {
    return {
      plan: PlannerService.plan(weekStart),
      workout: WorkoutPlanService.week(weekStart),
      running: RunningProgramService.week(weekStart),
      nutrition: NutritionPlanService.week(weekStart),
      meals: MealPlanService.week(weekStart),
    };
  },

  /** The last four weeks of reports, plus the progress snapshot. */
  getCurrentMonth() {
    const weeks = [0, 1, 2, 3].map((offset) => startOfWeek(shift(-7 * offset)));
    return {
      weeks,
      reports: weeks.map((weekStart) => ReportService.planVersusActual(weekStart)),
      progress: ProgressService.snapshot(),
    };
  },

  /* ── Reports ──────────────────────────────────────────────────────────── */

  /** The analysed report for a week — phase 16's reports engine. */
  getWeeklyReport(weekStart) { return ReportService.analyze(weekStart); },

  /** The analysed month, built from the weeks inside it. */
  getMonthlyReport(month) { return ReportService.month(month); },

  /** Why one figure in a week's report reads the way it does. */
  explainFigure(figureKey, weekStart) { return ReportService.explain(figureKey, weekStart); },

  /** What stands out in a week — phase 17's insights engine. */
  getWeeklyInsights(weekStart) { return InsightsService.week(weekStart); },

  /** The same for a month. */
  getMonthlyInsights(month) { return InsightsService.month(month); },

  /** Only the insights worth acting on, strongest first. */
  getPriorityInsights(weekStart) { return InsightsService.priority(weekStart); },

  /* ── Next up ──────────────────────────────────────────────────────────── */

  /** The next planned lifting session from today onward, or null. */
  getNextWorkout() {
    const from = today();
    return WorkoutPlanService.week().days.find((day) => day.date >= from) ?? null;
  },

  /** The next planned run from today onward, or null. */
  getNextRun() {
    const from = today();
    return RunningProgramService.week().sessions.find((session) => session.date >= from) ?? null;
  },

  /* ── Today's detail ───────────────────────────────────────────────────── */

  getMealsToday() { return MealPlanService.day(today()); },
  getNutritionToday() { return NutritionPlanService.day(today()); },
  getWorkoutToday() { return WorkoutPlanService.day(today()); },
  getRunToday() { return RunningProgramService.session(today()); },

  /* ── State ────────────────────────────────────────────────────────────── */

  getRecovery() { return RecoveryService.snapshot(); },
  getProgress() { return ProgressService.snapshot(); },
  getDashboard(date = today()) { return DashboardService.snapshot(date); },
  getNotifications() { return NotificationEngine.all(); },
  getUnreadNotifications() { return NotificationEngine.unread(); },
  getActiveSession() { return ExecutionService.active(); },

  /** The weekly shopping list, from the meal plan. */
  getShoppingList() { return MealPlanService.totals(); },
});
