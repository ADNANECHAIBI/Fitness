/**
 * services/index.js — barrel export.
 *
 * A service holds the rules that span more than one record or repository.
 * It may read repositories and emit events; it never touches storage or
 * the DOM, which is what keeps it testable.
 */

export { WeightService } from './weight-service.js';
export { CaloriesService, ACTIVITY_FACTOR, GOAL_ADJUSTMENT } from './calories-service.js';
export { RunningService, formatPace } from './running-service.js';
export { WorkoutService } from './workout-service.js';
export { NutritionService } from './nutrition-service.js';
export { BackupService } from './backup-service.js';
export { AdjustmentService, ACTION } from './adjustment-service.js';
export { PlannerService } from './planner-service.js';
export { WorkoutPlanService } from './workout-plan-service.js';
export { ExecutionService } from './execution-service.js';
export { RunningProgramService } from './running-program-service.js';
export { NutritionPlanService } from './nutrition-plan-service.js';
export { MealPlanService } from './meal-plan-service.js';
