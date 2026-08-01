/**
 * NutritionPlanService — the bridge between the nutrition engine and storage.
 *
 * The engine is pure; this fetches, caches and publishes. It reads the weeks
 * the planner, workout and running services already built rather than
 * rebuilding them, so there is one source for each.
 */

import {
  ProfileRepository, SettingsRepository, GoalsRepository,
  SessionRepository, WeeklyReportRepository,
} from '../repositories/index.js';
import { PlannerService } from './planner-service.js';
import { WorkoutPlanService } from './workout-plan-service.js';
import { RunningProgramService } from './running-program-service.js';
import { WeightService } from './weight-service.js';
import { NutritionEngine } from '../engines/nutrition-engine.js';
import { cached } from '../engines/calculation-engine.js';
import { bus, EVENTS } from '../events/index.js';

const buildWeek = cached(
  (weekStart) => NutritionEngine.build(gatherInputs(weekStart)),
  {
    bus,
    on: [
      EVENTS.PLAN_GENERATED,
      EVENTS.PROFILE_CHANGED,
      EVENTS.SETTINGS_CHANGED,
      EVENTS.WEIGHT_CHANGED,
      EVENTS.CALORIES_CHANGED,
      EVENTS.WORKOUT_COMPLETED,
      EVENTS.RUN_LOGGED,
      EVENTS.DATA_IMPORTED,
      EVENTS.DATA_RESET,
    ],
  }
);

function gatherInputs(weekStart = null) {
  return {
    weeklyPlan: PlannerService.plan(weekStart),
    workoutWeek: WorkoutPlanService.week(weekStart),
    runningWeek: RunningProgramService.week(weekStart),
    profile: ProfileRepository.get(),
    settings: SettingsRepository.get(),
    goals: GoalsRepository.all(),
    weightHistory: WeightService.history(),
    sessions: SessionRepository.all(),
    weeklyReports: WeeklyReportRepository.all(),
  };
}

export const NutritionPlanService = Object.freeze({
  /** The nutrition week. @returns {object} NutritionWeek */
  week(weekStart = null) {
    // Reading does not emit — see PlannerService for why.
    return buildWeek(weekStart);
  },

  refresh(weekStart = null) {
    buildWeek.invalidate();
    const rebuilt = this.week(weekStart);
    bus.emit(EVENTS.NUTRITION_WEEK_BUILT, rebuilt);
    return rebuilt;
  },

  /** One day's targets. @returns {object|null} */
  day(date, weekStart = null) {
    return this.week(weekStart).days.find((day) => day.date === date) ?? null;
  },

  /** Build against overridden inputs without touching stored data. */
  preview(overrides = {}) {
    return NutritionEngine.build({ ...gatherInputs(), ...overrides });
  },

  /** Every decision behind the week, flattened. */
  reasons(weekStart = null) {
    return NutritionEngine.allReasons(this.week(weekStart));
  },

  inputs(weekStart = null) { return gatherInputs(weekStart); },
});
