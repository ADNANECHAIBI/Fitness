/**
 * AdjustmentService — turns an engine decision into something the app can show.
 *
 * The engine decides; this service supplies the data it needs and announces
 * the outcome. Applying a decision is always explicit: nothing changes the
 * intake target behind the user's back.
 */

import { ProfileRepository } from '../repositories/index.js';
import { WeightService } from './weight-service.js';
import { CaloriesService } from './calories-service.js';
import { AdjustmentEngine, ACTION } from '../engines/adjustment-engine.js';
import { bus, EVENTS } from '../events/index.js';

export const AdjustmentService = Object.freeze({
  /**
   * Should the daily calorie target move, and why?
   * @returns {object} always a decision with a reason — never a bare number
   */
  review() {
    const profile = ProfileRepository.get();
    const target = CaloriesService.target(profile);

    return AdjustmentEngine.evaluate({
      readings: WeightService.history(),
      currentWeightKg: profile?.weightKg ?? null,
      goal: profile?.goal ?? 'maintain',
      currentTargetKcal: target?.calories ?? null,
      maintenanceKcal: target?.tdee ?? null,
    });
  },

  /** True when the current review asks for a change. */
  isChange(decision) { return AdjustmentEngine.isChange(decision); },

  ACTION,
});

export { ACTION };
