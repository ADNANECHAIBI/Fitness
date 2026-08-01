/**
 * coach-context.js — everything the coaching rules are allowed to look at.
 *
 * The coach is handed the *conclusions* of eight engines: a dashboard
 * snapshot, a weekly report, an insight set, an analytics summary, the
 * recovery snapshot, the profile, the settings and the goals. This file
 * arranges them into a single flat surface the rules read, and it derives
 * nothing at all — every accessor below is a path into something another
 * engine already produced, or a boolean over one.
 *
 * Two things it does add, and both are about honesty rather than arithmetic:
 *
 *   • **It records what is missing.** A rule asking about the strain trend
 *     when no analytics summary arrived must get null, not zero, and the
 *     session must be able to say which engine went quiet.
 *   • **It caps its own confidence.** Every rule reads `confidence()`, which
 *     is the weakest of the report's coverage and the analytics window's — a
 *     recommendation cannot be surer than the thinnest evidence under it, and
 *     a rule is not trusted to remember that.
 *
 * Pure. No storage, no events, no clock.
 */

import { toNumber } from './calculation-engine.js';
import { normaliseGoal } from './nutrition-context.js';
import {
  COACH, RECOVERY_STATUS, REPORTS, ANALYTICS_DIRECTION, SURPLUS_GOALS,
  DEFICIT_GOALS, RUNNING_LOAD, SLEEP, EXPERIENCE, NUTRITION_SAFETY,
} from './constants.js';

/** Which engine each input comes from, for naming a gap. */
const SOURCES = Object.freeze({
  dashboard: 'dashboard-engine',
  report: 'reports-engine',
  insights: 'insights-engine',
  analytics: 'analytics-engine',
  recovery: 'recovery',
  profile: 'profile',
  settings: 'settings',
});

const CONFIDENCE_ORDER = [
  REPORTS.CONFIDENCE_LEVEL.LOW,
  REPORTS.CONFIDENCE_LEVEL.MEDIUM,
  REPORTS.CONFIDENCE_LEVEL.HIGH,
];

/** The weaker of two confidence levels. */
const weaker = (a, b) => CONFIDENCE_ORDER[
  Math.min(
    Math.max(CONFIDENCE_ORDER.indexOf(a), 0),
    Math.max(CONFIDENCE_ORDER.indexOf(b), 0)
  )
];

/**
 * @typedef {object} CoachInput
 * @property {object} [dashboard]  DashboardSnapshot
 * @property {object} [report]     WeeklyReport
 * @property {object} [insights]   WeeklyInsights
 * @property {object} [analytics]  AnalyticsSummary
 * @property {object} [recovery]   the recovery snapshot
 * @property {object} [profile]
 * @property {object} [settings]
 * @property {object[]} [goals]
 * @property {string} [date]
 */

/**
 * Build the surface the rules read.
 * @param {CoachInput} input
 * @returns {object} the context, frozen
 */
