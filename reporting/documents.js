/**
 * documents.js — turning engine output into documents.
 *
 * Three builders, one job each, and between them not a single arithmetic
 * operator. Every figure below is read out of an object some engine produced,
 * and where that engine wrote an explanation the explanation travels with the
 * figure — `fromExplanation` exists so the common case cannot be got wrong.
 *
 * The builders are **pure functions of their arguments**. They import nothing
 * from `app/`, which is what keeps the dependency one-directional:
 * `app/reporting-service.js` gathers the report, the insights, the analytics
 * and the coaching session and hands them down. That choice also means every
 * document in this file can be built in a test without storage, a plan, or a
 * cache — which is why the phase-22 suite runs in a fraction of a second.
 *
 * What a builder decides: which figures appear, in what order, under which
 * label key. That is presentation. What it never decides: what any figure is.
 *
 * One deliberate asymmetry. A **label** is an i18n key, resolved by whichever
 * renderer draws it. A **sentence an engine wrote** — a warning's message, a
 * coach's reasoning, an insight's summary — is carried verbatim as text and
 * never translated, because those sentences contain figures and clauses the
 * engine composed for a reason. Re-wording them in another language would be
 * this layer making a claim, which is the one thing it must not do.
 */

import {
  reportDocument, emptyDocument, metricsSection, tableSection, listSection,
  findingsSection, chartSection, textSection, field, fromExplanation,
} from './report-document.js';
import { lineChart, barChart, areaChart, progressChart, comparisonChart, seriesFrom } from './charts-engine.js';
import { REPORT_KIND } from './constants.js';

/* ── Shared helpers ─────────────────────────────────────────────────────────
   Reading, never deriving. `pick` walks a path and returns null rather than
   throwing, which is what lets a document be built from a partial report.  */

const pick = (object, path) =>
  path.split('.').reduce((value, key) => (value === null || value === undefined ? null : value[key]), object) ?? null;

/** A field whose value comes from a path and whose provenance is named. */
const at = (object, path, labelKey, { unit = null, source = null, reason = null } = {}) =>
  field({ labelKey, value: pick(object, path), unit, source, sourceKey: path, reason });

/** A trend, as the analytics engine produced it — slope, span and direction. */
function trendFields(trend, labelKey) {
  if (!trend) return [field({ labelKey, value: null, source: 'analytics-engine', reason: 'No trend was fitted.' })];

  return [field({
    labelKey,
    value: trend.perWeek,
    unit: trend.unit,
    source: trend.source ?? 'analytics-engine',
    sourceKey: `trend.${trend.metric}`,
    reason: trend.note ?? null,
    evidence: {
      weeks: trend.weeks, first: trend.first, last: trend.last,
      direction: trend.direction, flatBand: trend.band,
    },
  })];
}

/* ── Weekly ─────────────────────────────────────────────────────────────── */

/**
 * A week, as a printable document.
 *
 * @param {object} input
 * @param {object} input.report     WeeklyReport — reports-engine
 * @param {object} [input.insights] WeeklyInsights — insights-engine
 * @param {object} [input.coach]    CoachSession — coach-engine
 * @param {object} [input.dashboard] DashboardSnapshot — dashboard-engine
 * @returns {object} ReportDocument
 */
