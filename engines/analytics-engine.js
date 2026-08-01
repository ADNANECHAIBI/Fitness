/**
 * analytics-engine.js — phase 19. The long view.
 *
 * The reports engine describes a week. The insights engine says what stood
 * out in one. The dashboard engine assembles today. None of the three can see
 * a quarter, because none of them is ever given one: a `WeeklyReport` is the
 * unit they all work in, and a year is fifty-two of them.
 *
 * This engine is given the fifty-two. It answers questions that only exist at
 * that length — has the squat actually moved since March, is the scale
 * genuinely stalled or is this a flat fortnight, did adherence slip before
 * the results did — and it answers them without measuring anything.
 *
 * How an analysis is built
 *   1. The weekly reports are sorted and clipped to a window. Everything from
 *      here on reads that window and nothing else.
 *   2. For each of twelve metrics, a least-squares line is fitted through the
 *      figure the reports already hold, using `engines/trend.js` — the same
 *      code the monthly report uses, so a quarter and the months inside it
 *      cannot disagree about a slope.
 *   3. Each slope is labelled against a flat band from constants and the
 *      metric's own definition of better: improving, declining, flat, or
 *      unknown where "better" is not defined (nobody improves at eating
 *      2,800 calories).
 *   4. Three rule sets read those trends and append findings — plateau,
 *      progress, risk. Anything without evidence is refused and counted.
 *   5. Confidence is the window's own data coverage, which a rule may lower
 *      and none may raise.
 *
 * What it does not do: fit a curve the reports engine already fitted, count a
 * streak it already counted, re-detect a personal record, decide anything
 * about training, or hold a single string meant for a screen.
 *
 * Pure: same reports in, same analysis out. No storage, no events, no clock
 * except the `generatedAt` stamp the caller can override.
 */

import { createAnalyticsContext, METRICS } from './analytics-context.js';
import { createExplainer, SOURCE, describeExplanation } from './report-explain.js';
import { trendOf, meanOf, totalOf } from './trend.js';
import { applyAll, makeReason } from '../rules/rule.js';
import { ANALYTICS_RULE_SETS } from '../rules/analytics/index.js';
import { round, toNumber } from './calculation-engine.js';
import {
  ANALYTICS, ANALYTICS_DIRECTION, ANALYTICS_PERIOD, ANALYTICS_FINDING,
  REPORTS, SURPLUS_GOALS, DEFICIT_GOALS, UNITS,
} from './constants.js';

export const ANALYTICS_ENGINE_VERSION = '1.0.0';

/* ── Trends ─────────────────────────────────────────────────────────────────
   One fitted line per metric. The fitting is `trend.js`; what this adds is
   the label — whether the slope counts as movement at all, and if so whether
   that movement is the direction the metric wants to go.                   */

/**
 * Label a slope.
 *
 * `flat` is decided first and on magnitude alone: a slope inside the band is
 * not movement, whichever way it points. Only outside the band does the
 * metric's own `better` get consulted, and where a metric has no better —
 * calorie intake, running load — the direction is `unknown` and the raw
 * movement is reported instead of dressed up as good or bad news.
 */
function label(metric, perWeek, goal) {
  const definition = METRICS[metric];

  if (perWeek === null || perWeek === undefined) {
    return { direction: ANALYTICS_DIRECTION.UNKNOWN, movement: 'unknown' };
  }

  const movement = perWeek > 0 ? 'rising' : perWeek < 0 ? 'falling' : 'flat';

  if (Math.abs(perWeek) <= definition.band) {
    return { direction: ANALYTICS_DIRECTION.FLAT, movement: 'flat' };
  }

  const better = definition.better;

  if (better === 'up') {
    return { direction: perWeek > 0 ? ANALYTICS_DIRECTION.IMPROVING : ANALYTICS_DIRECTION.DECLINING, movement };
  }
  if (better === 'down') {
    return { direction: perWeek < 0 ? ANALYTICS_DIRECTION.IMPROVING : ANALYTICS_DIRECTION.DECLINING, movement };
  }

  /* Body weight has no fixed better: it depends on the goal, and without one
     a rising scale is neither good news nor bad. */
  if (better === 'goal') {
    const wantsUp = SURPLUS_GOALS.includes(goal?.goal);
    const wantsDown = DEFICIT_GOALS.includes(goal?.goal);

    if (!wantsUp && !wantsDown) {
      return { direction: ANALYTICS_DIRECTION.UNKNOWN, movement };
    }
    return {
      direction: (wantsUp && perWeek > 0) || (wantsDown && perWeek < 0)
        ? ANALYTICS_DIRECTION.IMPROVING
        : ANALYTICS_DIRECTION.DECLINING,
      movement,
    };
  }

  return { direction: ANALYTICS_DIRECTION.UNKNOWN, movement };
}

