/**
 * PlannerService — the only thing that connects the planner to stored data.
 *
 * The engine is pure and knows nothing about repositories. This service does
 * the fetching, caches the result and announces it. Swapping storage, or
 * running the planner against a hypothetical week, needs no engine change.
 */

import {
  ProfileRepository, SettingsRepository, ScheduleRepository,
  GoalsRepository, RunningRepository, WorkoutRepository,
} from '../repositories/index.js';
import { WeightService } from './weight-service.js';
import { PlannerEngine } from '../engines/planner-engine.js';
import { cached } from '../engines/calculation-engine.js';
import { bus, EVENTS } from '../events/index.js';

/**
 * Plans are read often and change only when the data behind them does, so the
 * result is memoised and cleared by event (rule 9 from Phase 4).
 */
const buildPlan = cached(
  (weekStart) => PlannerEngine.plan(gatherInputs(weekStart)),
  {
    bus,
    on: [
      EVENTS.PROFILE_CHANGED,
      EVENTS.WEIGHT_CHANGED,
      EVENTS.SETTINGS_CHANGED,
      EVENTS.WORKOUT_LOGGED,
      EVENTS.RUN_LOGGED,
      EVENTS.DATA_IMPORTED,
      EVENTS.DATA_RESET,
    ],
  }
);

/** Collect everything the planner reads. Nothing else touches repositories. */
function gatherInputs(weekStart = null) {
  return {
    profile: ProfileRepository.get(),
    settings: SettingsRepository.get(),
    schedule: ScheduleRepository.all(),
    goals: GoalsRepository.all(),
    weightHistory: WeightService.history(),
    runningHistory: RunningRepository.all(),
    gymHistory: WorkoutRepository.all(),
    weekStart,
  };
}

export const PlannerService = Object.freeze({
  /**
   * The plan for a week.
   * @param {string} [weekStart] ISO date; defaults to the current week
   * @returns {object} WeeklyPlan
   */
  plan(weekStart = null) {
    // Reading does not emit. Publishing from a getter meant every read
    // invalidated the caches listening for it, so the recovery snapshot was
    // rebuilt on every single call and never once served from cache.
    return buildPlan(weekStart);
  },

  /** Rebuild ignoring the cache. */
  refresh(weekStart = null) {
    buildPlan.invalidate();
    const rebuilt = this.plan(weekStart);
    bus.emit(EVENTS.PLAN_GENERATED, rebuilt);
    return rebuilt;
  },

  /** Plan a hypothetical week without touching stored data. */
  preview(overrides = {}) {
    return PlannerEngine.plan({ ...gatherInputs(), ...overrides });
  },

  /** Everything the planner read, for a "why did it decide that?" screen. */
  inputs(weekStart = null) { return gatherInputs(weekStart); },
});
