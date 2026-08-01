/**
 * events.js — the event vocabulary.
 *
 * Every name is declared here so a typo cannot silently create a topic nobody
 * listens to. Names read as "domain:what-happened", past tense: an event
 * reports a fact, it does not command anyone.
 */

export const EVENTS = Object.freeze({
  // Data lifecycle — emitted by repositories, one per write.
  RECORD_CREATED: 'data:record-created',
  RECORD_UPDATED: 'data:record-updated',
  RECORD_DELETED: 'data:record-deleted',
  DOCUMENT_SAVED: 'data:document-saved',

  // Domain facts — emitted by services when something meaningful changes.
  WEIGHT_CHANGED:   'weight:changed',
  CALORIES_CHANGED: 'calories:changed',
  GOAL_CHANGED:     'goal:changed',
  PROFILE_CHANGED:  'profile:changed',
  SETTINGS_CHANGED: 'settings:changed',
  RUN_LOGGED:       'running:logged',
  WORKOUT_LOGGED:   'workout:logged',
  NUTRITION_LOGGED: 'nutrition:logged',
  PLAN_GENERATED:   'planner:generated',
  WORKOUT_WEEK_BUILT: 'workout:week-built',

  // Execution — one per thing that happens inside a session.
  SESSION_STARTED:   'session:started',
  SESSION_PAUSED:    'session:paused',
  SESSION_RESUMED:   'session:resumed',
  SESSION_CANCELLED: 'session:cancelled',
  SESSION_SKIPPED:   'session:skipped',
  SET_COMPLETED:     'session:set-completed',
  SET_FAILED:        'session:set-failed',
  EXERCISE_FINISHED: 'session:exercise-finished',
  EXERCISE_SKIPPED:  'session:exercise-skipped',
  WORKOUT_COMPLETED: 'session:workout-completed',
  PR_ACHIEVED:       'session:personal-record',

  // Running execution.
  RUN_STARTED:   'run:started',
  RUN_PAUSED:    'run:paused',
  RUN_RESUMED:   'run:resumed',
  RUN_CANCELLED: 'run:cancelled',
  RUN_SKIPPED:   'run:skipped',
  RUN_COMPLETED: 'run:completed',

  NUTRITION_WEEK_BUILT: 'nutrition:week-built',
  MEAL_PLAN_BUILT:      'meals:plan-built',

  // Application layer.
  WEEK_GENERATED:       'app:week-generated',
  WEEK_CLOSED:          'app:week-closed',
  NOTIFICATION_CREATED: 'app:notification-created',

  // App level.
  DATA_IMPORTED: 'app:data-imported',
  DATA_RESET:    'app:data-reset',
  ONBOARDED:     'app:onboarded',
  ERROR:         'app:error',
});

/** Wildcard topic: a listener registered on this receives every event. */
export const ALL = '*';