export function weeklyReportDocument({ report, insights = null, coach = null, dashboard = null, generatedAt = null } = {}) {
  if (!report) {
    return emptyDocument({
      kind: REPORT_KIND.WEEKLY,
      titleKey: 'report.weekly.title',
      reasonKey: 'report.empty.noWeek',
    });
  }

  const ex = report.explanations ?? {};
  const from = pick(report, 'range.start');
  const to = pick(report, 'range.end');

  const sections = [
    /* The week itself. Structural figures, deliberately unsourced. */
    metricsSection({
      id: 'week',
      titleKey: 'report.section.week',
      fields: [
        field({ labelKey: 'report.field.weekNumber', value: report.weekNumber, source: 'reports-engine', sourceKey: 'weekNumber' }),
        field({ labelKey: 'report.field.goal', value: null, text: report.goal, source: 'profile', sourceKey: 'goal' }),
        fromExplanation(ex, 'adherence.overall', 'report.field.adherence', { unit: '%' }),
        at(report, 'coverage.level', 'report.field.confidence', { source: 'reports-engine' }),
      ],
    }),

    metricsSection({
      id: 'weight',
      titleKey: 'report.section.weight',
      fields: [
        fromExplanation(ex, 'weight.averageKg', 'report.field.averageWeight', { unit: 'kg' }),
        fromExplanation(ex, 'weight.changeKg', 'report.field.weightChange', { unit: 'kg' }),
        fromExplanation(ex, 'weight.weeklyChangeKg', 'report.field.weightRate', { unit: 'kg/week' }),
        at(report, 'weight.readings', 'report.field.weighIns', { source: 'reports-engine' }),
      ],
    }),

    metricsSection({
      id: 'goal',
      titleKey: 'report.section.goal',
      fields: [
        at(report, 'weight.currentKg', 'report.field.currentWeight', { unit: 'kg', source: 'body-engine' }),
        at(report, 'weight.goalKg', 'report.field.goalWeight', { unit: 'kg', source: 'profile' }),
        fromExplanation(ex, 'weight.progressPercent', 'report.field.goalProgress', { unit: '%' }),
      ],
    }),

    metricsSection({
      id: 'workout',
      titleKey: 'report.section.workout',
      fields: [
        fromExplanation(ex, 'gym.adherencePercent', 'report.field.sessionsCompleted', { unit: '%' }),
        at(report, 'gym.completedSessions', 'report.field.sessions', { source: 'execution-engine' }),
        at(report, 'gym.sets', 'report.field.sets', { source: 'execution-engine' }),
        fromExplanation(ex, 'load.gymVolumeKg', 'report.field.volume', { unit: 'kg' }),
      ],
    }),

    metricsSection({
      id: 'running',
      titleKey: 'report.section.running',
      fields: [
        fromExplanation(ex, 'running.distanceKm', 'report.field.distance', { unit: 'km' }),
        at(report, 'running.runs', 'report.field.runs', { source: 'running-engine' }),
        at(report, 'running.avgPaceSecPerKm', 'report.field.pace', { unit: 'sec/km', source: 'running-engine' }),
        at(report, 'running.trainingLoad.verdict', 'report.field.loadVerdict', { source: 'running-progress-engine' }),
      ],
    }),

    metricsSection({
      id: 'nutrition',
      titleKey: 'report.section.nutrition',
      fields: [
        fromExplanation(ex, 'nutrition.adherencePercent', 'report.field.nutritionAdherence', { unit: '%' }),
        at(report, 'nutrition.avgCalories', 'report.field.avgCalories', { unit: 'kcal', source: 'nutrition-engine' }),
        at(report, 'nutrition.avgProteinG', 'report.field.avgProtein', { unit: 'g', source: 'nutrition-engine' }),
        at(report, 'nutrition.daysLogged', 'report.field.daysLogged', { source: 'reports-engine' }),
      ],
    }),

    metricsSection({
      id: 'meals',
      titleKey: 'report.section.meals',
      fields: [
        fromExplanation(ex, 'meals.compliancePercent', 'report.field.mealCompliance', { unit: '%' }),
        at(report, 'meals.weeklyCostMad', 'report.field.mealCost', { unit: 'MAD', source: 'meal-planning-engine' }),
        at(report, 'meals.withinBudget', 'report.field.withinBudget', { source: 'meal-planning-engine' }),
      ],
    }),

    metricsSection({
      id: 'recovery',
      titleKey: 'report.section.recovery',
      fields: [
        at(report, 'recovery.status', 'report.field.recoveryStatus', { source: 'recovery' }),
        fromExplanation(ex, 'recovery.strainIndex', 'report.field.strainIndex', { unit: '0–100' }),
        fromExplanation(ex, 'recovery.avgFatigue', 'report.field.fatigue', { unit: '1–10' }),
        at(report, 'recovery.avgSleepHours', 'report.field.sleep', { unit: 'hours', source: 'recovery' }),
      ],
    }),

    metricsSection({
      id: 'progress',
      titleKey: 'report.section.progress',
      fields: [
        fromExplanation(ex, 'streak.weeks', 'report.field.streak', { unit: 'weeks' }),
        fromExplanation(ex, 'weight.flatWeeks', 'report.field.flatWeeks', { unit: 'weeks' }),
      ],
    }),

    /* Adherence as a bar chart, from the four figures the report already
       scored. The chart engine is handed numbers and a unit and nothing else. */
    chartSection({
      id: 'adherence-chart',
      titleKey: 'report.chart.adherence',
      chart: barChart({
        titleKey: 'report.chart.adherence',
        labels: ['report.label.gym', 'report.label.running', 'report.label.nutrition', 'report.label.overall'],
        series: [{
          labelKey: 'report.label.adherence',
          values: [
            pick(report, 'adherence.gym'),
            pick(report, 'adherence.running'),
            pick(report, 'adherence.nutrition'),
            pick(report, 'adherence.overall'),
          ],
        }],
        unit: '%',
      }),
      metadata: { source: 'reports-engine' },
    }),

    report.warnings?.length
      ? findingsSection({ id: 'warnings', titleKey: 'report.section.warnings', findings: report.warnings, metadata: { source: 'reports-engine' } })
      : null,

    report.achievements?.length
      ? findingsSection({ id: 'achievements', titleKey: 'report.section.achievements', findings: report.achievements, metadata: { source: 'reports-engine' } })
      : null,

    insights?.priority?.length || insights?.all?.length
      ? findingsSection({
          id: 'insights',
          titleKey: 'report.section.insights',
          findings: (insights.priority ?? insights.all ?? []),
          metadata: { source: 'insights-engine' },
        })
      : null,

    coach?.advice?.length
      ? findingsSection({
          id: 'coach',
          titleKey: 'report.section.coach',
          findings: coach.advice,
          metadata: { source: 'coach-engine' },
        })
      : null,

    coach?.weeklySummary
      ? textSection({
          id: 'coach-summary',
          titleKey: 'report.section.summary',
          text: `${coach.weeklySummary.headline} ${coach.weeklySummary.detail}`,
          source: 'coach-engine',
        })
      : null,

    dashboard?.today
      ? metricsSection({
          id: 'today',
          titleKey: 'report.section.today',
          fields: [
            field({ labelKey: 'report.field.requiredMinutes', value: dashboard.today.requiredMinutes, unit: 'minutes', source: 'dashboard-engine', sourceKey: 'today.requiredMinutes' }),
            field({ labelKey: 'report.field.riskLevel', value: null, text: dashboard.health?.riskLevel ?? null, source: 'dashboard-engine', sourceKey: 'health.riskLevel' }),
          ],
        })
      : null,
  ];

  return reportDocument({
    kind: REPORT_KIND.WEEKLY,
    titleKey: 'report.weekly.title',
    subtitleKey: 'report.weekly.subtitle',
    subtitleVars: { week: report.weekNumber },
    period: { from, to, labelKey: 'report.period.week', labelVars: { from, to } },
    sections,
    warnings: report.warnings ?? [],
    recommendations: report.recommendations ?? [],
    explanations: ex,
    generatedAt,
    metadata: {
      source: 'reports-engine',
      reportEngineVersion: pick(report, 'meta.engineVersion'),
      coverage: report.coverage ?? null,
      contributors: [
        'reports-engine',
        insights ? 'insights-engine' : null,
        coach ? 'coach-engine' : null,
        dashboard ? 'dashboard-engine' : null,
      ].filter(Boolean),
    },
  });
}

