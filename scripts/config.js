/**
 * config.js
 * Single source of truth for app-wide constants.
 * Change the version here when you ship; the service worker reads its own
 * copy (it cannot import ES modules) — keep the two in sync.
 */

const VERSION = '2.3.3';
/** Bumped when the stored shape changes, so an old backup can be detected. */
const SCHEMA_VERSION = 1;

export const APP = Object.freeze({
  name: 'Foundation',
  version: VERSION,
  schemaVersion: SCHEMA_VERSION,
  /**
   * The two together. A backup file carries this so a reader can tell which
   * exact shipped combination wrote it — two builds can share a version
   * while differing in stored shape, and that is the pair that matters when
   * deciding whether a file needs migrating.
   */
  build: `${VERSION}+schema.${SCHEMA_VERSION}`,
});

/**
 * The folder the app is served from, e.g. "/" or "/fitness-app/".
 * Derived from this module's own URL, so the app works from any sub-path
 * without configuration. scripts/config.js → ".." is the app root.
 */
export const BASE = new URL('..', import.meta.url).pathname;

/**
 * How routes appear in the address bar.
 *   'hash'    → /app/#/gym   works on any static host, no server rules needed.
 *   'history' → /app/gym     cleaner, but the host must rewrite every in-scope
 *                            URL to index.html or a refresh returns 404.
 * Both modes use history.pushState(), so the back button behaves the same.
 */
export const ROUTER_MODE = 'hash';

/**
 * How much the app logs. 'debug' while developing, 'info' in normal use,
 * 'silent' to turn it off entirely. Read once at boot by script.js.
 */
export const LOG_LEVEL = 'info';

/** Prefix for every key written to localStorage. Keeps the namespace clean. */
export const STORAGE_PREFIX = 'foundation';

/**
 * Every storage key in the app. One key per repository — nothing else may
 * invent a key, so the whole footprint is visible in this one object.
 */
export const KEYS = Object.freeze({
  PROFILE:        'profile',        // document
  SETTINGS:       'settings',       // document
  GOALS:          'goals',          // collection
  SCHEDULE:       'schedule',       // collection
  MEASUREMENTS:   'measurements',   // collection
  RUNS:           'runs',           // collection
  WORKOUTS:       'workouts',       // collection
  NUTRITION:      'nutrition',      // collection
  SUPPLEMENTS:    'supplements',    // collection
  WEEKLY_REPORTS: 'weekly-reports', // collection
  SESSIONS:       'sessions',       // collection
  NOTIFICATIONS:  'notifications',  // collection
  PLAN_SNAPSHOTS: 'plan-snapshots', // collection
  ONBOARDING:     'onboarding',     // wizard draft, cleared on finish
});
