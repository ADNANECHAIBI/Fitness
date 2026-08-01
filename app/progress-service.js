/**
 * ProgressService — everything that has changed, in one object.
 *
 * Every figure here was produced by an engine or a service that owns it. This
 * file contains no arithmetic beyond reading those results.
 */

import { WeightService } from '../services/weight-service.js';
import { WorkoutService } from '../services/workout-service.js';
import { NutritionService } from '../services/nutrition-service.js';
import { RunningProgramService } from '../services/running-program-service.js';
import { NutritionPlanService } from '../services/nutrition-plan-service.js';
import { ProgressRepository, SessionRepository } from '../repositories/index.js';
import { RecoveryService } from './recovery-service.js';
import { register, GLOBAL_INVALIDATION } from './cache.js';
import { EVENTS } from '../events/index.js';
import { today } from '../models/index.js';

/** ISO date n days ago. */
const daysAgo = (days, from = today()) =>
  new Date(new Date(`${from}T00:00:00Z`).getTime() - days * 86400000).toISOString().slice(0, 10);

const build = register('progress', () => {
  const from = daysAgo(28);
  const to = today();

  const nutritionWeek = NutritionPlanService.week();
  const nutritionActual = NutritionService.summary(daysAgo(7), to);

  return {
    weight: {
      current: WeightService.current(),
      goal: WeightService.goal(),
      bmi: WeightService.bmi(),
      progress: WeightService.progress(),
      trend: WeightService.trend(),
      history: WeightService.history(),
    },

    gym: {
      lastMonth: WorkoutService.summary(from, to),
      lastWeek: WorkoutService.summary(daysAgo(7), to),
      sessions: SessionRepository.all().filter((session) => session.date >= from).length,
    },

    running: RunningProgramService.progress(),

    measurements: {
      latest: ProgressRepository.latestMeasurement(),
      count: ProgressRepository.measurements.count(),
    },

    nutrition: {
      target: {
        calories: nutritionWeek.dailyCalories,
        proteinG: nutritionWeek.proteinTargetG,
      },
      actual: nutritionActual,
      compliance: complianceOf(nutritionActual, nutritionWeek),
    },

    recovery: RecoveryService.snapshot(),

    generatedAt: new Date().toISOString(),
  };
}, [
  ...GLOBAL_INVALIDATION,
  EVENTS.WEIGHT_CHANGED,
  EVENTS.WORKOUT_LOGGED,
  EVENTS.WORKOUT_COMPLETED,
  EVENTS.RUN_LOGGED,
  EVENTS.NUTRITION_LOGGED,
  EVENTS.RECORD_CREATED,
]);

/**
 * How closely intake matched target, as a percentage.
 * A ratio of two numbers each engine already produced — not a new metric.
 */
function complianceOf(actual, week) {
  if (!actual?.daysLogged || !week?.dailyCalories) {
    return { caloriesPercent: null, proteinPercent: null, daysLogged: actual?.daysLogged ?? 0 };
  }

  const share = (got, want) => (want ? Math.round((got / want) * 100) : null);

  return {
    caloriesPercent: share(actual.avgCalories, week.dailyCalories),
    proteinPercent: share(actual.avgProteinG, week.proteinTargetG),
    daysLogged: actual.daysLogged,
  };
}

export const ProgressService = Object.freeze({
  /** @returns {object} ProgressSnapshot */
  snapshot() { return build(); },
  refresh() { build.invalidate(); return build(); },
});
