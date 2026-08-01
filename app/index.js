/**
 * app/index.js — the application layer.
 *
 * Everything below this line is engines, rules and repositories. Everything
 * above it is a consumer: a screen, a command line, a test. The layer holds no
 * business logic — it orchestrates, caches and answers questions.
 *
 * Boot with `startApplication()` once, at the composition root.
 */

export { PlanningService, PIPELINE } from './planning-service.js';
export { DashboardService } from './dashboard-service.js';
export { AnalyticsService } from './analytics-service.js';
export { CoachService } from './coach-service.js';
export { ProgressService } from './progress-service.js';
export { RecoveryService } from './recovery-service.js';
export { ReportService } from './report-service.js';
export { InsightsService } from './insights-service.js';
export { SyncService } from './sync-service.js';
export { NotificationEngine } from './notification-engine.js';
export { Queries } from './queries.js';
export { Forms, FORMS } from './forms.js';
export { Actions } from './actions.js';
export { Cache, register, invalidate, invalidateAll, stats } from './cache.js';
export { wireApplication, unwireApplication, wiringStatus } from './wiring.js';

import { wireApplication, unwireApplication } from './wiring.js';
import { Queries } from './queries.js';
import { Forms } from './forms.js';
import { Actions } from './actions.js';
import { NutritionPlanService } from '../services/nutrition-plan-service.js';
import { MealPlanService } from '../services/meal-plan-service.js';
import { PlanningService } from './planning-service.js';

/**
 * Start the application layer.
 *
 * @returns {Function} teardown, for tests and for hot reloading
 */
export function startApplication() {
  /*
   * The notification engine needs the nutrition targets to judge an intake
   * against, but importing a service into it would couple the two. A small
   * registry keeps the dependency one-way and optional.
   */
  globalThis.__foundationServices = { NutritionPlanService, MealPlanService };

  return wireApplication();
}

export function stopApplication() {
  unwireApplication();
  delete globalThis.__foundationServices;
}

/** Everything a consumer needs, in one object. */
export const App = Object.freeze({
  start: startApplication,
  stop: stopApplication,
  query: Queries,
  planning: PlanningService,
  forms: Forms,
  actions: Actions,
});
