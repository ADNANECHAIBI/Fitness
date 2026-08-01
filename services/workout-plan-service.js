/**
 * WorkoutPlanService — the only bridge between the workout engine and storage.
 *
 * The engine is pure and knows nothing about repositories. This service
 * fetches, caches and announces. Building a week for a hypothetical profile,
 * or against a fixture database, needs no engine change.
 */

import {
  ProfileRepository, SettingsRepository, GoalsRepository, WorkoutRepository,
} from '../repositories/index.js';
import { PlannerService } from './planner-service.js';
import { WorkoutEngine } from '../engines/workout-engine.js';
import { cached } from '../engines/calculation-engine.js';
import { bus, EVENTS } from '../events/index.js';

/**
 * A week is read on every render of a training screen but changes only when
 * the plan, the profile, the settings or the logged sets change.
 */
const buildWeek = cached(
  (weekStart) => WorkoutEngine.build(gatherInputs(weekStart)),
  {
    bus,
    on: [
      EVENTS.PLAN_GENERATED,
      EVENTS.PROFILE_CHANGED,
      EVENTS.SETTINGS_CHANGED,
      EVENTS.WORKOUT_LOGGED,
      EVENTS.WEIGHT_CHANGED,
      EVENTS.DATA_IMPORTED,
      EVENTS.DATA_RESET,
    ],
  }
);

/** Everything the workout engine reads. */
function gatherInputs(weekStart = null) {
  return {
    weeklyPlan: PlannerService.plan(weekStart),
    profile: ProfileRepository.get(),
    settings: SettingsRepository.get(),
    goals: GoalsRepository.all(),
    gymHistory: WorkoutRepository.all(),
  };
}

export const WorkoutPlanService = Object.freeze({
  /**
   * The lifting week.
   * @param {string} [weekStart] ISO date; defaults to the current week
   * @returns {object} WorkoutWeek
   */
  week(weekStart = null) {
    // Reading does not emit — see PlannerService for why.
    return buildWeek(weekStart);
  },

  /** Rebuild ignoring the cache. */
  refresh(weekStart = null) {
    buildWeek.invalidate();
    const rebuilt = this.week(weekStart);
    bus.emit(EVENTS.WORKOUT_WEEK_BUILT, rebuilt);
    return rebuilt;
  },

  /** One day, by date. @returns {object|null} */
  day(date, weekStart = null) {
    return this.week(weekStart).days.find((day) => day.date === date) ?? null;
  },

  /** Build against overridden inputs, without touching stored data. */
  preview(overrides = {}) {
    return WorkoutEngine.build({ ...gatherInputs(), ...overrides });
  },

  /**
   * Every decision behind a week, flattened. This is what a report generator
   * or a coaching layer reads — no logic is re-derived.
   */
  reasons(weekStart = null) {
    return WorkoutEngine.allReasons(this.week(weekStart));
  },

  inputs(weekStart = null) { return gatherInputs(weekStart); },
});
