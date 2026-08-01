/**
 * PlanningService — generating a week, in the one order that works.
 *
 * The order is not a style choice. Each engine consumes what the one before it
 * produced: the workout week needs the plan's gym days, the running week needs
 * the plan and the workout load, the nutrition week needs both, and the meal
 * plan needs the nutrition targets. Running them out of order does not fail
 * loudly — it silently plans against stale numbers.
 *
 *   1. Planner   → which days, which phase, how much recovery
 *   2. Workout   → the lifting sessions inside those days
 *   3. Running   → the runs, knowing what the lifting costs
 *   4. Nutrition → the targets, knowing the whole training load
 *   5. Meals     → the food, from those targets
 *   6. Storage   → a snapshot that the week existed
 *   7. Events    → tell everything else
 *
 * It orchestrates only. Every number comes from an engine.
 */

import { PlannerService } from '../services/planner-service.js';
import { WorkoutPlanService } from '../services/workout-plan-service.js';
import { RunningProgramService } from '../services/running-program-service.js';
import { NutritionPlanService } from '../services/nutrition-plan-service.js';
import { MealPlanService } from '../services/meal-plan-service.js';
import { PlanSnapshotRepository, snapshotFor } from '../repositories/index.js';
import { bus, EVENTS } from '../events/index.js';
import { invalidateAll } from './cache.js';
import { DEFICIT_GOALS } from '../engines/constants.js';
import { createLogger } from '../scripts/logger.js';

const log = createLogger('planning');

/** The pipeline, in order. Each step names what it needs from the last. */
export const PIPELINE = Object.freeze([
  { step: 1, name: 'planner', needs: [], produces: 'WeeklyPlan' },
  { step: 2, name: 'workout', needs: ['WeeklyPlan'], produces: 'WorkoutWeek' },
  { step: 3, name: 'running', needs: ['WeeklyPlan', 'WorkoutWeek'], produces: 'RunningWeek' },
  { step: 4, name: 'nutrition', needs: ['WeeklyPlan', 'WorkoutWeek', 'RunningWeek'], produces: 'NutritionWeek' },
  { step: 5, name: 'meals', needs: ['NutritionWeek'], produces: 'MealPlanWeek' },
  { step: 6, name: 'storage', needs: ['everything'], produces: 'PlanSnapshot' },
  { step: 7, name: 'events', needs: ['PlanSnapshot'], produces: 'PLAN_GENERATED' },
]);

export const PlanningService = Object.freeze({
  /**
   * Build every week, in order.
   *
   * @param {string} [weekStart] ISO date; defaults to the current week
   * @param {{persist?: boolean}} [options]
   * @returns {object} every week plus the snapshot
   */
  generateWeek(weekStart = null, { persist = true } = {}) {
    const completed = [];

    /* 1–5: each service already knows how to fetch what it needs. */
    const plan = PlannerService.plan(weekStart);
    completed.push('planner');

    const workout = WorkoutPlanService.week(weekStart);
    completed.push('workout');

    const running = RunningProgramService.week(weekStart);
    completed.push('running');

    const nutrition = NutritionPlanService.week(weekStart);
    completed.push('nutrition');

    const meals = MealPlanService.week(weekStart);
    completed.push('meals');

    /* 6: record that the week existed. The weeks themselves are derived. */
    let snapshot = null;
    if (persist) {
      snapshot = saveSnapshot({ plan, workout, running, nutrition, meals });
      completed.push('storage');
    }

    /* 7: tell everything else. */
    bus.emit(EVENTS.WEEK_GENERATED, {
      weekStart: plan.startDate,
      weekNumber: plan.weekNumber,
      snapshotId: snapshot?.id ?? null,
    });
    completed.push('events');

    return { plan, workout, running, nutrition, meals, snapshot, completed };
  },

  /** Rebuild everything, ignoring every cache. */
  regenerate(weekStart = null) {
    invalidateAll();
    PlannerService.refresh(weekStart);
    WorkoutPlanService.refresh(weekStart);
    RunningProgramService.refresh(weekStart);
    NutritionPlanService.refresh(weekStart);
    MealPlanService.refresh(weekStart);
    return this.generateWeek(weekStart);
  },

  /** The pipeline description, for documentation or a diagnostics screen. */
  pipeline() { return PIPELINE; },
});

/** Store or update the snapshot for a week. */
function saveSnapshot({ plan, workout, running, nutrition, meals }) {
  const record = {
    weekStart: plan.startDate,
    weekNumber: plan.weekNumber,
    phase: plan.phase,
    goal: nutrition.goal,
    deload: plan.deload,

    gymDays: workout.days.length,
    runningDays: running.sessions.length,
    weeklySets: workout.totalWeeklySets,
    weeklyKm: running.weeklyDistanceKm,

    dailyCalories: nutrition.dailyCalories ?? undefined,
    proteinG: nutrition.proteinTargetG ?? undefined,
    mealCostMadPerDay: meals.dailyCostAverageMad,
    macroAccuracy: meals.macroAccuracy.overall,

    deficit: DEFICIT_GOALS.includes(nutrition.goal),
  };

  try {
    const existing = snapshotFor(plan.startDate);
    return existing
      ? PlanSnapshotRepository.update(existing.id, record)
      : PlanSnapshotRepository.create(record);
  } catch (error) {
    // A failed snapshot must not cost the generated week.
    log.error('[planning] could not save the week snapshot', error);
    bus.emit(EVENTS.ERROR, { source: 'PlanningService.save', error });
    return null;
  }
}