export function createCoachContext(input = {}) {
  const dashboard = input.dashboard ?? null;
  const report = input.report ?? null;
  const insights = input.insights ?? null;
  const analytics = input.analytics ?? null;
  const recovery = input.recovery ?? dashboard?.recovery ?? null;
  const profile = input.profile ?? {};
  const settings = input.settings ?? {};

  const available = {
    dashboard: Boolean(dashboard),
    report: Boolean(report),
    insights: Boolean(insights),
    analytics: Boolean(analytics),
    recovery: Boolean(recovery),
    profile: Boolean(profile && Object.keys(profile).length),
    settings: Boolean(settings && Object.keys(settings).length),
  };

  const missing = Object.entries(available)
    .filter(([, present]) => !present)
    .map(([name]) => ({ input: name, engine: SOURCES[name] }));

  const statedGoal = profile.goal ?? report?.goal ?? analytics?.goalProgress?.goal ?? null;
  const goal = statedGoal ? normaliseGoal(statedGoal) : null;

  /* Confidence is the weakest link, computed once. A rule that wanted to be
     more certain than its inputs would have to override this deliberately,
     and none of them does. */
  const reportConfidence = report?.coverage?.level ?? REPORTS.CONFIDENCE_LEVEL.LOW;
  const analyticsConfidence = analytics?.confidence ?? REPORTS.CONFIDENCE_LEVEL.LOW;

  const trendOf = (metric) => analytics?.trends?.[metric] ?? null;
  const findingKeys = new Set((analytics?.findings ?? []).map((finding) => finding.key));

  return Object.freeze({
    date: input.date ?? dashboard?.date ?? null,

    dashboard, report, insights, analytics, recovery, profile, settings,
    goals: input.goals ?? [],

    available, missing,

    /* ── Who this is ────────────────────────────────────────────────── */

    goal,
    statedGoal,
    bulking: SURPLUS_GOALS.includes(goal),
    cutting: DEFICIT_GOALS.includes(goal),
    maintaining: Boolean(goal) && !SURPLUS_GOALS.includes(goal) && !DEFICIT_GOALS.includes(goal),

    experience: profile.experienceLevel ?? EXPERIENCE.INTERMEDIATE,
    beginner: profile.experienceLevel === 'beginner',
    advanced: profile.experienceLevel === 'advanced',

    trainingDays: toNumber(profile.trainingDays),
    availableMinutes: toNumber(dashboard?.workout?.availableMinutes)
      ?? toNumber(profile.sessionMinutes),
    restrictedMovements: settings.restrictedMovements ?? [],
    availableEquipment: settings.availableEquipment ?? [],

    sleepTargetHours: toNumber(settings.sleepHours) ?? SLEEP.TARGET_HOURS,

    /* ── Today ──────────────────────────────────────────────────────── */

    hasPlan: Boolean(dashboard?.weekNumber),
    hasWorkoutToday: Boolean(dashboard?.workout),
    hasRunToday: Boolean(dashboard?.running),
    deloadWeek: Boolean(dashboard?.deload),
    requiredMinutesToday: toNumber(dashboard?.today?.requiredMinutes),
    remainingCalories: toNumber(dashboard?.nutrition?.remaining?.calories),
    remainingProteinG: toNumber(dashboard?.nutrition?.remaining?.proteinG),
    intakeLogged: Boolean(dashboard?.nutrition?.remaining?.logged),
    targetCalories: toNumber(dashboard?.nutrition?.calories),
    targetProteinG: toNumber(dashboard?.nutrition?.proteinG),
    /* No fallback: the nutrition engine owns the water target, and a coach
       inventing one would be advising against a number it made up. */
    targetWaterL: toNumber(dashboard?.nutrition?.waterL) ?? toNumber(dashboard?.health?.waterTargetL),
    riskLevel: dashboard?.health?.riskLevel ?? null,

    /* ── Recovery ───────────────────────────────────────────────────── */

    recoveryStatus: recovery?.status ?? RECOVERY_STATUS.UNKNOWN,
    strainIndex: toNumber(recovery?.strainIndex),
    sleepHours: toNumber(recovery?.sleepHours) ?? toNumber(report?.recovery?.avgSleepHours),
    fatigue: toNumber(report?.recovery?.avgFatigue),
    poorRecovery: (recovery?.status ?? null) === RECOVERY_STATUS.POOR,
    loadVerdict: recovery?.runningLoad?.verdict ?? report?.trainingLoad?.verdict ?? null,
    loadSpiking: (recovery?.runningLoad?.verdict ?? report?.trainingLoad?.verdict) === RUNNING_LOAD.VERDICT.SPIKING,

    /* ── The week ───────────────────────────────────────────────────── */

    adherence: toNumber(report?.adherence?.overall),
    gymAdherence: toNumber(report?.adherence?.gym),
    runningAdherence: toNumber(report?.adherence?.running),
    nutritionAdherence: toNumber(report?.adherence?.nutrition),
    avgCalories: toNumber(report?.nutrition?.avgCalories),
    avgProteinG: toNumber(report?.nutrition?.avgProteinG),
    daysLogged: toNumber(report?.nutrition?.daysLogged),
    weeklyKm: toNumber(report?.running?.distanceKm),
    runsThisWeek: toNumber(report?.running?.runs),
    sessionsThisWeek: toNumber(report?.gym?.completedSessions),
    weightChangeKg: toNumber(report?.weight?.changeKg),
    weightRateKgPerWeek: toNumber(report?.weight?.weeklyChangeKg),
    weightReadings: toNumber(report?.weight?.readings),
    currentWeightKg: toNumber(report?.weight?.currentKg) ?? toNumber(profile.weightKg),

    /**
     * The fastest gain and loss the nutrition safety limits allow,
     * in kilograms per week. Its own limits are fractions of body weight, so
     * they are multiplied by the measured weight here — arithmetic over two
     * numbers that already existed, not a new threshold.
     */
    maxGainKgPerWeek: (toNumber(report?.weight?.currentKg) ?? toNumber(profile.weightKg)) === null
      ? null
      : Number(((toNumber(report?.weight?.currentKg) ?? toNumber(profile.weightKg)) * NUTRITION_SAFETY.MAX_GAIN_RATE).toFixed(3)),
    maxLossKgPerWeek: (toNumber(report?.weight?.currentKg) ?? toNumber(profile.weightKg)) === null
      ? null
      : Number(((toNumber(report?.weight?.currentKg) ?? toNumber(profile.weightKg)) * NUTRITION_SAFETY.MAX_LOSS_RATE).toFixed(3)),
    streakWeeks: toNumber(report?.explanations?.['streak.weeks']?.value),
    goalProgressPercent: toNumber(report?.weight?.progressPercent)
      ?? toNumber(analytics?.goalProgress?.progressPercent),

    /** The report's own warnings and achievements, unedited. */
    warnings: report?.warnings ?? [],
    achievements: report?.achievements ?? [],

    /** Whether the reports engine raised a warning of a given type. */
    warned(type) { return (report?.warnings ?? []).some((warning) => warning.type === type); },

    /** Whether the report awarded an achievement of a given type. */
    achieved(type) { return (report?.achievements ?? []).some((item) => item.type === type); },

    /* ── The long view ──────────────────────────────────────────────── */

    weeksAnalysed: toNumber(analytics?.range?.weeks) ?? 0,
    weeksWithData: toNumber(analytics?.meta?.weeksWithData) ?? 0,

    trend: trendOf,
    /** A trend's direction, or null when there is no analytics summary. */
    direction(metric) { return trendOf(metric)?.direction ?? null; },
    improving(metric) { return trendOf(metric)?.direction === ANALYTICS_DIRECTION.IMPROVING; },
    declining(metric) { return trendOf(metric)?.direction === ANALYTICS_DIRECTION.DECLINING; },
    flat(metric) { return trendOf(metric)?.direction === ANALYTICS_DIRECTION.FLAT; },

    /** Whether the analytics engine reported a finding by key. */
    found(key) { return findingKeys.has(key); },
    finding(key) {
      return (analytics?.findings ?? []).find((item) => item.key === key) ?? null;
    },

    plateauDetected: Boolean(analytics?.plateauDetected),
    riskDetected: Boolean(analytics?.riskDetected),
    improvementDetected: Boolean(analytics?.improvementDetected),

    /** Enough weeks behind a trend to advise on it? */
    enoughForTrendAdvice: (toNumber(analytics?.range?.weeks) ?? 0) >= COACH.MIN_WEEKS_FOR_TREND_ADVICE,

    /* ── Insights ───────────────────────────────────────────────────── */

    topInsight: insights?.priority?.[0] ?? insights?.all?.[0] ?? null,
    criticalInsights: (insights?.all ?? []).filter((insight) => insight.severity === 'critical'),

    /* ── Confidence ─────────────────────────────────────────────────── */

    reportConfidence,
    analyticsConfidence,

    /**
     * The confidence any advice from this context may claim.
     * A rule may cap it lower; nothing may raise it.
     */
    confidence(cap = REPORTS.CONFIDENCE_LEVEL.HIGH) {
      return weaker(weaker(reportConfidence, analyticsConfidence), cap);
    },

    /** Confidence for advice resting only on today, not on any trend. */
    todayConfidence() {
      return dashboard ? weaker(reportConfidence, REPORTS.CONFIDENCE_LEVEL.HIGH) : REPORTS.CONFIDENCE_LEVEL.LOW;
    },
  });
}

export { SOURCES as COACH_SOURCES };
