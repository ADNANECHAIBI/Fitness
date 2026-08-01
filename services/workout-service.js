/**
 * WorkoutService — logging sets and summarising training volume.
 * Volume = sets × reps × weight, the standard tonnage measure.
 */

import { WorkoutRepository } from '../repositories/index.js';
import { bus, EVENTS } from '../events/index.js';
import { StrengthEngine } from '../engines/strength-engine.js';

export const WorkoutService = Object.freeze({
  /**
   * Log one set.
   * @throws {ValidationError}
   */
  log(input) {
    const set = WorkoutRepository.create(input);
    bus.emit(EVENTS.WORKOUT_LOGGED, set);
    return set;
  },

  /** Tonnage for a single set, in kg. */
  volume(set) {
    return StrengthEngine.volume(set ?? {}) ?? 0;
  },

  /**
   * Estimated one-rep max for a set, with the formula that produced it.
   * @returns {{value, reliable, formula}}
   */
  oneRepMax(set) {
    return StrengthEngine.oneRepMax({ weightKg: set?.weightKg, reps: set?.reps });
  },

  /** Every set logged on one date, grouped by exercise. */
  session(date) {
    const sets = WorkoutRepository.byDate(date);
    const byExercise = new Map();

    for (const set of sets) {
      const bucket = byExercise.get(set.exercise) ?? { exercise: set.exercise, muscle: set.muscle, sets: [], volumeKg: 0 };
      bucket.sets.push(set);
      bucket.volumeKg += this.volume(set);
      byExercise.set(set.exercise, bucket);
    }

    return {
      date,
      exercises: [...byExercise.values()],
      totalSets: sets.length,
      volumeKg: Number(sets.reduce((sum, set) => sum + this.volume(set), 0).toFixed(1)),
    };
  },

  /**
   * Totals over an inclusive date range.
   * @returns {{sessions, sets, volumeKg, byMuscle}}
   */
  summary(fromDate, toDate) {
    const sets = WorkoutRepository.between(fromDate, toDate);

    return {
      sessions: new Set(sets.map((set) => set.date)).size,
      sets: sets.length,
      volumeKg: StrengthEngine.totalVolume(sets),
      byMuscle: StrengthEngine.volumeByMuscle(sets),
    };
  },

  /** Heaviest weight ever logged for one exercise, or null. */
  personalBest(exercise) {
    const matches = WorkoutRepository.find(
      (set) => set.exercise.toLowerCase() === String(exercise).toLowerCase()
    );
    if (!matches.length) return null;
    return matches.reduce((best, set) => (set.weightKg > best.weightKg ? set : best));
  },
});
