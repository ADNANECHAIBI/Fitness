/**
 * insights-engine.js — phase 17. What stands out.
 *
 * The reports engine says what happened. This one says what is worth
 * noticing in it, and it does so without touching a single formula: its whole
 * input is a `WeeklyReport`, and every number it quotes was produced by an
 * engine that owns it — BMR and TDEE by the energy engine, pace and load by
 * the running engines, tonnage by the strength engine, the weight trend by
 * the body engine, adherence and coverage by the reports engine. If a figure
 * is not in the report, this engine does not have it, and says so rather
 * than deriving it.
 *
 * How an insight is produced
 *   1. The report becomes a rule context: the report itself, plus a handful
 *      of read-only conveniences (which warnings fired, how many improving
 *      signals there are, the streak length).
 *   2. Four rule sets run against it and append drafts.
 *   3. Every draft goes through `createInsight`, which refuses anything
 *      without evidence. Refusals are counted, never silently dropped.
 *   4. Duplicates are merged by key, the survivor keeping the stronger
 *      explanation and the louder severity.
 *   5. The survivors are ranked: priority, then severity, then confidence,
 *      then date.
 *   6. They are grouped into positive, neutral and warning, and the top of
 *      the ranking becomes the priority set.
 *
 * There is no display logic here. An insight is a record with a category, a
 * severity, a priority number and two sentences of text held as data — the
 * same way a rule's `message` has been data since phase 5. Nothing in this
 * file knows about a screen, a language, an order for the eye, or a colour.
 *
 * Pure: same report in, same insights out.
 */

import { applyAll, makeReason } from '../rules/rule.js';
import { INSIGHT_RULE_SETS } from '../rules/insights/index.js';
import {
  createInsight, rankInsights, mergeDuplicates, groupBySeverity,
} from './insight.js';
import { groupByMonth } from './report-context.js';
import { toNumber } from './calculation-engine.js';
import {
  INSIGHTS, INSIGHT_SEVERITY, INSIGHT_CATEGORY, REPORTS, WARNING,
  DEFICIT_GOALS, SURPLUS_GOALS,
} from './constants.js';

export const INSIGHTS_ENGINE_VERSION = '1.0.0';

/* ── The rule context ───────────────────────────────────────────────────── */

/**
 * Turn a weekly report into what the rules read.
 * Conveniences only — every value here is a lookup or a count over figures
 * the report already holds.
 */
function contextFor(report) {
  const warnings = report.warnings ?? [];
  const progress = report.progress ?? {};

  const warned = (type) => warnings.some((warning) => warning.type === type);
  const warning = (type) => warnings.find((item) => item.type === type) ?? { evidence: {} };

  /* Which independent measures moved which way. Two or more agreeing is what
     the improving/declining rules ask for — one number moving is noise. */
  const improvingSignals = [];
  const decliningSignals = [];

  if (progress.paceTrend?.direction === 'improving') improvingSignals.push('running pace');
  if (progress.paceTrend?.direction === 'declining') decliningSignals.push('running pace');

  if ((progress.volumeChangeKg ?? 0) > 0) improvingSignals.push('lifting tonnage');
  if ((progress.volumeChangeKg ?? 0) < 0) decliningSignals.push('lifting tonnage');

  if ((progress.distanceChangeKm ?? 0) > 0) improvingSignals.push('running distance');
  if ((progress.distanceChangeKm ?? 0) < 0) decliningSignals.push('running distance');

  if ((progress.adherenceChange ?? 0) > 0) improvingSignals.push('adherence');
  if ((progress.adherenceChange ?? 0) < 0) decliningSignals.push('adherence');

  if ((progress.strengthRecords ?? 0) > 0) improvingSignals.push('personal records');

  const goal = report.goal;

  return {
    report,
    date: report.range?.end ?? null,
    goal,
    directionalGoal: DEFICIT_GOALS.includes(goal) || SURPLUS_GOALS.includes(goal),

    warned,
    warning,
    improvingSignals,
    decliningSignals,

    streakWeeks: toNumber(report.explanations?.['streak.weeks']?.value) ?? 0,
    /* How many consecutive weeks the scale has been flat, as the reports
       engine counted it. One week inside the band is noise; the stall rules
       read this rather than the single week's rate. */
    flatWeightWeeks: toNumber(report.explanations?.['weight.flatWeeks']?.value) ?? 0,
    repeatedMissWeeks: warned(WARNING.MISSED_WORKOUTS)
      ? (toNumber(warning(WARNING.MISSED_WORKOUTS).evidence?.repeatedWeeks) ?? 1)
      : 0,

    /**
     * Confidence for an insight: the report's own data coverage, which a rule
     * may lower but never raise. An observation cannot be surer than the week
     * it was drawn from.
     */
    confidence(cap = REPORTS.CONFIDENCE_LEVEL.HIGH) {
      const order = [
        REPORTS.CONFIDENCE_LEVEL.LOW,
        REPORTS.CONFIDENCE_LEVEL.MEDIUM,
        REPORTS.CONFIDENCE_LEVEL.HIGH,
      ];
      const level = report.coverage?.level ?? REPORTS.CONFIDENCE_LEVEL.LOW;
      return order[Math.min(order.indexOf(level), order.indexOf(cap))];
    },
  };
}

