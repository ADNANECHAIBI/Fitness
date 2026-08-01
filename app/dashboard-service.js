/**
 * DashboardService — what matters today, from every engine at once.
 *
 * Phase 18 emptied this file of decisions. It used to subtract logged intake
 * from the day's target and to order today's list itself, which meant the
 * application layer held two pieces of domain logic that belonged beside the
 * priorities the planner assigns. Both moved into `engines/dashboard-engine.js`.
 *
 * What is left is the job this layer actually has: reading. It asks each
 * service for the result its engine already produced, hands the lot to the
 * dashboard engine as plain data, and caches the answer. It calculates
 * nothing, decides nothing, and words nothing.
 *
 * The gathering sits inside the cached function on purpose. A second read of
 * an unchanged day must not call eight services again — the point of the
 * cache is not to skip the assembly, which is cheap, but to skip the eight
 * reads underneath it.
 */

import { PlannerService } from '../services/planner-service.js';
import { WorkoutPlanService } from '../services/workout-plan-service.js';
import { RunningProgramService } from '../services/running-program-service.js';
import { NutritionPlanService } from '../services/nutrition-plan-service.js';
import { MealPlanService } from '../services/meal-plan-service.js';
import { NutritionService } from '../services/nutrition-service.js';
import { WeightService } from '../services/weight-service.js';
import { ExecutionService } from '../services/execution-service.js';
import { SettingsRepository } from '../repositories/index.js';
import { RecoveryService } from './recovery-service.js';
import { ReportService } from './report-service.js';
import { InsightsService } from './insights-service.js';
import { NotificationEngine } from './notification-engine.js';
import { register, GLOBAL_INVALIDATION } from './cache.js';
import { EVENTS } from '../events/index.js';
import { DashboardEngine } from '../engines/dashboard-engine.js';
import { startOfWeek } from '../engines/plan-context.js';
import { today } from '../models/index.js';
import { createLogger } from '../scripts/logger.js';

const log = createLogger('dashboard');

/**
 * Read one source, or record that it could not be read.
 *
 * A gap is data. The engine names which engine went quiet and shows null
 * where its figures would have been, so a report that throws degrades the
 * snapshot instead of emptying it.
 */
function attempt(name, read) {
  try {
    return read() ?? null;
  } catch (error) {
    log.error(`[dashboard] ${name} could not be read`, error);
    return null;
  }
}

/**
 * Everything the engine needs for one day.
 *
 * The week's report and insight set are read through their own services,
 * which are cached and cleared by the same events as this one — so a
 * dashboard read costs one report build per week, not one per day.
 */
function gather(date) {
  const plan = attempt('plan', () => PlannerService.plan());
  const weekStart = startOfWeek(date);

  return {
    date,
    plan,
    planDay: (plan?.days ?? []).find((day) => day.date === date) ?? null,

    workout: attempt('workout', () => WorkoutPlanService.day(date)),
    run: attempt('run', () => RunningProgramService.session(date)),
    nutrition: attempt('nutrition', () => NutritionPlanService.day(date)),
    meals: attempt('meals', () => MealPlanService.day(date)),

    logged: attempt('logged', () => NutritionService.byDate(date)),
    session: attempt('session', () => ExecutionService.active()),
    recovery: attempt('recovery', () => RecoveryService.snapshot()),

    report: attempt('report', () => ReportService.analyze(weekStart)),
    insights: attempt('insights', () => InsightsService.week(weekStart)),

    weightProgress: attempt('weight', () => WeightService.progress()),
    notifications: attempt('notifications', () => NotificationEngine.unread()) ?? [],
    settings: attempt('settings', () => SettingsRepository.get()) ?? {},
  };
}

const build = register('dashboard', (date = today()) =>
  DashboardEngine.snapshot(gather(date)), [
  ...GLOBAL_INVALIDATION,
  EVENTS.PLAN_GENERATED,
  EVENTS.WEEK_GENERATED,
  EVENTS.WEEK_CLOSED,
  EVENTS.WORKOUT_LOGGED,
  EVENTS.WORKOUT_COMPLETED,
  EVENTS.RUN_LOGGED,
  EVENTS.RUN_COMPLETED,
  EVENTS.NUTRITION_LOGGED,
  EVENTS.WEIGHT_CHANGED,
  EVENTS.SESSION_STARTED,
  EVENTS.NOTIFICATION_CREATED,
]);

export const DashboardService = Object.freeze({
  /** @returns {object} DashboardSnapshot */
  snapshot(date = today()) { return build(date); },

  refresh(date = today()) { build.invalidate(); return build(date); },

  /** One figure from the snapshot, taken apart. @returns {object|null} */
  explain(figureKey, date = today()) { return build(date).explain(figureKey); },

  /** What the engine was handed. For debugging, not for display. */
  inputs(date = today()) { return gather(date); },
});
