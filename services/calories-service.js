/**
 * CaloriesService — the app's access point for energy numbers.
 *
 * It owns no maths. Every equation lives in the energy engine; this service
 * only supplies the profile, caches the result and announces changes.
 * Its public shape is unchanged from Phase 3.
 */

import { ProfileRepository } from '../repositories/index.js';
import { bus, EVENTS } from '../events/index.js';
import { EnergyEngine } from '../engines/energy-engine.js';
import { cached } from '../engines/calculation-engine.js';
import { ACTIVITY_FACTOR, GOAL_ADJUSTMENT } from '../engines/constants.js';

/**
 * Targets are read on nearly every render but change only when the profile
 * does, so the result is memoised and cleared by event (rule 9).
 */
const computeTarget = cached(
  (profile) => EnergyEngine.target(profile ?? {}),
  {
    bus,
    on: [
      EVENTS.PROFILE_CHANGED,
      EVENTS.WEIGHT_CHANGED,
      EVENTS.DATA_IMPORTED,
      EVENTS.DATA_RESET,
    ],
  }
);

export const CaloriesService = Object.freeze({
  /** Basal metabolic rate in kcal/day, or null when the profile is incomplete. */
  bmr(profile = ProfileRepository.get()) {
    return EnergyEngine.bmr(profile ?? {});
  },

  /** Total daily energy expenditure in kcal/day, or null. */
  tdee(profile = ProfileRepository.get()) {
    return EnergyEngine.tdee(profile ?? {});
  },

  /**
   * The daily target and macro split for the profile's goal.
   * @returns {{calories, proteinG, carbsG, fatG, tdee, bmr, adjustment}|null}
   */
  target(profile = ProfileRepository.get()) {
    return computeTarget(profile);
  },

  /** Recompute and announce — call after anything that changes the profile. */
  refresh() {
    computeTarget.invalidate();
    const target = this.target();
    bus.emit(EVENTS.CALORIES_CHANGED, target);
    return target;
  },

  /** Which equations produced these numbers, with their sources. */
  formulas() {
    return EnergyEngine.formulas();
  },
});

// Re-exported so Phase 3 imports keep working.
export { ACTIVITY_FACTOR, GOAL_ADJUSTMENT };
