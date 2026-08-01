/**
 * RunningProgramService — the bridge between the running engines and storage.
 *
 * The engines are pure; this fetches, caches, persists and publishes. Logging
 * a finished run goes through the existing RunningService rather than a second
 * path, so there is one way runs enter the system.
 */

import { ProfileRepository, SettingsRepository, GoalsRepository, RunningRepository } from '../repositories/index.js';
import { PlannerService } from './planner-service.js';
import { WorkoutPlanService } from './workout-plan-service.js';
import { RunningService } from './running-service.js';
import { RunningProgramEngine } from '../engines/running-program-engine.js';
import { RunningProgressEngine } from '../engines/running-progress-engine.js';
import { RunningExecutionEngine } from '../engines/running-execution-engine.js';
import { cached } from '../engines/calculation-engine.js';
import { bus, EVENTS } from '../events/index.js';
import { createLogger } from '../scripts/logger.js';

const log = createLogger('running');

/** Engine event type → bus topic. */
const TOPICS = {
  RUN_STARTED: EVENTS.RUN_STARTED,
  RUN_PAUSED: EVENTS.RUN_PAUSED,
  RUN_RESUMED: EVENTS.RUN_RESUMED,
  RUN_CANCELLED: EVENTS.RUN_CANCELLED,
  RUN_SKIPPED: EVENTS.RUN_SKIPPED,
  RUN_COMPLETED: EVENTS.RUN_COMPLETED,
};

const buildWeek = cached(
  (weekStart) => RunningProgramEngine.build(gatherInputs(weekStart)),
  {
    bus,
    on: [
      EVENTS.PLAN_GENERATED,
      EVENTS.PROFILE_CHANGED,
      EVENTS.SETTINGS_CHANGED,
      EVENTS.RUN_LOGGED,
      EVENTS.WORKOUT_LOGGED,
      EVENTS.DATA_IMPORTED,
      EVENTS.DATA_RESET,
    ],
  }
);

function gatherInputs(weekStart = null) {
  return {
    weeklyPlan: PlannerService.plan(weekStart),
    workoutWeek: WorkoutPlanService.week(weekStart),
    profile: ProfileRepository.get(),
    settings: SettingsRepository.get(),
    goals: GoalsRepository.all(),
    runningHistory: RunningRepository.all(),
  };
}

function publish(events, execution) {
  for (const event of events) {
    const topic = TOPICS[event.type];
    if (topic) bus.emit(topic, { ...event, date: execution?.date });
  }
}

export const RunningProgramService = Object.freeze({
  /** The running week. @returns {object} RunningWeek */
  week(weekStart = null) { return buildWeek(weekStart); },

  refresh(weekStart = null) {
    buildWeek.invalidate();
    return this.week(weekStart);
  },

  /** One session, by date. */
  session(date, weekStart = null) {
    return this.week(weekStart).sessions.find((session) => session.date === date) ?? null;
  },

  /** Every progress metric from the logged history. */
  progress(options = {}) {
    return RunningProgressEngine.summary(RunningRepository.all(), options);
  },

  /** Begin a planned run. @returns {object} RunningExecution */
  start(date, options = {}) {
    const session = this.session(date);
    if (!session) return { session: null, events: [], rejected: { action: 'start', message: `No run is planned for ${date}.` } };

    const week = this.week();
    const execution = RunningExecutionEngine.fromSession(session, { weekNumber: week.weekNumber });
    const outcome = RunningExecutionEngine.start(execution, options);
    publish(outcome.events, outcome.session);
    return outcome;
  },

  pause(execution, options = {}) { return step(RunningExecutionEngine.pause(execution, options)); },
  resume(execution, options = {}) { return step(RunningExecutionEngine.resume(execution, options)); },
  cancel(execution, options = {}) { return step(RunningExecutionEngine.cancel(execution, options)); },
  skip(execution, options = {}) { return step(RunningExecutionEngine.skip(execution, options)); },

  /**
   * Finish a run and log it. Logging goes through RunningService, so the
   * RUN_LOGGED event fires once and every cache clears the same way.
   */
  complete(execution, actual = {}) {
    const outcome = RunningExecutionEngine.complete(execution, actual);
    if (outcome.rejected) return outcome;

    publish(outcome.events, outcome.session);

    let logged = 0;
    for (const row of RunningExecutionEngine.toRunRecords(outcome.session)) {
      try {
        RunningService.log(row);
        logged += 1;
      } catch (error) {
        log.error('[running] could not log the run', error);
      }
    }

    return { ...outcome, loggedRows: logged };
  },

  inputs(weekStart = null) { return gatherInputs(weekStart); },
});

/** Publish an engine outcome unless it was refused. */
function step(outcome) {
  if (!outcome.rejected) publish(outcome.events, outcome.session);
  return outcome;
}
