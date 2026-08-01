/**
 * CoachService — the coach, wired to real data.
 *
 * The engine reads eight conclusions and produces advice. This service is what
 * fetches those eight, and it fetches them from the application services that
 * already cache them rather than rebuilding anything: a coaching session over
 * an unchanged week costs one cache read per engine.
 *
 * Every read is guarded. The engine reports a missing input as missing and has
 * a rule dedicated to saying so, so one failing source produces narrower
 * advice rather than no advice — and never silently produces confident advice
 * on three-eighths of the evidence.
 *
 * It decides nothing. Which rules fire, how they rank, what suppresses what
 * and how sure any of it is are all engine questions.
 */

import { DashboardService } from './dashboard-service.js';
import { ReportService } from './report-service.js';
import { InsightsService } from './insights-service.js';
import { AnalyticsService } from './analytics-service.js';
import { RecoveryService } from './recovery-service.js';
import { ProfileRepository, SettingsRepository, GoalsRepository } from '../repositories/index.js';
import { register, GLOBAL_INVALIDATION } from './cache.js';
import { EVENTS } from '../events/index.js';
import { CoachEngine } from '../engines/coach-engine.js';
import { startOfWeek } from '../engines/plan-context.js';
import { ANALYTICS_PERIOD } from '../engines/constants.js';
import { today } from '../models/index.js';
import { createLogger } from '../scripts/logger.js';

const log = createLogger('coach');

/** Read one source, or record that it went quiet. */
function attempt(name, read) {
  try {
    return read() ?? null;
  } catch (error) {
    log.error(`[coach] ${name} could not be read`, error);
    return null;
  }
}

/**
 * The eight conclusions the engine reads, for one day.
 *
 * The analytics window is monthly rather than quarterly: the coach's trend
 * advice needs three weeks and a quarter costs thirteen report builds on a
 * cold cache. A caller wanting the longer view can pass `period`.
 */
function gather(date, period = ANALYTICS_PERIOD.MONTHLY) {
  const weekStart = startOfWeek(date);

  return {
    date,
    dashboard: attempt('dashboard', () => DashboardService.snapshot(date)),
    report: attempt('report', () => ReportService.analyze(weekStart)),
    insights: attempt('insights', () => InsightsService.week(weekStart)),
    analytics: attempt('analytics', () => AnalyticsService.forPeriod(period, date)),
    recovery: attempt('recovery', () => RecoveryService.snapshot()),
    profile: attempt('profile', () => ProfileRepository.get()) ?? {},
    settings: attempt('settings', () => SettingsRepository.get()) ?? {},
    goals: attempt('goals', () => GoalsRepository.all()) ?? [],
  };
}

const build = register('coach', (date = today(), period = ANALYTICS_PERIOD.MONTHLY) =>
  CoachEngine.session({ ...gather(date, period), period: 'weekly' }), [
  ...GLOBAL_INVALIDATION,
  EVENTS.PLAN_GENERATED,
  EVENTS.WEEK_GENERATED,
  EVENTS.WEEK_CLOSED,
  EVENTS.WORKOUT_LOGGED,
  EVENTS.WORKOUT_COMPLETED,
  EVENTS.RUN_LOGGED,
  EVENTS.RUN_COMPLETED,
  EVENTS.NUTRITION_LOGGED,
  EVENTS.WEIGHT_CHANGED,
  EVENTS.SESSION_STARTED,
]);

export const CoachService = Object.freeze({
  /** The full session for a day's week. @returns {object} CoachSession */
  session(date = today()) { return build(date); },

  /** Today's advice only, filtered out of the same session. */
  today(date = today()) {
    const session = build(date);
    return session.dailyAdvice;
  },

  /** This week's advice. */
  week(date = today()) { return build(date).weeklyAdvice; },

  /** The single most important thing. @returns {object|null} */
  focus(date = today()) { return build(date).focus; },

  /** The next concrete step, as the engine derived it from the focus. */
  nextStep(date = today()) { return build(date).nextStep; },

  /** The worst thing and the best thing. */
  biggestRisk(date = today()) { return build(date).biggestRisk; },
  biggestOpportunity(date = today()) { return build(date).biggestOpportunity; },

  /** Advice in one category, ranked. */
  forCategory(category, date = today()) {
    return build(date).byCategory[category] ?? [];
  },

  /** One piece of advice by key, or null. */
  find(key, date = today()) { return build(date).find(key); },

  /** The week in a paragraph, assembled from figures the engines produced. */
  summary(date = today()) { return build(date).weeklySummary; },

  /** What the engine was handed. For debugging, not for display. */
  inputs(date = today()) { return gather(date); },

  refresh() { build.invalidate(); return true; },
});