/* ── Weekly ─────────────────────────────────────────────────────────────── */

/**
 * The insights for one week.
 *
 * @param {{report: object, generatedAt?: string}} input a WeeklyReport
 * @returns {object} WeeklyInsights
 */
function weekly({ report, generatedAt } = {}) {
  if (!report || !report.range) {
    return emptyWeekly(generatedAt, 'No weekly report was supplied, so there is nothing to observe.');
  }

  const context = contextFor(report);

  /* One pass over every rule set. They share a draft so a later set can see
     what an earlier one appended, but none of them currently need to — the
     merge step is what resolves agreement between them. */
  const applied = applyAll(
    Object.values(INSIGHT_RULE_SETS).flat(),
    context,
    { insights: [] }
  );

  const created = [];
  const refused = [];

  for (const draft of applied.draft.insights) {
    const { insight, refusedFor } = createInsight(draft);
    if (insight) created.push(insight);
    else refused.push({ key: draft.key ?? 'unnamed', refusedFor });
  }

  const { insights: unique, merged } = mergeDuplicates(created);
  const ranked = rankInsights(unique).slice(0, INSIGHTS.MAX_PER_WEEK);
  const groups = groupBySeverity(ranked);

  const priority = ranked
    .filter((insight) => insight.priority >= INSIGHTS.PRIORITY_THRESHOLD)
    .slice(0, INSIGHTS.MAX_PRIORITY);

  const reasons = [...applied.reasons];

  if (refused.length) {
    reasons.push(makeReason(
      { id: 'insights.refused', name: 'Insights refused', scope: 'insight' },
      `${refused.length} insight${refused.length === 1 ? '' : 's'} could not be created: ${refused.map((item) => `${item.key} (${item.refusedFor})`).join(', ')}. An observation without evidence is not published, whichever rule produced it.`,
      { refused }
    ));
  }

  if (merged) {
    reasons.push(makeReason(
      { id: 'insights.merged', name: 'Duplicates merged', scope: 'insight' },
      `${merged} insight${merged === 1 ? '' : 's'} said something an earlier rule had already said and ${merged === 1 ? 'was' : 'were'} folded into it, keeping whichever explanation rested on more evidence at higher confidence.`,
      { merged }
    ));
  }

  if (!ranked.length) {
    reasons.push(makeReason(
      { id: 'insights.none', name: 'Nothing stood out', scope: 'insight' },
      'No rule found anything worth reporting in this week. That is an outcome, not a failure: an ordinary week with nothing crossing a threshold produces no insights.',
      { weekStart: report.range.start }
    ));
  }

  return Object.freeze({
    weekStart: report.range.start,
    weekEnd: report.range.end,
    weekNumber: report.weekNumber ?? null,

    positive: groups.positive,
    neutral: groups.neutral,
    warning: groups.warning,
    priority,

    all: ranked,
    byCategory: countBy(ranked, (insight) => insight.category),
    reasons,

    /** One insight by its key, or null. */
    find(key) { return ranked.find((insight) => insight.key === key) ?? null; },

    meta: {
      generatedAt: generatedAt ?? report.meta?.generatedAt ?? new Date().toISOString(),
      engineVersion: INSIGHTS_ENGINE_VERSION,
      engineId: 'insights-engine',
      rulesApplied: applied.applied,
      produced: created.length,
      refused,
      merged,
      coverage: report.coverage?.ratio ?? null,
      reportEngineVersion: report.meta?.engineVersion ?? null,
    },
  });
}

