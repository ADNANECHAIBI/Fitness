/**
 * RunningService — logging runs and summarising them.
 * Pace is always derived here, never stored, so it cannot contradict the
 * distance and time it came from.
 */

import { RunningRepository } from '../repositories/index.js';
import { bus, EVENTS } from '../events/index.js';
import { RunningEngine } from '../engines/running-engine.js';

/** Seconds per kilometre → "m:ss". Kept as a named export for Phase 3 callers. */
export const formatPace = (secondsPerKm) => RunningEngine.formatPace(secondsPerKm);

export const RunningService = Object.freeze({
  /**
   * Log a run.
   * @throws {ValidationError}
   */
  log(input) {
    const run = RunningRepository.create(input);
    bus.emit(EVENTS.RUN_LOGGED, run);
    return run;
  },

  /** Pace in seconds per km for one run, or null. */
  paceSecPerKm(run) {
    return RunningEngine.paceSecPerKm(run ?? {});
  },

  /** Estimated energy cost of a run, in kcal. Needs body weight. */
  energyKcal(run, weightKg) {
    return RunningEngine.energyKcal({ ...run, weightKg });
  },

  /** A run with pace attached, ready to display. */
  withPace(run) {
    const pace = this.paceSecPerKm(run);
    return { ...run, paceSecPerKm: pace, pace: formatPace(pace) };
  },

  /** The most recent run, or null. */
  latest() {
    const run = RunningRepository.all()[0];
    return run ? this.withPace(run) : null;
  },

  /**
   * Totals over an inclusive date range.
   * @returns {{runs, distanceKm, durationMin, avgPace, calories}}
   */
  summary(fromDate, toDate) {
    const runs = RunningRepository.between(fromDate, toDate);

    const totals = RunningEngine.totals(runs);
    const calories = runs.reduce((sum, run) => sum + (run.calories ?? 0), 0);

    return {
      runs: totals.runs,
      distanceKm: totals.distanceKm,
      durationMin: totals.durationMin,
      calories,
      avgPace: totals.avgPace,
    };
  },

  /** The fastest run by pace, or null. */
  best() {
    const rated = RunningRepository.all()
      .map((run) => this.withPace(run))
      .filter((run) => run.paceSecPerKm !== null);

    if (!rated.length) return null;
    return rated.reduce((best, run) => (run.paceSecPerKm < best.paceSecPerKm ? run : best));
  },
});