/** Fit and label every metric the window can measure. */
function fitTrends(context, explain) {
  const trends = {};

  for (const [metric, definition] of Object.entries(METRICS)) {
    const fitted = trendOf(context.weeks, definition.read, {
      unit: definition.unit,
      decimals: definition.decimals,
    });

    const { direction, movement } = label(metric, fitted.perWeek, context.goal);

    trends[metric] = Object.freeze({
      metric,
      label: definition.label,
      unit: definition.unit,
      band: definition.band,
      better: definition.better,
      source: definition.source,

      perWeek: fitted.perWeek,
      weeks: fitted.weeks,
      first: fitted.first ?? null,
      last: fitted.last ?? null,
      direction,
      movement,
      note: fitted.note,
    });

    explain.figure(`trend.${metric}`, fitted.perWeek, {
      unit: definition.unit,
      source: definition.source,
      method: fitted.perWeek === null
        ? (fitted.note ?? `no slope could be fitted through ${definition.label}`)
        : `a least-squares line through ${fitted.weeks} weekly readings of ${definition.label}, each of which the ${definition.source} produced; the slope is per week because x is the week's position in the window`,
      inputs: {
        weeks: fitted.weeks,
        first: fitted.first ?? null,
        last: fitted.last ?? null,
        flatBand: definition.band,
      },
      note: `Movement inside ±${definition.band} ${definition.unit} reads as flat. This engine fitted the line; it did not produce any of the readings.`,
    });
  }

  return trends;
}

/* ── The rule context ───────────────────────────────────────────────────── */

