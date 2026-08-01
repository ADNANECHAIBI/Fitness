/**
 * MealPlanService — the bridge between the meal engine and storage.
 *
 * The engine is pure; this fetches, caches and publishes. It reads the
 * nutrition week the nutrition service already built rather than rebuilding
 * targets, so there is exactly one source for every number.
 */

import { ProfileRepository, SettingsRepository, GoalsRepository } from '../repositories/index.js';
import { NutritionPlanService } from './nutrition-plan-service.js';
import { WorkoutPlanService } from './workout-plan-service.js';
import { RunningProgramService } from './running-program-service.js';
import { MealPlanningEngine } from '../engines/meal-planning-engine.js';
import { cached } from '../engines/calculation-engine.js';
import { bus, EVENTS } from '../events/index.js';

const buildPlan = cached(
  (weekStart) => MealPlanningEngine.build(gatherInputs(weekStart)),
  {
    bus,
    on: [
      EVENTS.NUTRITION_WEEK_BUILT,
      EVENTS.PROFILE_CHANGED,
      EVENTS.SETTINGS_CHANGED,
      EVENTS.WEIGHT_CHANGED,
      EVENTS.DATA_IMPORTED,
      EVENTS.DATA_RESET,
    ],
  }
);

function gatherInputs(weekStart = null) {
  return {
    nutritionWeek: NutritionPlanService.week(weekStart),
    workoutWeek: WorkoutPlanService.week(weekStart),
    runningWeek: RunningProgramService.week(weekStart),
    profile: ProfileRepository.get(),
    settings: SettingsRepository.get(),
    goals: GoalsRepository.all(),
  };
}

export const MealPlanService = Object.freeze({
  /** The week of meals. @returns {object} MealPlanWeek */
  week(weekStart = null) {
    // Reading does not emit — see PlannerService for why.
    return buildPlan(weekStart);
  },

  refresh(weekStart = null) {
    buildPlan.invalidate();
    const rebuilt = this.week(weekStart);
    bus.emit(EVENTS.MEAL_PLAN_BUILT, rebuilt);
    return rebuilt;
  },

  /** One day's meals. @returns {object|null} */
  day(date, weekStart = null) {
    return this.week(weekStart).days.find((day) => day.date === date) ?? null;
  },

  /** One meal. @returns {object|null} */
  meal(date, slot, weekStart = null) {
    return this.day(date, weekStart)?.meals.find((meal) => meal.slot === slot) ?? null;
  },

  /** A shopping-quantity roll-up: food id → total grams and cost for the week. */
  totals(weekStart = null) {
    const totals = new Map();

    for (const day of this.week(weekStart).days) {
      for (const meal of day.meals) {
        for (const food of meal.foods) {
          const entry = totals.get(food.foodId) ?? { foodId: food.foodId, name: food.name, grams: 0, costMad: 0 };
          entry.grams += food.quantity;
          entry.costMad = Math.round((entry.costMad + (food.costMad ?? 0)) * 100) / 100;
          totals.set(food.foodId, entry);
        }
      }
    }

    return [...totals.values()].sort((a, b) => b.costMad - a.costMad);
  },

  /** Build against overridden inputs without touching stored data. */
  preview(overrides = {}) {
    return MealPlanningEngine.build({ ...gatherInputs(), ...overrides });
  },

  /** Every decision behind the plan, flattened — week, day, meal and food. */
  reasons(weekStart = null) {
    return MealPlanningEngine.allReasons(this.week(weekStart));
  },

  inputs(weekStart = null) { return gatherInputs(weekStart); },
});
