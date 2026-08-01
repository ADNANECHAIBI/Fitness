/**
 * reactions.js — the wiring between domains.
 *
 * This is the only file that knows one change should cause another. Keeping
 * it in one place means no service has to import another just to notify it,
 * and the chain of consequences can be read top to bottom.
 *
 * Called once, from script.js, at boot.
 */

import { bus, EVENTS } from '../events/index.js';
import { CaloriesService } from './calories-service.js';
import { WeightService } from './weight-service.js';

export function wireReactions() {
  const off = [];

  // Weight moved → calorie targets are stale, and a weight goal may be met.
  off.push(bus.on(EVENTS.WEIGHT_CHANGED, () => {
    CaloriesService.refresh();
    WeightService.syncGoals();
  }));

  // Anything on the profile (age, activity, goal) feeds the calorie maths.
  off.push(bus.on(EVENTS.PROFILE_CHANGED, () => {
    CaloriesService.refresh();
  }));

  // A restore or a reset replaces everything underneath the app.
  off.push(bus.on(EVENTS.DATA_IMPORTED, () => CaloriesService.refresh()));
  off.push(bus.on(EVENTS.DATA_RESET, () => bus.emit(EVENTS.CALORIES_CHANGED, null)));

  /** Tear down every reaction. Returns nothing useful except in tests. */
  return () => off.forEach((unsubscribe) => unsubscribe());
}