function ruleContextFor(context, trends) {
  const latest = context.weeks.at(-1) ?? null;

  /* The longest run of consecutive weeks in the window carrying nothing.
     A count over weeks the context already marked empty, not a new measure. */
  let longest = 0;
  let run = 0;
  for (const week of context.weeks) {
    if (context.emptyWeeks.includes(week.weekStart)) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  /* The goal was resolved once, by the context. Reading it again here — with
     a second set of fallbacks — is how the trend labels and the rules would
     end up disagreeing about which goal is in force. */
  const goal = context.goal;

  return {
    period: context.period,
    from: context.from,
    to: context.to,
    weeksInWindow: context.weeksInWindow,
    weeksWithData: context.weeksWithData,
    emptyWeeks: context.emptyWeeks,
    longestGapWeeks: longest,
    sufficient: context.sufficient,
    minWeeks: context.minWeeks,

    goal,
    directionalGoal: SURPLUS_GOALS.includes(goal.goal) || DEFICIT_GOALS.includes(goal.goal),
    goalProgressPercent: toNumber(latest?.weight?.progressPercent),

    /** The flat-week count the reports engine already made, not a new one. */
    flatWeightWeeks: toNumber(latest?.explanations?.['weight.flatWeeks']?.value) ?? 0,

    trend(metric) { return trends[metric]; },

    /** Metrics whose slope points the way they want to go. */
    improving() {
      return Object.keys(METRICS).filter((metric) =>
        trends[metric].direction === ANALYTICS_DIRECTION.IMPROVING);
    },

    /** A metric flat for long enough to call stalled. */
    stalled(metric) {
      const trend = trends[metric];
      return trend.direction === ANALYTICS_DIRECTION.FLAT &&
        trend.weeks >= ANALYTICS.PLATEAU_WEEKS;
    },

    /**
     * Confidence for one finding: the window's own coverage, which a rule may
     * lower but never raise. A conclusion cannot be surer than the weeks it
     * was drawn from.
     */
    confidence(cap = REPORTS.CONFIDENCE_LEVEL.HIGH) {
      const order = [
        REPORTS.CONFIDENCE_LEVEL.LOW,
        REPORTS.CONFIDENCE_LEVEL.MEDIUM,
        REPORTS.CONFIDENCE_LEVEL.HIGH,
      ];
      return order[Math.min(order.indexOf(context.coverage.level), order.indexOf(cap))];
    },
  };
}

/* ── Findings ───────────────────────────────────────────────────────────── */

const REQUIRED = ['key', 'kind', 'title', 'summary', 'reason', 'confidence', 'sourceEngine'];

/** Keep only what can show its work, and say what was dropped. */
function withEvidenceOnly(findings) {
  const kept = [];
  const refused = [];

  for (const finding of findings ?? []) {
    const missing = REQUIRED.filter((field) => !finding?.[field]);
    const evidence = finding?.evidence ?? {};
    const hasEvidence = Object.keys(evidence).length > 0 &&
      Object.values(evidence).some((value) => value !== null && value !== undefined);

    if (missing.length) {
      refused.push({ key: finding?.key ?? 'unnamed', refusedFor: `missing ${missing.join(', ')}` });
    } else if (!hasEvidence) {
      refused.push({ key: finding.key, refusedFor: 'no evidence' });
    } else {
      kept.push(Object.freeze({ ...finding }));
    }
  }

  return { kept: kept.slice(0, ANALYTICS.MAX_FINDINGS), refused };
}

/* ── Summaries ──────────────────────────────────────────────────────────────
   Each of these is a re-presentation of figures the weekly reports already
   hold: means over the window, the latest reading, and the trends fitted
   above. Nothing is derived from raw records, which this engine never sees. */

function consistencySummary(context, explain) {
  const weeks = context.weeks;

  const trainingWeeks = weeks.filter((week) => (toNumber(week.gym?.sets) ?? 0) > 0).length;
  const runningWeeks = weeks.filter((week) => (toNumber(week.running?.runs) ?? 0) > 0).length;
  const loggedWeeks = weeks.filter((week) => (toNumber(week.nutrition?.daysLogged) ?? 0) > 0).length;

  explain.figure('consistency.trainingWeeks', trainingWeeks, {
    unit: 'weeks', source: SOURCE.REPORTS,
    method: 'weeks in the window whose report recorded at least one logged set',
    inputs: { weeksInWindow: weeks.length },
  });

  return {
    weeksInWindow: weeks.length,
    trainingWeeks,
    runningWeeks,
    nutritionLoggedWeeks: loggedWeeks,
    emptyWeeks: context.emptyWeeks.length,
    averageSessionsPerWeek: meanOf(weeks, (week) => week.gym?.completedSessions, 1),
    averageRunsPerWeek: meanOf(weeks, (week) => week.running?.runs, 1),
    averageDaysLoggedPerWeek: meanOf(weeks, (week) => week.nutrition?.daysLogged, 1),
    coverage: context.coverage,
    sourceEngine: 'reports-engine',
    reason: `Counts over the ${weeks.length} weekly reports in the window. A week is counted as a training week when its report holds at least one logged set — the report decided that, not this engine.`,
  };
}

function adherenceSummary(context, trends, explain) {
  const weeks = context.weeks;
  const values = context.series('adherencePercent');

  const average = explain.figure('adherence.average',
    meanOf(weeks, (week) => week.adherence?.overall, 0), {
      unit: '%', source: SOURCE.REPORTS,
      method: `the mean of the overall adherence figure the reports engine produced for each of the ${values.length} weeks that could be scored`,
      inputs: { weeksScored: values.length, weeksInWindow: weeks.length },
      note: 'Weeks with nothing planned cannot be scored and are left out of the mean rather than counted as zero.',
    });

  const atOrAbove = values.filter((value) => value >= REPORTS.ADHERENCE_LOW).length;

  return {
    average,
    weeksScored: values.length,
    weeksAtOrAboveLow: atOrAbove,
    lowLine: REPORTS.ADHERENCE_LOW,
    best: values.length ? Math.max(...values) : null,
    worst: values.length ? Math.min(...values) : null,
    trend: trends.adherencePercent,
    byComponent: {
      gym: meanOf(weeks, (week) => week.adherence?.gym, 0),
      running: meanOf(weeks, (week) => week.adherence?.running, 0),
      nutrition: meanOf(weeks, (week) => week.adherence?.nutrition, 0),
    },
    sourceEngine: 'reports-engine',
    reason: 'Every adherence figure here was produced by the reports engine, which weighted gym, running and nutrition and renormalised around whatever the week actually planned.',
  };
}

function goalSummary(ruleContext, trends, context, explain) {
  const latest = context.weeks.at(-1) ?? null;

  const progressPercent = explain.figure('goal.progressPercent',
    ruleContext.goalProgressPercent, {
      unit: '%', source: SOURCE.BODY,
      method: latest
        ? "the latest weekly report's own progress figure, which the body engine placed between the starting weight and the goal"
        : 'no weekly report in the window carries a progress figure',
      inputs: { goalKg: ruleContext.goal.goalKg, currentKg: ruleContext.goal.currentKg },
    });

  return {
    goal: ruleContext.goal.goal,
    goalKg: ruleContext.goal.goalKg,
    currentKg: ruleContext.goal.currentKg,
    progressPercent,
    velocityKgPerWeek: trends.weightKg.perWeek,
    direction: trends.weightKg.direction,
    weeksMeasured: trends.weightKg.weeks,
    sourceEngine: 'body-engine + reports-engine',
    reason: `Body weight velocity is the slope through ${trends.weightKg.weeks} weekly averages, ${trends.weightKg.perWeek ?? 'not fitted'} ${trends.weightKg.unit}. Progress toward the goal is the figure the latest report already held; neither number was measured here.`,
  };
}

/* ── The analysis ───────────────────────────────────────────────────────── */

/**
 * Analyse one window of weekly reports.
 *
 * @param {object} input see createAnalyticsContext, plus `generatedAt`
 * @returns {object} AnalyticsSummary, frozen
 */
function analyse(input = {}) {
  const context = createAnalyticsContext(input);
  const explain = createExplainer();

  if (!context.weeksInWindow) {
    return emptyAnalysis(context, input.generatedAt);
  }

  const trends = fitTrends(context, explain);
  const ruleContext = ruleContextFor(context, trends);

  const applied = applyAll(
    Object.values(ANALYTICS_RULE_SETS).flat(),
    ruleContext,
    { findings: [] }
  );

  const { kept, refused } = withEvidenceOnly(applied.draft.findings);

  const byKind = (kind) => kept.filter((finding) => finding.kind === kind);

  const consistency = consistencySummary(context, explain);
  const adherence = adherenceSummary(context, trends, explain);
  const goal = goalSummary(ruleContext, trends, context, explain);

  const reasons = [...applied.reasons];

  if (refused.length) {
    reasons.push(makeReason(
      { id: 'analytics.refused', name: 'Findings refused', scope: 'analytics' },
      `${refused.length} finding${refused.length === 1 ? '' : 's'} could not be published: ${refused.map((item) => `${item.key} (${item.refusedFor})`).join(', ')}. A conclusion about months of training without evidence behind it is worse than no conclusion, whichever rule produced it.`,
      { refused }
    ));
  }

  if (!kept.length) {
    reasons.push(makeReason(
      { id: 'analytics.quiet', name: 'Nothing stood out', scope: 'analytics' },
      `No rule found a plateau, an improvement or a risk across ${context.weeksInWindow} weeks. That is a result: a window in which everything moved a little and nothing crossed a threshold produces no findings.`,
      { weeks: context.weeksInWindow }
    ));
  }

  return Object.freeze({
    period: context.period,
    range: { from: context.from, to: context.to, weeks: context.weeksInWindow, days: context.days },

    /* ── The trends ─────────────────────────────────────────────────── */
    trends,

    longTermTrends: {
      weight: trends.weightKg,
      strength: { volume: trends.volumeKg, oneRepMax: trends.oneRepMaxKg },
      running: { distance: trends.distanceKm, pace: trends.paceSecPerKm, load: trends.trainingLoad },
      nutrition: { calories: trends.calories, protein: trends.proteinG },
      recovery: { strain: trends.strainIndex, sleep: trends.sleepHours },
      consistency: { adherence: trends.adherencePercent, logging: trends.consistencyPercent },
    },

    performanceTrends: {
      volume: trends.volumeKg,
      oneRepMax: trends.oneRepMaxKg,
      distance: trends.distanceKm,
      pace: trends.paceSecPerKm,
    },

    weightTrend: trends.weightKg,
    strengthTrend: trends.volumeKg,
    runningTrend: trends.distanceKm,
    recoveryTrend: trends.strainIndex,
    bodyweightVelocity: trends.weightKg.perWeek,

    /* ── The summaries ──────────────────────────────────────────────── */
    goalProgress: goal,
    trainingConsistency: consistency,
    nutritionConsistency: {
      daysLoggedPerWeek: consistency.averageDaysLoggedPerWeek,
      weeksLogged: consistency.nutritionLoggedWeeks,
      averageCalories: meanOf(context.weeks, (week) => week.nutrition?.avgCalories, 0),
      averageProteinG: meanOf(context.weeks, (week) => week.nutrition?.avgProteinG, 0),
      calorieTrend: trends.calories,
      proteinTrend: trends.proteinG,
      sourceEngine: 'nutrition-engine + reports-engine',
      reason: 'Averages over the weekly nutrition summaries the reports engine built. Fibre and sodium are never logged, so no trend is offered for either.',
    },
    adherence,

    totals: {
      volumeKg: totalOf(context.weeks, (week) => week.gym?.volumeKg),
      sets: totalOf(context.weeks, (week) => week.gym?.sets),
      sessions: totalOf(context.weeks, (week) => week.gym?.completedSessions),
      distanceKm: totalOf(context.weeks, (week) => week.running?.distanceKm),
      runs: totalOf(context.weeks, (week) => week.running?.runs),
      daysLogged: totalOf(context.weeks, (week) => week.nutrition?.daysLogged),
    },

    /* ── The findings ───────────────────────────────────────────────── */
    findings: kept,
    plateaus: byKind(ANALYTICS_FINDING.PLATEAU),
    improvements: byKind(ANALYTICS_FINDING.IMPROVEMENT),
    regressions: byKind(ANALYTICS_FINDING.REGRESSION),
    risks: byKind(ANALYTICS_FINDING.RISK),

    plateauDetected: byKind(ANALYTICS_FINDING.PLATEAU).length > 0,
    improvementDetected: byKind(ANALYTICS_FINDING.IMPROVEMENT).length > 0,
    riskDetected: byKind(ANALYTICS_FINDING.RISK).length > 0,

    /* ── Provenance ─────────────────────────────────────────────────── */
    confidence: context.coverage.level,
    coverage: context.coverage,
    sufficient: context.sufficient,

    reasons,
    evidence: Object.fromEntries(kept.map((finding) => [finding.key, finding.evidence])),
    explanations: explain.map(),

    /** One figure, taken apart. */
    explain(key) { return explain.lookup(key); },
    /** The same as a sentence — for a console or a test, not for a screen. */
    describe(key) { return describeExplanation(explain.lookup(key)); },
    /** One finding by key, or null. */
    find(key) { return kept.find((finding) => finding.key === key) ?? null; },

    weeklyReports: context.weeks,

    meta: {
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      engineVersion: ANALYTICS_ENGINE_VERSION,
      engineId: 'analytics-engine',
      rulesApplied: applied.applied,
      findingsProduced: kept.length,
      refused,
      weeksAnalysed: context.weeksInWindow,
      weeksWithData: context.weeksWithData,
      reportEngineVersion: context.weeks.at(-1)?.meta?.engineVersion ?? null,
      /** Nothing in this list was measured here. */
      recalculated: [],
    },
  });
}

/** A window with no reports in it at all. */
function emptyAnalysis(context, generatedAt) {
  const empty = { perWeek: null, weeks: 0, direction: ANALYTICS_DIRECTION.UNKNOWN, movement: 'unknown' };

  return Object.freeze({
    period: context.period,
    range: { from: context.from, to: context.to, weeks: 0, days: 0 },

    trends: Object.fromEntries(Object.keys(METRICS).map((metric) => [metric, {
      ...empty, metric, label: METRICS[metric].label, unit: METRICS[metric].unit,
      band: METRICS[metric].band, better: METRICS[metric].better, source: METRICS[metric].source,
      note: 'No weekly report fell inside the window, so nothing was fitted.',
    }])),

    longTermTrends: {}, performanceTrends: {},
    weightTrend: empty, strengthTrend: empty, runningTrend: empty, recoveryTrend: empty,
    bodyweightVelocity: null,

    goalProgress: {
      goal: context.goal.goal ?? null, goalKg: null, currentKg: null,
      progressPercent: null, velocityKgPerWeek: null,
      direction: ANALYTICS_DIRECTION.UNKNOWN, weeksMeasured: 0,
      sourceEngine: 'analytics-engine',
      reason: 'No weekly report fell inside the window, so there is nothing to measure progress against.',
    },
    trainingConsistency: { weeksInWindow: 0, trainingWeeks: 0, runningWeeks: 0, nutritionLoggedWeeks: 0, emptyWeeks: 0, coverage: context.coverage, sourceEngine: 'analytics-engine', reason: 'An empty window.' },
    nutritionConsistency: { daysLoggedPerWeek: null, weeksLogged: 0, averageCalories: null, averageProteinG: null, sourceEngine: 'analytics-engine', reason: 'An empty window.' },
    adherence: { average: null, weeksScored: 0, weeksAtOrAboveLow: 0, lowLine: REPORTS.ADHERENCE_LOW, best: null, worst: null, byComponent: {}, sourceEngine: 'analytics-engine', reason: 'An empty window.' },

    totals: { volumeKg: 0, sets: 0, sessions: 0, distanceKm: 0, runs: 0, daysLogged: 0 },

    findings: [], plateaus: [], improvements: [], regressions: [], risks: [],
    plateauDetected: false, improvementDetected: false, riskDetected: false,

    confidence: REPORTS.CONFIDENCE_LEVEL.LOW,
    coverage: context.coverage,
    sufficient: false,

    reasons: [makeReason(
      { id: 'analytics.empty', name: 'Empty window', scope: 'analytics' },
      `No weekly report falls between ${context.from ?? 'the beginning'} and ${context.to ?? 'now'}. An empty window is reported as empty rather than as a stretch in which nothing improved — the two look identical in the data and are not the same thing.`,
      { from: context.from, to: context.to }
    )],
    evidence: {},
    explanations: {},
    explain() { return null; },
    describe() { return 'Nothing was recorded under that key.'; },
    find() { return null; },
    weeklyReports: [],

    meta: {
      generatedAt: generatedAt ?? new Date().toISOString(),
      engineVersion: ANALYTICS_ENGINE_VERSION,
      engineId: 'analytics-engine',
      rulesApplied: [], findingsProduced: 0, refused: [],
      weeksAnalysed: 0, weeksWithData: 0, recalculated: [],
    },
  });
}

/* ── Windows ────────────────────────────────────────────────────────────────
   The five entry points differ only in which weeks they clip to. Each is the
   same analysis over a different window, which is why none of them holds any
   logic of its own.                                                        */

/** The Monday n weeks before an ISO date. */
function weeksBefore(date, count) {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - count * UNITS.DAYS_PER_WEEK * 86400000)
    .toISOString().slice(0, 10);
}

