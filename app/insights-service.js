/**
 * InsightsService — phase 17's engine, connected to real data.
 *
 * It reads the report the reports engine already built and hands it to the
 * insights engine. That is the whole job: no storage of its own, no figures
 * of its own, and no second path to the data — an insight that disagreed
 * with the report it came from would be a bug, and the only way to make that
 * impossible is to give the engine nothing else to read.
 *
 * Cached like every other application service, and cleared by the same events
 * that clear the report underneath it.
 */

import { ReportService } from './report-service.js';
import { InsightsEngine } from '../engines/insights-engine.js';
import { register, GLOBAL_INVALIDATION } from './cache.js';
import { EVENTS } from '../events/index.js';
import { startOfWeek } from '../engines/plan-context.js';
import { today } from '../models/index.js';

const INVALIDATE_ON = [
  ...GLOBAL_INVALIDATION,
  EVENTS.WEIGHT_CHANGED,
  EVENTS.WORKOUT_LOGGED,
  EVENTS.WORKOUT_COMPLETED,
  EVENTS.RUN_LOGGED,
  EVENTS.RUN_COMPLETED,
  EVENTS.NUTRITION_LOGGED,
  EVENTS.PLAN_GENERATED,
  EVENTS.WEEK_CLOSED,
];

const weeklyInsights = register('weekly-insights', (weekStart) =>
  InsightsEngine.weekly({ report: ReportService.analyze(weekStart) }), INVALIDATE_ON);

const monthlyInsights = register('monthly-insights', (month) => {
  const report = ReportService.month(month);

  return InsightsEngine.monthly({
    month,
    monthlyReport: report,
    /* The month's weeks are the reports the monthly report already gathered,
       so the two sides cannot describe different weeks. */
    weeklyInsights: (report.weeklyReports ?? []).map((week) =>
      InsightsEngine.weekly({ report: week })),
  });
}, INVALIDATE_ON);

export const InsightsService = Object.freeze({
  /**
   * The insights for a week.
   * @param {string} [weekStart]
   * @returns {object} WeeklyInsights
   */
  week(weekStart = startOfWeek(today())) { return weeklyInsights(weekStart); },

  /**
   * The insights for a month.
   * @param {string} [month] 'YYYY-MM'
   * @returns {object} MonthlyInsights
   */
  month(month = today().slice(0, 7)) { return monthlyInsights(month); },

  /** Only the ones worth acting on, strongest first. */
  priority(weekStart = startOfWeek(today())) { return this.week(weekStart).priority; },

  /** One insight by key, or null. */
  find(key, weekStart = startOfWeek(today())) { return this.week(weekStart).find(key); },

  refresh() {
    weeklyInsights.invalidate();
    monthlyInsights.invalidate();
    return true;
  },
});
