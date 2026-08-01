/**
 * ReportingService — the only place that knows both halves.
 *
 * The `reporting/` layer builds documents from data handed to it and imports
 * nothing from `app/`. This file is the join: it reads the weekly report, the
 * insight set, the analytics summary and the coaching session through the
 * services that already cache them, hands them down, and caches the document.
 *
 * The direction matters and is the reason for the split. If the document
 * builders imported the services they describe, the dependency would run in a
 * circle and no document could be built without storage — which would make
 * every test in phase 22 an integration test. As it is, the builders are pure
 * and this file is thirty lines of gathering.
 *
 * It calculates nothing, words nothing, and decides nothing about layout.
 */

import { ReportService } from './report-service.js';
import { InsightsService } from './insights-service.js';
import { AnalyticsService } from './analytics-service.js';
import { DashboardService } from './dashboard-service.js';
import { CoachService } from './coach-service.js';
import { register, GLOBAL_INVALIDATION } from './cache.js';
import { EVENTS } from '../events/index.js';
import {
  weeklyReportDocument, monthlyReportDocument, progressReportDocument,
} from '../reporting/documents.js';
import { renderPrintHtml, renderPdf } from '../reporting/renderers.js';
import { startOfWeek } from '../engines/plan-context.js';
import { ANALYTICS_PERIOD } from '../engines/constants.js';
import { today } from '../models/index.js';
import { createLogger } from '../scripts/logger.js';

const log = createLogger('reporting');

const INVALIDATE_ON = [
  ...GLOBAL_INVALIDATION,
  EVENTS.WEEK_CLOSED,
  EVENTS.WORKOUT_LOGGED,
  EVENTS.RUN_LOGGED,
  EVENTS.NUTRITION_LOGGED,
  EVENTS.WEIGHT_CHANGED,
  EVENTS.PLAN_GENERATED,
];

/** Read one source, or record that it went quiet. A gap narrows a document. */
function attempt(name, read) {
  try {
    return read() ?? null;
  } catch (error) {
    log.error(`[reporting] ${name} could not be read`, error);
    return null;
  }
}

const weekly = register('report-document-weekly', (weekStart) => weeklyReportDocument({
  report: attempt('report', () => ReportService.analyze(weekStart)),
  insights: attempt('insights', () => InsightsService.week(weekStart)),
  coach: attempt('coach', () => CoachService.session(weekStart)),
  dashboard: attempt('dashboard', () => DashboardService.snapshot(weekStart)),
}), INVALIDATE_ON);

const monthly = register('report-document-monthly', (month) => monthlyReportDocument({
  monthly: attempt('monthly', () => ReportService.month(month)),
  analytics: attempt('analytics', () => AnalyticsService.forPeriod(ANALYTICS_PERIOD.MONTHLY)),
  insights: attempt('insights', () => InsightsService.month(month)),
  coach: attempt('coach', () => CoachService.session()),
}), INVALIDATE_ON);

const progress = register('report-document-progress', (period) => progressReportDocument({
  analytics: attempt('analytics', () => AnalyticsService.forPeriod(period)),
  coach: attempt('coach', () => CoachService.session()),
}), INVALIDATE_ON);

export const ReportingService = Object.freeze({
  /** A week, as a document. @returns {object} ReportDocument */
  weekly(date = today()) { return weekly(startOfWeek(date)); },

  /** A month, as a document. @param {string} [month] 'YYYY-MM' */
  monthly(month = today().slice(0, 7)) { return monthly(month); },

  /** Long-term progress, as a document. */
  progress(period = ANALYTICS_PERIOD.QUARTERLY) { return progress(period); },

  /**
   * A document as printable HTML.
   * @param {object} document
   * @param {object} [options] { translate, dir, locale }
   */
  print(document, options = {}) { return renderPrintHtml(document, options); },

  /**
   * A document through a PDF renderer.
   * @param {object} document
   * @param {object} [options] { renderer, translate, dir }
   */
  pdf(document, options = {}) { return renderPdf(document, options); },

  refresh() {
    weekly.invalidate();
    monthly.invalidate();
    progress.invalidate();
    return true;
  },
});