/** The last week start in a list, for a window anchored on "now". */
function latestWeek(weeklyReports) {
  const starts = (weeklyReports ?? [])
    .map((report) => report?.range?.start ?? report?.weekStart)
    .filter(Boolean)
    .sort();
  return starts.at(-1) ?? null;
}

/** Build one period's window and analyse it. */
function forPeriod(period, input = {}) {
  const anchor = input.to ?? latestWeek(input.weeklyReports);
  const span = ANALYTICS.WEEKS[period] ?? 1;

  return analyse({
    ...input,
    period,
    to: anchor,
    from: input.from ?? (anchor ? weeksBefore(anchor, span - 1) : null),
  });
}

export const AnalyticsEngine = Object.freeze({
  /** The most recent week, analysed as a window of one. */
  weekly(input = {}) { return forPeriod(ANALYTICS_PERIOD.WEEKLY, input); },

  /** The last four weeks. */
  monthly(input = {}) { return forPeriod(ANALYTICS_PERIOD.MONTHLY, input); },

  /** The last thirteen weeks. */
  quarterly(input = {}) { return forPeriod(ANALYTICS_PERIOD.QUARTERLY, input); },

  /** The last fifty-two weeks. */
  yearly(input = {}) { return forPeriod(ANALYTICS_PERIOD.YEARLY, input); },

  /**
   * Any window, named by its ends.
   * @param {string} from ISO date, inclusive
   * @param {string} to   ISO date, inclusive
   */
  range(from, to, input = {}) {
    return analyse({ ...input, period: ANALYTICS_PERIOD.RANGE, from, to });
  },

  /** The analysis without a window applied — every report handed in. */
  analyse,

  /** The metrics it fits, and where each comes from. */
  metrics: METRICS,

  DIRECTION: ANALYTICS_DIRECTION,
  PERIOD: ANALYTICS_PERIOD,
  FINDING: ANALYTICS_FINDING,

  version: ANALYTICS_ENGINE_VERSION,
});
