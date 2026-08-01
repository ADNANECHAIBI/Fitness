/**
 * AnalyticsService — long windows, from the reports that already exist.
 *
 * The analytics engine's only input is a list of weekly reports. This service
 * decides which weeks a window covers, asks `ReportService.analyze()` for
 * each of them, and hands the list down. It fits nothing, labels nothing and
 * decides nothing.
 *
 * **Cost.** A yearly window is fifty-two report builds on the first call, and
 * the weekly-report memo holds `CACHE.MAX_ENTRIES` entries — so a long window
 * evicts its own earlier weeks as it goes and cannot be assembled for free a
 * second time from that cache. That is why the analysis itself is cached
 * here: the expensive part happens once per invalidation, not once per read.
 * Shorter windows sit inside the memo and cost nothing on a second call.
 *
 * The window is anchored on the current week and counted backwards, so
 * `quarterly()` means the last thirteen weeks rather than a calendar quarter.
 * A calendar range is what `range(from, to)` is for.
 */

import { ReportService } from './report-service.js';
import { InsightsService } from './insights-service.js';
import { ProfileRepository } from '../repositories/index.js';
import { register, GLOBAL_INVALIDATION } from './cache.js';
import { EVENTS } from '../events/index.js';
import { AnalyticsEngine } from '../engines/analytics-engine.js';
import { startOfWeek } from '../engines/plan-context.js';
import { ANALYTICS, ANALYTICS_PERIOD, UNITS } from '../engines/constants.js';
import { today } from '../models/index.js';
import { createLogger } from '../scripts/logger.js';

const log = createLogger('analytics');

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

/** The Monday n weeks before another Monday. */
const weeksBefore = (weekStart, count) =>
  new Date(new Date(`${weekStart}T00:00:00Z`).getTime() - count * UNITS.DAYS_PER_WEEK * 86400000)
    .toISOString().slice(0, 10);

/** Every Monday from `from` to `to`, inclusive, oldest first. */
function mondaysBetween(from, to) {
  const weeks = [];
  let cursor = startOfWeek(from);
  const last = startOfWeek(to);

  /* Guarded rather than trusted: a reversed range would otherwise loop until
     the tab dies. Two years is past anything the engine claims to analyse. */
  for (let guard = 0; cursor <= last && guard < 120; guard += 1) {
    weeks.push(cursor);
    cursor = weeksBefore(cursor, -1);
  }

  return weeks;
}

/**
 * The analysed reports for a list of week starts.
 * Each is built through `ReportService`, so nothing here reads storage and
 * nothing is analysed twice inside one window.
 */
function reportsFor(weekStarts) {
  const reports = [];

  for (const weekStart of weekStarts) {
    try {
      reports.push(ReportService.analyze(weekStart));
    } catch (error) {
      log.error(`[analytics] the report for ${weekStart} could not be built`, error);
    }
  }

  return reports;
}

/** What the engine needs for a window, gathered. */
function gather(from, to) {
  const profile = ProfileRepository.get() ?? {};
  const weekStarts = mondaysBetween(from, to);

  return {
    weeklyReports: reportsFor(weekStarts),
    goal: {
      goal: profile.goal ?? null,
      goalKg: profile.goalWeightKg ?? null,
      currentKg: profile.weightKg ?? null,
      startKg: profile.startWeightKg ?? profile.weightKg ?? null,
    },
  };
}

const analysed = register('analytics', (period, from, to) => {
  const input = gather(from, to);

  /* analyse() rather than range(): range() stamps the period as 'range' by
     definition, and a monthly window asked for by name should say monthly. */
  return AnalyticsEngine.analyse({
    ...input,
    period,
    from: startOfWeek(from),
    to: startOfWeek(to),
  });
}, INVALIDATE_ON);

/** The window a named period covers, counted back from the current week. */
function windowFor(period, asOf = today()) {
  const to = startOfWeek(asOf);
  const span = ANALYTICS.WEEKS[period] ?? 1;
  return { from: weeksBefore(to, span - 1), to };
}

export const AnalyticsService = Object.freeze({
  /** The current week, analysed on its own. @returns {object} AnalyticsSummary */
  week(asOf = today()) {
    const { from, to } = windowFor(ANALYTICS_PERIOD.WEEKLY, asOf);
    return analysed(ANALYTICS_PERIOD.WEEKLY, from, to);
  },

  /** The last four weeks. */
  month(asOf = today()) {
    const { from, to } = windowFor(ANALYTICS_PERIOD.MONTHLY, asOf);
    return analysed(ANALYTICS_PERIOD.MONTHLY, from, to);
  },

  /** The last thirteen weeks. */
  quarter(asOf = today()) {
    const { from, to } = windowFor(ANALYTICS_PERIOD.QUARTERLY, asOf);
    return analysed(ANALYTICS_PERIOD.QUARTERLY, from, to);
  },

  /** The last fifty-two weeks. Expensive on the first call; see the header. */
  year(asOf = today()) {
    const { from, to } = windowFor(ANALYTICS_PERIOD.YEARLY, asOf);
    return analysed(ANALYTICS_PERIOD.YEARLY, from, to);
  },

  /** Any window, by its ends. */
  range(from, to) {
    return analysed(ANALYTICS_PERIOD.RANGE, from, to);
  },

  /** One trend out of a period's analysis. @returns {object|null} */
  trend(metric, period = ANALYTICS_PERIOD.QUARTERLY) {
    const analysis = this.forPeriod(period);
    return analysis.trends?.[metric] ?? null;
  },

  /** A named period, for a caller holding the name rather than the method. */
  forPeriod(period = ANALYTICS_PERIOD.QUARTERLY, asOf = today()) {
    return {
      [ANALYTICS_PERIOD.WEEKLY]: () => this.week(asOf),
      [ANALYTICS_PERIOD.MONTHLY]: () => this.month(asOf),
      [ANALYTICS_PERIOD.QUARTERLY]: () => this.quarter(asOf),
      [ANALYTICS_PERIOD.YEARLY]: () => this.year(asOf),
    }[period]?.() ?? this.quarter(asOf);
  },

  /** One figure from an analysis, taken apart. @returns {object|null} */
  explain(figureKey, period = ANALYTICS_PERIOD.QUARTERLY) {
    return this.forPeriod(period).explain(figureKey);
  },

  /** The insight sets over the same window, for a caller that wants both. */
  insights(period = ANALYTICS_PERIOD.QUARTERLY, asOf = today()) {
    const analysis = this.forPeriod(period, asOf);
    return (analysis.weeklyReports ?? []).map((report) =>
      InsightsService.week(report.range?.start ?? report.weekStart));
  },

  /** What the engine was handed for a window. For debugging, not for display. */
  inputs(from, to) { return gather(from, to); },

  refresh() { analysed.invalidate(); return true; },
});
