/**
 * cache.js — one place to see and clear what the application layer caches.
 *
 * It adds no caching mechanism of its own. The memoisation with event-driven
 * invalidation already exists in the calculation engine; this is a registry
 * over it, so a cache can be named, listed, inspected and cleared without
 * every service inventing its own approach.
 */

import { cached } from '../engines/calculation-engine.js';
import { bus, EVENTS } from '../events/index.js';

/** name → { fn, topics, hits, misses } */
const registry = new Map();

/**
 * Register a cached computation.
 *
 * @param {string} name              what it holds, for inspection
 * @param {Function} compute
 * @param {string[]} invalidateOn    bus topics that clear it
 * @returns {Function} the cached function, with .invalidate()
 */
export function register(name, compute, invalidateOn = []) {
  let hits = 0;
  let misses = 0;

  // Count a miss whenever the underlying function actually runs.
  const counted = (...args) => { misses += 1; return compute(...args); };

  const fn = cached(counted, { bus, on: invalidateOn });

  const wrapped = (...args) => {
    const before = misses;
    const value = fn(...args);
    if (misses === before) hits += 1;
    return value;
  };

  wrapped.invalidate = () => fn.invalidate();

  registry.set(name, {
    fn: wrapped,
    topics: invalidateOn,
    stats: () => ({ name, hits, misses, topics: invalidateOn }),
    reset: () => { hits = 0; misses = 0; },
  });

  return wrapped;
}

/** Clear one cache by name. @returns {boolean} */
export function invalidate(name) {
  const entry = registry.get(name);
  if (!entry) return false;
  entry.fn.invalidate();
  return true;
}

/** Clear everything the application layer has cached. */
export function invalidateAll() {
  for (const entry of registry.values()) entry.fn.invalidate();
  return registry.size;
}

/** What is cached, what clears it, and how often it has been useful. */
export function stats() {
  return [...registry.values()].map((entry) => entry.stats());
}

/** Reset the counters. Used by tests, not by the app. */
export function resetStats() {
  for (const entry of registry.values()) entry.reset();
}

/** Topics that should clear almost everything. */
export const GLOBAL_INVALIDATION = Object.freeze([
  EVENTS.DATA_IMPORTED,
  EVENTS.DATA_RESET,
  EVENTS.PROFILE_CHANGED,
  EVENTS.SETTINGS_CHANGED,
]);

export const Cache = Object.freeze({ register, invalidate, invalidateAll, stats, resetStats });