/* ── Monthly ────────────────────────────────────────────────────────────── */

/**
 * A month, as a printable document.
 *
 * @param {object} input
 * @param {object} input.monthly    MonthlyReport — reports-engine
 * @param {object} [input.analytics] AnalyticsSummary — analytics-engine
 * @param {object} [input.insights]  MonthlyInsights
 * @param {object} [input.coach]     CoachSession
 */
export function monthlyReportDocument({ monthly, analytics = null, insights = null, coach = null, generatedAt = null } = {}) {
  if (!monthly && !analytics) {
    return emptyDocument({
      kind: REPORT_KIND.MONTHLY,
      titleKey: 'report.monthly.title',
      reasonKey: 'report.empty.noMonth',
    });
  }

  const ex = monthly?.explanations ?? {};
  const weeks = monthly?.weeklyReports ?? analytics?.weeklyReports ?? [];

  /* One chart per trend, each built from the weekly figures the reports
     engine already produced. `seriesFrom` reads; it does not compute. */
  const weightSeries = seriesFrom(weeks, (week) => week.range?.start ?? week.weekStart, (week) => week.weight?.averageKg);
  const volumeSeries = seriesFrom(weeks, (week) => week.range?.start ?? week.weekStart, (week) => week.gym?.volumeKg);
  const distanceSeries = seriesFrom(weeks, (week) => week.range?.start ?? week.weekStart, (week) => week.running?.distanceKm);
  const adherenceSeries = seriesFrom(weeks, (week) => week.range?.start ?? week.weekStart, (week) => week.adherence?.overall);

  const sections = [
    metricsSection({
      id: 'month',
      titleKey: 'report.section.month',
      fields: [
        field({ labelKey: 'report.field.month', value: null, text: monthly?.month ?? null, source: 'reports-engine', sourceKey: 'month' }),
        field({ labelKey: 'report.field.weeks', value: weeks.length, source: 'reports-engine', sourceKey: 'weeklyReports' }),
        at(monthly, 'consistency.weeksLogged', 'report.field.weeksLogged', { source: 'reports-engine' }),
      ],
    }),

    metricsSection({
      id: 'weight-trend',
      titleKey: 'report.section.weightTrend',
      fields: monthly?.weightTrend
        ? [field({
            labelKey: 'report.field.weightTrend',
            value: monthly.weightTrend.perWeek,
            unit: monthly.weightTrend.unit,
            source: 'body-engine',
            sourceKey: 'weightTrend',
            reason: monthly.weightTrend.note ?? null,
            evidence: { weeks: monthly.weightTrend.weeks, first: monthly.weightTrend.first, last: monthly.weightTrend.last },
          })]
        : trendFields(analytics?.trends?.weightKg, 'report.field.weightTrend'),
    }),

    metricsSection({
      id: 'training-trend',
      titleKey: 'report.section.trainingTrend',
      fields: [
        ...(monthly?.strengthTrend
          ? [field({
              labelKey: 'report.field.volumeTrend', value: monthly.strengthTrend.perWeek,
              unit: monthly.strengthTrend.unit, source: 'strength-engine', sourceKey: 'strengthTrend',
              evidence: { weeks: monthly.strengthTrend.weeks },
            })]
          : trendFields(analytics?.trends?.volumeKg, 'report.field.volumeTrend')),
        ...trendFields(analytics?.trends?.oneRepMaxKg, 'report.field.oneRepMaxTrend'),
      ],
    }),

    metricsSection({
      id: 'running-trend',
      titleKey: 'report.section.runningTrend',
      fields: [
        ...(monthly?.runningTrend
          ? [field({
              labelKey: 'report.field.distanceTrend', value: monthly.runningTrend.perWeek,
              unit: monthly.runningTrend.unit, source: 'running-engine', sourceKey: 'runningTrend',
              evidence: { weeks: monthly.runningTrend.weeks },
            })]
          : trendFields(analytics?.trends?.distanceKm, 'report.field.distanceTrend')),
        ...trendFields(analytics?.trends?.paceSecPerKm, 'report.field.paceTrend'),
      ],
    }),

    metricsSection({
      id: 'nutrition-trend',
      titleKey: 'report.section.nutritionTrend',
      fields: [
        ...(monthly?.nutritionTrend
          ? [field({
              labelKey: 'report.field.calorieTrend', value: monthly.nutritionTrend.perWeek,
              unit: monthly.nutritionTrend.unit, source: 'nutrition-engine', sourceKey: 'nutritionTrend',
            })]
          : trendFields(analytics?.trends?.calories, 'report.field.calorieTrend')),
        ...trendFields(analytics?.trends?.proteinG, 'report.field.proteinTrend'),
      ],
    }),

    metricsSection({
      id: 'recovery-trend',
      titleKey: 'report.section.recoveryTrend',
      fields: [
        ...(monthly?.recoveryTrend
          ? [field({
              labelKey: 'report.field.strainTrend', value: monthly.recoveryTrend.perWeek,
              unit: monthly.recoveryTrend.unit, source: 'planner-engine', sourceKey: 'recoveryTrend',
            })]
          : trendFields(analytics?.trends?.strainIndex, 'report.field.strainTrend')),
        ...trendFields(analytics?.trends?.sleepHours, 'report.field.sleepTrend'),
      ],
    }),

    metricsSection({
      id: 'consistency',
      titleKey: 'report.section.consistency',
      fields: [
        at(monthly, 'consistency.trainingWeeks', 'report.field.trainingWeeks', { source: 'reports-engine' }),
        at(monthly, 'consistency.runningWeeks', 'report.field.runningWeeks', { source: 'reports-engine' }),
        at(analytics, 'adherence.average', 'report.field.avgAdherence', { unit: '%', source: 'reports-engine' }),
        ...trendFields(analytics?.trends?.adherencePercent, 'report.field.adherenceTrend'),
      ],
    }),

    metricsSection({
      id: 'totals',
      titleKey: 'report.section.totals',
      fields: [
        /* `at` always returns a field, so the fallback has to be chosen on the
           value rather than on the field — an earlier version used `??` on the
           field itself and silently never reached the analytics summary. */
        at(pick(monthly, 'totals.volumeKg') !== null ? monthly : analytics,
          'totals.volumeKg', 'report.field.totalVolume', { unit: 'kg', source: 'strength-engine' }),
        at(pick(monthly, 'totals.distanceKm') !== null ? monthly : analytics,
          'totals.distanceKm', 'report.field.totalDistance', { unit: 'km', source: 'running-engine' }),
        at(monthly, 'totals.sessions', 'report.field.totalSessions', { source: 'execution-engine' }),
      ],
    }),

    chartSection({
      id: 'weight-chart',
      titleKey: 'report.chart.weight',
      chart: lineChart({
        titleKey: 'report.chart.weight',
        labels: weightSeries.labels,
        series: [{ labelKey: 'report.label.weight', values: weightSeries.values }],
        unit: 'kg',
      }),
      metadata: { source: 'reports-engine' },
    }),

    chartSection({
      id: 'volume-chart',
      titleKey: 'report.chart.volume',
      chart: barChart({
        titleKey: 'report.chart.volume',
        labels: volumeSeries.labels,
        series: [{ labelKey: 'report.label.volume', values: volumeSeries.values }],
        unit: 'kg',
      }),
      metadata: { source: 'strength-engine' },
    }),

    chartSection({
      id: 'distance-chart',
      titleKey: 'report.chart.distance',
      chart: areaChart({
        titleKey: 'report.chart.distance',
        labels: distanceSeries.labels,
        series: [{ labelKey: 'report.label.distance', values: distanceSeries.values }],
        unit: 'km',
      }),
      metadata: { source: 'running-engine' },
    }),

    chartSection({
      id: 'adherence-trend-chart',
      titleKey: 'report.chart.adherenceTrend',
      chart: lineChart({
        titleKey: 'report.chart.adherenceTrend',
        labels: adherenceSeries.labels,
        series: [{ labelKey: 'report.label.adherence', values: adherenceSeries.values }],
        unit: '%',
      }),
      metadata: { source: 'reports-engine' },
    }),

    monthly?.personalRecords?.length
      ? tableSection({
          id: 'records',
          titleKey: 'report.section.records',
          columnKeys: ['report.column.exercise', 'report.column.value', 'report.column.date'],
          rows: monthly.personalRecords.map((record) => [
            record.exerciseId ?? record.exercise ?? null,
            record.value ?? null,
            record.date ?? null,
          ]),
          metadata: { source: 'execution-engine' },
        })
      : null,

    analytics?.improvements?.length
      ? findingsSection({ id: 'achievements', titleKey: 'report.section.achievements', findings: analytics.improvements, metadata: { source: 'analytics-engine' } })
      : null,

    analytics?.risks?.length || analytics?.regressions?.length
      ? findingsSection({
          id: 'warnings',
          titleKey: 'report.section.warnings',
          findings: [...(analytics.risks ?? []), ...(analytics.regressions ?? [])],
          metadata: { source: 'analytics-engine' },
        })
      : null,

    insights?.all?.length
      ? findingsSection({ id: 'insights', titleKey: 'report.section.insights', findings: insights.priority ?? insights.all, metadata: { source: 'insights-engine' } })
      : null,

    coach?.weeklyAdvice?.length
      ? findingsSection({ id: 'coach', titleKey: 'report.section.coach', findings: coach.weeklyAdvice, metadata: { source: 'coach-engine' } })
      : null,
  ];

  return reportDocument({
    kind: REPORT_KIND.MONTHLY,
    titleKey: 'report.monthly.title',
    subtitleKey: 'report.monthly.subtitle',
    subtitleVars: { month: monthly?.month ?? null },
    period: {
      from: weeks[0]?.range?.start ?? weeks[0]?.weekStart ?? analytics?.range?.from ?? null,
      to: weeks.at(-1)?.range?.end ?? analytics?.range?.to ?? null,
      labelKey: 'report.period.month',
      labelVars: { month: monthly?.month ?? null },
    },
    sections,
    warnings: analytics?.risks ?? [],
    recommendations: coach?.weeklyAdvice ?? [],
    explanations: { ...ex, ...(analytics?.explanations ?? {}) },
    generatedAt,
    metadata: {
      source: 'reports-engine',
      weeks: weeks.length,
      confidence: analytics?.confidence ?? null,
      contributors: [
        monthly ? 'reports-engine' : null,
        analytics ? 'analytics-engine' : null,
        insights ? 'insights-engine' : null,
        coach ? 'coach-engine' : null,
      ].filter(Boolean),
    },
  });
}

