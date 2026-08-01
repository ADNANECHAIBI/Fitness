/**
 * ExecutionService — the bridge between the execution engine and storage.
 *
 * The engine is pure and returns events; this service persists the session and
 * publishes those events on the bus. It is also where the loop closes: a
 * completed session is written back as Gym records, which is what next week's
 * workout engine reads.
 */

import { SessionRepository, WorkoutRepository, activeSession } from '../repositories/index.js';
import { WorkoutPlanService } from './workout-plan-service.js';
import { ExecutionEngine } from '../engines/execution-engine.js';
import { bus, EVENTS } from '../events/index.js';
import { createLogger } from '../scripts/logger.js';

const log = createLogger('execution');

/** Engine event type → bus topic. */
const TOPICS = {
  SESSION_STARTED: EVENTS.SESSION_STARTED,
  SESSION_PAUSED: EVENTS.SESSION_PAUSED,
  SESSION_RESUMED: EVENTS.SESSION_RESUMED,
  SESSION_CANCELLED: EVENTS.SESSION_CANCELLED,
  SESSION_SKIPPED: EVENTS.SESSION_SKIPPED,
  SET_COMPLETED: EVENTS.SET_COMPLETED,
  SET_FAILED: EVENTS.SET_FAILED,
  EXERCISE_FINISHED: EVENTS.EXERCISE_FINISHED,
  EXERCISE_SKIPPED: EVENTS.EXERCISE_SKIPPED,
  WORKOUT_COMPLETED: EVENTS.WORKOUT_COMPLETED,
  PR_ACHIEVED: EVENTS.PR_ACHIEVED,
};

function publish(events, session) {
  for (const event of events) {
    const topic = TOPICS[event.type];
    if (topic) bus.emit(topic, { ...event, sessionId: session.id, date: session.date });
  }
}

/**
 * Run an engine operation, persist the result, publish what happened.
 * @returns {{session: object, events: object[], rejected: object|null}}
 */
function apply(session, operation) {
  const outcome = operation(session);

  if (outcome.rejected) {
    // A refused transition is not an error the app should crash on; it is an
    // answer. The caller gets the reason and the session is untouched.
    log.info(`[execution] ${outcome.rejected.action} refused: ${outcome.rejected.message}`);
    return outcome;
  }

  const saved = session.id
    ? SessionRepository.update(session.id, outcome.session)
    : SessionRepository.create(outcome.session);

  publish(outcome.events, saved);
  return { ...outcome, session: saved };
}

export const ExecutionService = Object.freeze({
  /** The session in progress, if any. */
  active() { return activeSession(); },

  /** Every session, newest first. */
  all() { return SessionRepository.all(); },

  byDate(date) { return SessionRepository.byDate(date); },

  /**
   * Begin the session planned for a date.
   * @param {string} date ISO date
   */
  start(date, options = {}) {
    const existing = SessionRepository.byDate(date)
      .find((session) => session.state === 'started' || session.state === 'paused');
    if (existing) return { session: existing, events: [], rejected: null };

    const day = WorkoutPlanService.day(date);
    if (!day) {
      return {
        session: null, events: [],
        rejected: { action: 'start', message: `No lifting session is planned for ${date}.` },
      };
    }

    const week = WorkoutPlanService.week();
    const planned = ExecutionEngine.fromDay(day, { weekNumber: week.weekNumber });
    const created = SessionRepository.create(planned);

    return apply(created, (session) => ExecutionEngine.start(session, options));
  },

  logSet(session, exerciseId, entry) {
    return apply(session, (current) => ExecutionEngine.logSet(current, exerciseId, entry));
  },

  skipExercise(session, exerciseId, options = {}) {
    return apply(session, (current) => ExecutionEngine.skipExercise(current, exerciseId, options));
  },

  pause(session, options = {}) {
    return apply(session, (current) => ExecutionEngine.pause(current, options));
  },

  resume(session, options = {}) {
    return apply(session, (current) => ExecutionEngine.resume(current, options));
  },

  cancel(session, options = {}) {
    return apply(session, (current) => ExecutionEngine.cancel(current, options));
  },

  /** Skip a planned session without starting it. */
  skip(date, options = {}) {
    const day = WorkoutPlanService.day(date);
    if (!day) {
      return { session: null, events: [], rejected: { action: 'skip', message: `Nothing is planned for ${date}.` } };
    }
    const created = SessionRepository.create(ExecutionEngine.fromDay(day));
    return apply(created, (session) => ExecutionEngine.skip(session, options));
  },

  /**
   * Finish a session. Writes the logged work back as Gym records, which is
   * what next week's programme is built from.
   */
  complete(session, options = {}) {
    const outcome = apply(session, (current) =>
      ExecutionEngine.complete(current, { ...options, history: SessionRepository.all() }));

    if (outcome.rejected) return outcome;

    let written = 0;
    for (const row of ExecutionEngine.toGymRecords(outcome.session)) {
      try {
        WorkoutRepository.create(row);
        written += 1;
      } catch (error) {
        // One malformed row must not cost the whole session's history.
        log.error('[execution] could not log a set', error);
      }
    }

    return { ...outcome, loggedRows: written };
  },

  /** Live totals for a running session, without changing it. */
  progress(session) { return ExecutionEngine.progress(session); },

  /** Every reason attached to a session — for a report or a coaching layer. */
  reasons(session) { return session?.reasons ?? []; },
});