/** Count how many insights fall under each value of a key. */
function countBy(insights, read) {
  const counts = {};
  for (const insight of insights) {
    const key = read(insight);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function emptyWeekly(generatedAt, why) {
  return Object.freeze({
    weekStart: null, weekEnd: null, weekNumber: null,
    positive: [], neutral: [], warning: [], priority: [], all: [],
    byCategory: {},
    reasons: [makeReason({ id: 'insights.no-report', name: 'No report', scope: 'insight' }, why)],
    find() { return null; },
    meta: {
      generatedAt: generatedAt ?? new Date().toISOString(),
      engineVersion: INSIGHTS_ENGINE_VERSION,
      engineId: 'insights-engine',
      rulesApplied: [], produced: 0, refused: [], merged: 0, coverage: null,
    },
  });
}

/* ── Monthly ────────────────────────────────────────────────────────────── */

/**
 * The insights for a month.
 *
 * Built from the weekly insight sets and the monthly report, both of which
 * already exist. Nothing is re-derived: the best achievement is the highest
 * ranked positive insight of the month, the biggest problem the highest
 * ranked warning, the biggest improvement the largest trend the monthly
 * report already fitted.
 *
 * @param {{month?: string, monthlyReport?: object, weeklyInsights?: object[], generatedAt?: string}} input
 * @returns {object} MonthlyInsights
 */
function monthly({ month, monthlyReport = null, weeklyInsights = [], generatedAt } = {}) {
  const key = month ?? monthlyReport?.month ?? null;

  const sets = [...weeklyInsights]
    .filter((set) => set?.weekStart)
    .filter((set) => !key || set.weekStart.slice(0, 7) === key)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const everyInsight = rankInsights(sets.flatMap((set) => set.all ?? []));

  const bestAchievement = everyInsight
    .find((insight) => insight.severity === INSIGHT_SEVERITY.POSITIVE) ?? null;

  const biggestProblem = everyInsight
    .find((insight) =>
      insight.severity === INSIGHT_SEVERITY.CRITICAL ||
      insight.severity === INSIGHT_SEVERITY.WARNING) ?? null;

  const biggestImprovement = improvementFrom(monthlyReport);
  const longTermTrend = trendFrom(monthlyReport, sets);

  /* Recommendations are the reports engine's. The month counts how often each
     was made and repeats nothing of its own. */
  const recommendationsSummary = summariseRecommendations(monthlyReport);

  const reasons = [];

  if (!sets.length) {
    reasons.push(makeReason(
      { id: 'insights.month-empty', name: 'Empty month', scope: 'month' },
      `No weekly insight set falls inside ${key ?? 'the requested month'}, so the month has nothing to summarise. An empty month is reported as empty rather than as a month in which nothing went wrong.`,
      { month: key }
    ));
  } else {
    reasons.push(makeReason(
      { id: 'insights.month-assembled', name: 'Month assembled', scope: 'month' },
      `${everyInsight.length} insight${everyInsight.length === 1 ? '' : 's'} across ${sets.length} week${sets.length === 1 ? '' : 's'}, ranked by priority, severity, confidence and date. The month re-runs no rule: it reads what the weeks already concluded.`,
      { month: key, weeks: sets.length }
    ));
  }

  if (sets.length && sets.length < INSIGHTS.MIN_WEEKS_FOR_MONTHLY) {
    reasons.push(makeReason(
      { id: 'insights.month-thin', name: 'Not enough weeks', scope: 'month' },
      `Only ${sets.length} week is on record, below the ${INSIGHTS.MIN_WEEKS_FOR_MONTHLY} a monthly claim needs. The long-term trend is reported as unavailable rather than fitted through one point.`,
      { weeks: sets.length }
    ));
  }

  return Object.freeze({
    month: key,
    weeks: sets.length,

    bestAchievement,
    biggestProblem,
    biggestImprovement,
    longTermTrend,
    recommendationsSummary,

    all: everyInsight,
    byCategory: countBy(everyInsight, (insight) => insight.category),
    bySeverity: countBy(everyInsight, (insight) => insight.severity),
    weeklyInsights: sets,
    reasons,

    meta: {
      generatedAt: generatedAt ?? new Date().toISOString(),
      engineVersion: INSIGHTS_ENGINE_VERSION,
      engineId: 'insights-engine',
      reportMonth: monthlyReport?.month ?? null,
      hasMonthlyReport: Boolean(monthlyReport),
    },
  });
}

/**
 * The trend that moved most, as the monthly report already fitted it.
 * Trends are compared by how far they moved relative to their own threshold,
 * not in raw units — kilograms of tonnage and kilograms of body weight cannot
 * be ranked against each other on size.
 */
function improvementFrom(monthlyReport) {
  if (!monthlyReport) return null;

  const candidates = [
    { key: 'strength', category: INSIGHT_CATEGORY.STRENGTH, trend: monthlyReport.strengthTrend, better: 'up', scale: 500 },
    { key: 'running', category: INSIGHT_CATEGORY.RUNNING, trend: monthlyReport.runningTrend, better: 'up', scale: 2 },
    { key: 'weight', category: INSIGHT_CATEGORY.WEIGHT, trend: monthlyReport.weightTrend, better: 'either', scale: 0.25 },
  ].filter((candidate) => toNumber(candidate.trend?.perWeek) !== null);

  if (!candidates.length) return null;

  const scored = candidates
    .map((candidate) => ({
      ...candidate,
      perWeek: candidate.trend.perWeek,
      score: Math.abs(candidate.trend.perWeek) / candidate.scale,
      improving: candidate.better === 'either' ? true : candidate.trend.perWeek > 0,
    }))
    .filter((candidate) => candidate.improving)
    .sort((a, b) => b.score - a.score);

  const winner = scored[0];
  if (!winner) return null;

  return {
    area: winner.key,
    category: winner.category,
    perWeek: winner.perWeek,
    unit: winner.trend.unit,
    weeks: winner.trend.weeks,
    evidence: { first: winner.trend.first ?? null, last: winner.trend.last ?? null },
    sourceEngine: 'reports-engine',
    reason: `${winner.key} moved ${winner.perWeek} ${winner.trend.unit} across ${winner.trend.weeks} weeks, the largest move relative to what counts as meaningful in its own units.`,
  };
}

/** The month's direction, from the trends the monthly report fitted. */
function trendFrom(monthlyReport, sets) {
  if (!monthlyReport) {
    return { available: false, reason: 'No monthly report was supplied, so no trend was fitted.' };
  }

  if (sets.length < INSIGHTS.MIN_WEEKS_FOR_MONTHLY) {
    return {
      available: false,
      weeks: sets.length,
      reason: `A monthly trend needs at least ${INSIGHTS.MIN_WEEKS_FOR_MONTHLY} weeks; ${sets.length} were available.`,
    };
  }

  return {
    available: true,
    weeks: monthlyReport.totals?.weeks ?? sets.length,
    weight: monthlyReport.weightTrend,
    strength: monthlyReport.strengthTrend,
    running: monthlyReport.runningTrend,
    nutrition: monthlyReport.nutritionTrend,
    recovery: monthlyReport.recoveryTrend,
    consistency: monthlyReport.consistency,
    sourceEngine: 'reports-engine',
    reason: 'Every line here was fitted by the reports engine over the weekly reports. This engine chose which to show, not what they say.',
  };
}

/** How often each recommendation was made across the month, most first. */
function summariseRecommendations(monthlyReport) {
  const weeks = monthlyReport?.weeklyReports ?? [];
  const counts = new Map();

  for (const week of weeks) {
    for (const item of week.recommendations ?? []) {
      const existing = counts.get(item.id);
      counts.set(item.id, {
        id: item.id,
        action: item.action,
        weeks: (existing?.weeks ?? 0) + 1,
        confidence: item.confidence,
        sourceEngine: item.sourceEngine,
        lastReason: item.reason,
      });
    }
  }

  const items = [...counts.values()].sort((a, b) => b.weeks - a.weeks);

  return {
    items,
    total: items.reduce((sum, item) => sum + item.weeks, 0),
    repeated: items.filter((item) => item.weeks > 1).map((item) => item.id),
    weeksConsidered: weeks.length,
    note: 'Counts of what the reports engine already recommended. Nothing new is advised here.',
  };
}

export const InsightsEngine = Object.freeze({
  weekly,
  monthly,

  /** Group weekly insight sets by calendar month. */
  months(weeklyInsights) {
    return groupByMonth(
      (weeklyInsights ?? []).map((set) => ({ ...set, weekStart: set.weekStart }))
    );
  },

  /** Rank a list of insights without producing any. */
  rank: rankInsights,

  version: INSIGHTS_ENGINE_VERSION,
});
