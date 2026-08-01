/**
 * wiring.js — the chains between services.
 *
 * Nothing here calls a service from inside another. Each link is a bus
 * subscription, so a service can be removed or replaced without any other
 * service knowing it existed.
 *
 *   workout completed ─┐
 *   run completed ─────┼─▶ caches cleared ─▶ progress, recovery and the
 *   weight changed ────┘                     dashboard rebuild on next read
 *                      └─▶ notification engine writes what is worth saying
 *
 * The rebuild is lazy on purpose: a snapshot nobody asked for is work nobody
 * needed.
 */

import { bus, EVENTS } from '../events/index.js';
import { invalidate } from './cache.js';
import { startNotifications, stopNotifications } from './notification-engine.js';
import { SyncService } from './sync-service.js';

let subscriptions = [];

/** Events after which the derived snapshots are stale. */
const STALE_AFTER = Object.freeze([
  EVENTS.WORKOUT_COMPLETED,
  EVENTS.RUN_COMPLETED,
  EVENTS.WEIGHT_CHANGED,
  EVENTS.NUTRITION_LOGGED,
  EVENTS.WEEK_GENERATED,
  EVENTS.PROFILE_CHANGED,
  EVENTS.SETTINGS_CHANGED,
]);

/**
 * Connect the application layer to the bus.
 * @returns {Function} teardown
 */
export function wireApplication() {
  unwireApplication();

  for (const topic of STALE_AFTER) {
    subscriptions.push(bus.on(topic, () => {
      invalidate('dashboard');
      invalidate('progress');
      invalidate('recovery');
    }));
  }

  subscriptions.push(startNotifications());
  subscriptions.push(SyncService.start());

  return unwireApplication;
}

/** Disconnect everything. */
export function unwireApplication() {
  subscriptions.forEach((off) => { if (typeof off === 'function') off(); });
  subscriptions = [];
  stopNotifications();
  SyncService.stop();
}

/** What is wired, for a diagnostics screen. */
export function wiringStatus() {
  return {
    active: subscriptions.length > 0,
    links: subscriptions.length,
    staleAfter: [...STALE_AFTER],
  };
}
