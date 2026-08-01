/**
 * NutritionService — daily intake against the calorie target.
 * It records numbers and compares them; it does not plan meals.
 */

import { NutritionRepository } from '../repositories/index.js';
import { CaloriesService } from './calories-service.js';
import { bus, EVENTS } from '../events/index.js';
import { today } from '../models/index.js';

export const NutritionService = Object.freeze({
  /**
   * Save the intake for a day. One record per date: logging twice updates.
   * @throws {ValidationError}
   */
  log(input) {
    const date = input.date ?? today();
    const existing = NutritionRepository.byDate(date)[0];

    const record = existing
      ? NutritionRepository.update(existing.id, input)
      : NutritionRepository.create({ ...input, date });

    bus.emit(EVENTS.NUTRITION_LOGGED, record);
    return record;
  },

  /** The record for a date, or null. */
  byDate(date = today()) {
    return NutritionRepository.byDate(date)[0] ?? null;
  },

  /**
   * Intake versus target for a day.
   * @returns {{intake, target, remaining, percent}|null} null without a profile
   */
  balance(date = today()) {
    const target = CaloriesService.target();
    if (!target) return null;

    const intake = this.byDate(date) ?? { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    const eaten = intake.calories ?? 0;

    return {
      intake,
      target,
      remaining: target.calories - eaten,
      percent: target.calories > 0 ? Number(((eaten / target.calories) * 100).toFixed(1)) : 0,
    };
  },

  /**
   * Averages over an inclusive date range, counting only days with a record.
   * @returns {{daysLogged, avgCalories, avgProteinG, avgCarbsG, avgFatG, avgWaterL}}
   */
  summary(fromDate, toDate) {
    const rows = NutritionRepository.between(fromDate, toDate);
    const days = rows.length;

    const mean = (field) =>
      days === 0 ? 0 : Number((rows.reduce((sum, row) => sum + (row[field] ?? 0), 0) / days).toFixed(1));

    return {
      daysLogged: days,
      avgCalories: mean('calories'),
      avgProteinG: mean('proteinG'),
      avgCarbsG: mean('carbsG'),
      avgFatG: mean('fatG'),
      avgWaterL: mean('waterL'),
    };
  },
});