/* ── Progress ───────────────────────────────────────────────────────────── */

/**
 * Long-term progress, as a printable document.
 *
 * Everything here comes from one `AnalyticsSummary`. The phase brief is
 * explicit that no trend, pace or load may be computed in this layer, and the
 * way that is guaranteed is structural: this builder has no access to anything
 * that could compute one.
 *
 * @param {object} input
 * @param {object} input.analytics  AnalyticsSummary — analytics-engine
 */
export function progressReportDocument({ analytics, coach = null, generatedAt = null } = {}) {
  if (!analytics || !analytics.range?.weeks) {
    return emptyDocument({
      kind: REPORT_KIND.PROGRESS,
      titleKey: 'report.progress.title',
      reasonKey: 'report.empty.noProgress',
      period: { from: analytics?.range?.from ?? null, to: analytics?.range?.to ?? null },
    });
  }

  const weeks = analytics.weeklyReports ?? [];
  const readLabel = (week) => week.range?.start ?? week.weekStart;

  const paceSeries = seriesFrom(weeks, readLabel, (week) => week.running?.avgPaceSecPerKm);
  const oneRepMaxSeries = seriesFrom(weeks, readLabel, (week) => {
    const values = (week.gym?.estimated1RM ?? []).map((entry) => entry.valueKg).filter((value) => typeof value === 'number');
    return values.length ? Math.max(...values) : null;
  });
  const loadSeries = seriesFrom(weeks, readLabel, (week) => week.running?.trainingLoad?.ratio);

  const sections = [
    metricsSection({
      id: 'window',
      titleKey: 'report.section.window',
      fields: [
        field({ labelKey: 'report.field.period', value: null, text: analytics.period, source: 'analytics-engine', sourceKey: 'period' }),
        field({ labelKey: 'report.field.weeks', value: analytics.range.weeks, source: 'analytics-engine', sourceKey: 'range.weeks' }),
        at(analytics, 'coverage.ratio', 'report.field.coverage', { source: 'analytics-engine' }),
        field({ labelKey: 'report.field.confidence', value: null, text: analytics.confidence, source: 'analytics-engine', sourceKey: 'confidence' }),
      ],
    }),

    metricsSection({
      id: 'weight-progress',
      titleKey: 'report.section.weightProgress',
      fields: [
        at(analytics, 'goalProgress.currentKg', 'report.field.currentWeight', { unit: 'kg', source: 'body-engine' }),
        at(analytics, 'goalProgress.goalKg', 'report.field.goalWeight', { unit: 'kg', source: 'profile' }),
        at(analytics, 'goalProgress.progressPercent', 'report.field.goalProgress', { unit: '%', source: 'body-engine' }),
        field({
          labelKey: 'report.field.velocity',
          value: analytics.bodyweightVelocity,
          unit: 'kg/week',
          source: 'analytics-engine',
          sourceKey: 'bodyweightVelocity',
          reason: analytics.goalProgress?.reason ?? null,
          evidence: { weeksMeasured: analytics.goalProgress?.weeksMeasured ?? null, direction: analytics.goalProgress?.direction ?? null },
        }),
      ],
    }),

    metricsSection({
      id: 'strength-progress',
      titleKey: 'report.section.strengthProgress',
      fields: [
        ...trendFields(analytics.trends?.volumeKg, 'report.field.volumeTrend'),
        ...trendFields(analytics.trends?.oneRepMaxKg, 'report.field.oneRepMaxTrend'),
        at(analytics, 'totals.volumeKg', 'report.field.totalVolume', { unit: 'kg', source: 'strength-engine' }),
        at(analytics, 'totals.sets', 'report.field.totalSets', { source: 'execution-engine' }),
      ],
    }),

    metricsSection({
      id: 'running-progress',
      titleKey: 'report.section.runningProgress',
      fields: [
        ...trendFields(analytics.trends?.distanceKm, 'report.field.distanceTrend'),
        ...trendFields(analytics.trends?.paceSecPerKm, 'report.field.paceTrend'),
        at(analytics, 'totals.distanceKm', 'report.field.totalDistance', { unit: 'km', source: 'running-engine' }),
        at(analytics, 'totals.runs', 'report.field.totalRuns', { source: 'running-engine' }),
      ],
    }),

    metricsSection({
      id: 'nutrition-progress',
      titleKey: 'report.section.nutritionProgress',
      fields: [
        at(analytics, 'nutritionConsistency.averageCalories', 'report.field.avgCalories', { unit: 'kcal', source: 'nutrition-engine' }),
        at(analytics, 'nutritionConsistency.averageProteinG', 'report.field.avgProtein', { unit: 'g', source: 'nutrition-engine' }),
        at(analytics, 'nutritionConsistency.daysLoggedPerWeek', 'report.field.daysLoggedPerWeek', { source: 'reports-engine' }),
        ...trendFields(analytics.trends?.calories, 'report.field.calorieTrend'),
      ],
    }),

    metricsSection({
      id: 'consistency',
      titleKey: 'report.section.consistency',
      fields: [
        at(analytics, 'trainingConsistency.trainingWeeks', 'report.field.trainingWeeks', { source: 'reports-engine' }),
        at(analytics, 'trainingConsistency.averageSessionsPerWeek', 'report.field.sessionsPerWeek', { source: 'reports-engine' }),
        at(analytics, 'adherence.average', 'report.field.avgAdherence', { unit: '%', source: 'reports-engine' }),
        at(analytics, 'adherence.best', 'report.field.bestWeek', { unit: '%', source: 'reports-engine' }),
      ],
    }),

    metricsSection({
      id: 'training-load',
      titleKey: 'report.section.trainingLoad',
      fields: [
        ...trendFields(analytics.trends?.trainingLoad, 'report.field.loadTrend'),
        ...trendFields(analytics.trends?.strainIndex, 'report.field.strainTrend'),
      ],
    }),

    /* Best performances, read from the weeks rather than recomputed: each
       week's own report already picked its records and its longest run. */
    tableSection({
      id: 'best',
      titleKey: 'report.section.best',
      columnKeys: ['report.column.measure', 'report.column.value', 'report.column.week'],
      rows: bestRows(weeks),
      metadata: { source: 'reports-engine' },
    }),

    chartSection({
      id: 'progress-chart',
      titleKey: 'report.chart.goalProgress',
      chart: progressChart({
        titleKey: 'report.chart.goalProgress',
        labelKey: 'report.label.goalProgress',
        percent: analytics.goalProgress?.progressPercent ?? null,
        from: analytics.goalProgress?.currentKg ?? null,
        to: analytics.goalProgress?.goalKg ?? null,
        current: analytics.goalProgress?.currentKg ?? null,
      }),
      metadata: { source: 'body-engine' },
    }),

    chartSection({
      id: 'pace-chart',
      titleKey: 'report.chart.pace',
      chart: lineChart({
        titleKey: 'report.chart.pace',
        labels: paceSeries.labels,
        series: [{ labelKey: 'report.label.pace', values: paceSeries.values }],
        unit: 'sec/km',
      }),
      metadata: { source: 'running-engine' },
    }),

    chartSection({
      id: 'one-rep-max-chart',
      titleKey: 'report.chart.oneRepMax',
      chart: lineChart({
        titleKey: 'report.chart.oneRepMax',
        labels: oneRepMaxSeries.labels,
        series: [{ labelKey: 'report.label.oneRepMax', values: oneRepMaxSeries.values }],
        unit: 'kg',
      }),
      metadata: { source: 'strength-engine' },
    }),

    chartSection({
      id: 'load-chart',
      titleKey: 'report.chart.load',
      chart: areaChart({
        titleKey: 'report.chart.load',
        labels: loadSeries.labels,
        series: [{ labelKey: 'report.label.load', values: loadSeries.values }],
        unit: 'ratio',
      }),
      metadata: { source: 'running-progress-engine' },
    }),

    chartSection({
      id: 'comparison-chart',
      titleKey: 'report.chart.comparison',
      chart: comparisonChart({
        titleKey: 'report.chart.comparison',
        labels: ['report.label.gym', 'report.label.running', 'report.label.nutrition'],
        groups: [{
          labelKey: 'report.label.adherence',
          values: [
            analytics.adherence?.byComponent?.gym ?? null,
            analytics.adherence?.byComponent?.running ?? null,
            analytics.adherence?.byComponent?.nutrition ?? null,
          ],
        }],
        unit: '%',
      }),
      metadata: { source: 'reports-engine' },
    }),

    analytics.findings?.length
      ? findingsSection({ id: 'findings', titleKey: 'report.section.findings', findings: analytics.findings, metadata: { source: 'analytics-engine' } })
      : null,

    coach?.advice?.length
      ? findingsSection({ id: 'coach', titleKey: 'report.section.coach', findings: coach.advice, metadata: { source: 'coach-engine' } })
      : null,
  ];

  return reportDocument({
    kind: REPORT_KIND.PROGRESS,
    titleKey: 'report.progress.title',
    subtitleKey: 'report.progress.subtitle',
    subtitleVars: { weeks: analytics.range.weeks },
    period: {
      from: analytics.range.from,
      to: analytics.range.to,
      labelKey: 'report.period.range',
      labelVars: { from: analytics.range.from, to: analytics.range.to },
    },
    sections,
    warnings: analytics.risks ?? [],
    recommendations: coach?.advice ?? [],
    explanations: analytics.explanations ?? {},
    generatedAt,
    metadata: {
      source: 'analytics-engine',
      weeks: analytics.range.weeks,
      confidence: analytics.confidence,
      contributors: ['analytics-engine', coach ? 'coach-engine' : null].filter(Boolean),
    },
  });
}

/**
 * The best week for each measure.
 *
 * A maximum over figures the reports engine produced — the same operation a
 * reader would do by eye down a column. It creates no new measure: every value
 * in the table appears in some week's own report.
 */
function bestRows(weeks) {
  const best = (read, better = (a, b) => a > b) => {
    let winner = null;
    for (const week of weeks) {
      const value = read(week);
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      if (winner === null || better(value, winner.value)) {
        winner = { value, week: week.range?.start ?? week.weekStart ?? null };
      }
    }
    return winner;
  };

  const entries = [
    ['report.measure.longestRun', best((week) => week.running?.longestRunKm)],
    ['report.measure.mostVolume', best((week) => week.gym?.volumeKg)],
    ['report.measure.mostDistance', best((week) => week.running?.distanceKm)],
    ['report.measure.bestPace', best((week) => week.running?.avgPaceSecPerKm, (a, b) => a < b)],
    ['report.measure.bestAdherence', best((week) => week.adherence?.overall)],
  ];

  return entries
    .filter(([, winner]) => winner !== null)
    .map(([labelKey, winner]) => [labelKey, winner.value, winner.week]);
}
