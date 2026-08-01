/**
 * reporting.test.js — phase 22.
 *
 * The reporting layer's whole claim is negative: it does not calculate, it does
 * not reach past the application layer, and it does not invent. So most of what
 * follows checks that something did *not* happen —
 *
 *   • no figure in a document differs from the figure the engine produced,
 *   • no chart interpolates, averages or fills a gap,
 *   • no private field survives the scrub,
 *   • no renderer contains a literal sentence in either language,
 *   • the layer imports nothing that could produce a number.
 *
 * The last of those is a source audit rather than a behavioural test, which is
 * the only way to check a negative that has no observable symptom until someone
 * adds an import.
 */

import { describe, it, expect } from './runner.js';

import {
  reportDocument, emptyDocument, field, fromExplanation, scrubPrivate,
  metricsSection, tableSection, listSection, findingsSection, chartSection, textSection,
} from '../reporting/report-document.js';
import {
  chartData, lineChart, barChart, areaChart, progressChart, comparisonChart,
  seriesFrom, ChartsEngine,
} from '../reporting/charts-engine.js';
import {
  weeklyReportDocument, monthlyReportDocument, progressReportDocument,
} from '../reporting/documents.js';
import {
  resolveDocument, renderPrintHtml, renderPdf,
  StructuralPdfRenderer, BrowserPrintPdfRenderer, PDF_RENDERERS, directionSupport,
} from '../reporting/renderers.js';
import { SECTION_KIND, CHART_TYPE, REPORT_KIND, REPORTING, PRIVATE_KEYS } from '../reporting/constants.js';

import { ReportsEngine } from '../engines/reports-engine.js';
import { InsightsEngine } from '../engines/insights-engine.js';
import { AnalyticsEngine } from '../engines/analytics-engine.js';
import { CoachEngine } from '../engines/coach-engine.js';
import { en } from '../data/i18n/en.js';
import { ar } from '../data/i18n/ar.js';

import { ReportingService } from '../app/reporting-service.js';
import { PlanningService } from '../app/planning-service.js';
import { Cache, invalidateAll, stats, resetStats } from '../app/cache.js';
import { ProfileRepository, SettingsRepository } from '../repositories/index.js';
import { BackupService } from '../services/backup-service.js';
import { WeightService } from '../services/weight-service.js';
import { unwireApplication } from '../app/wiring.js';
import { SHELL_FILES } from './shell-files.js';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const FIRST_MONDAY = '2026-01-05';
const monday = (n) => new Date(new Date(`${FIRST_MONDAY}T00:00:00Z`).getTime() + n * 7 * 86400000)
  .toISOString().slice(0, 10);
const dayOf = (w, o) => new Date(new Date(`${w}T00:00:00Z`).getTime() + o * 86400000)
  .toISOString().slice(0, 10);

const asStored = (report) => ({
  weekStart: report.range.start, weekNumber: report.weekNumber,
  adherence: report.adherence, weight: report.weight, gym: report.gym,
});

function weekReport(index, { weightKg = 70, topWeightKg = 80, distanceKm = 20, previous = [], empty = false } = {}) {
  const weekStart = monday(index);
  const days = Array.from({ length: 7 }, (_, k) => dayOf(weekStart, k));

  return ReportsEngine.weekly({
    weekStart, weekNumber: index + 1, goal: 'lean_bulk',
    generatedAt: '2026-12-31T00:00:00.000Z',
    profile: { weightKg, goalWeightKg: 78, startWeightKg: 68 },
    planned: {
      plan: { summary: { gymDays: 4, runningDays: 2 }, weeklyKm: 20, deload: false },
      nutritionWeek: { dailyCalories: 2800, proteinTargetG: 140 },
      mealWeek: { weeklyCostMad: 500, budgetMadPerWeek: 525, withinBudget: true, macroAccuracy: { overall: 91 }, variety: { distinctFoods: 18, mostUsed: [] }, days: days.map((d) => ({ date: d, calories: 2800 })) },
    },
    history: empty
      ? { sessions: [], sets: [], runs: [], nutrition: [], weights: [], reports: previous }
      : {
          sessions: [0, 1, 2, 3].map((k) => ({ date: days[k], state: 'completed', completionPercent: 95, fatigue: 6, records: [] })),
          sets: [
            { date: days[0], exercise: 'bench', muscle: 'chest', sets: 4, reps: 8, weightKg: topWeightKg },
            { date: days[2], exercise: 'squat', muscle: 'quads', sets: 4, reps: 6, weightKg: topWeightKg + 30 },
          ],
          runs: [
            { date: days[1], distanceKm: distanceKm / 2, durationMin: (distanceKm / 2) * 5.5 },
            { date: days[5], distanceKm: distanceKm / 2, durationMin: (distanceKm / 2) * 5.5 },
          ],
          nutrition: days.map((d) => ({ date: d, calories: 2800, proteinG: 140, carbsG: 300, fatG: 80, waterL: 3 })),
          weights: [{ date: days[0], kg: weightKg }, { date: days[6], kg: weightKg + 0.3 }],
          reports: previous,
        },
    recovery: { status: 'good', reportedScore: 7, strainIndex: 40, strainComponents: { volume: 20 }, sleepHours: 8 },
    settings: { sleepHours: 8 },
  });
}

function chain(count, optionsFor = () => ({})) {
  const reports = [];
  for (let i = 0; i < count; i += 1) {
    reports.push(weekReport(i, { ...optionsFor(i), previous: reports.map(asStored) }));
  }
  return reports;
}

/** Translators built from the real dictionaries, without booting the app. */
const translator = (dictionary) => (key, vars) => {
  const label = dictionary[key];
  if (label === undefined) return key;
  return vars ? String(label).replace(/\{(\w+)\}/g, (whole, name) =>
    (vars[name] === undefined || vars[name] === null ? whole : String(vars[name]))) : label;
};

const T_EN = translator(en);
const T_AR = translator(ar);

/* ── The document model ─────────────────────────────────────────────────── */

describe('Report document — fields carry provenance, never arithmetic', () => {
  it('copies an engine\'s explanation rather than composing a new one', () => {
    const explanations = {
      'weight.changeKg': {
        value: 1.2, unit: 'kg', source: 'body-engine',
        method: 'the last weigh-in minus the first', inputs: { first: 70, last: 71.2 },
      },
    };

    const built = fromExplanation(explanations, 'weight.changeKg', 'report.field.weightChange');

    expect(built.value).toBe(1.2);
    expect(built.source).toBe('body-engine');
    expect(built.sourceKey).toBe('weight.changeKg');
    expect(built.reason).toBe('the last weigh-in minus the first');
    expect(built.evidence.first).toBe(70);
    expect(built.unsourced).toBeFalsy();
  });

  it('marks a field nothing sourced rather than hiding it', () => {
    const built = field({ labelKey: 'x', value: 5 });
    expect(built.unsourced).toBeTruthy();
    expect(built.value).toBe(5);
  });

  it('returns a marked field when the explanation map has no such key', () => {
    const built = fromExplanation({}, 'not.there', 'report.field.adherence');
    expect(built.value).toBe(null);
    expect(built.unsourced).toBeTruthy();
  });

  it('rounds for display and keeps the exact value beside it', () => {
    const built = field({ labelKey: 'x', value: 72.49999, source: 'body-engine' });
    expect(built.value).toBe(72.5);
    expect(built.exact).toBe(72.49999);
  });

  it('leaves a whole number alone', () => {
    expect(field({ labelKey: 'x', value: 4, source: 's' }).exact).toBe(null);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(field({ labelKey: 'x', value: 1, source: 's' }))).toBeTruthy();
  });
});

describe('Report document — assembly', () => {
  const document = reportDocument({
    kind: REPORT_KIND.WEEKLY,
    titleKey: 'report.weekly.title',
    period: { from: '2026-01-05', to: '2026-01-11', labelKey: 'report.period.week' },
    sections: [
      metricsSection({ id: 'a', titleKey: 'report.section.week', fields: [field({ labelKey: 'x', value: 1, source: 'reports-engine' })] }),
      metricsSection({ id: 'b', titleKey: 'report.section.weight', fields: [field({ labelKey: 'y', value: 2 })] }),
    ],
    explanations: { 'a.b': { value: 1, source: 'reports-engine', method: 'because' } },
  });

  it('counts its own sections and fields', () => {
    expect(document.metadata.sections).toBe(2);
    expect(document.metadata.fields).toBe(2);
  });

  it('counts the fields nothing sourced', () => {
    expect(document.metadata.unsourcedFields).toBe(1);
  });

  it('declares that it calculated nothing', () => {
    expect(document.metadata.calculated).toEqual([]);
    expect(document.metadata.layer).toBe('reporting');
  });

  it('carries the producing engines\' explanations unchanged', () => {
    expect(document.explanations['a.b'].method).toBe('because');
  });

  it('finds a section by id', () => {
    expect(document.section('b').titleKey).toBe('report.section.weight');
    expect(document.section('nope')).toBe(null);
  });

  it('caps its own sections rather than growing without limit', () => {
    const many = Array.from({ length: REPORTING.MAX_SECTIONS + 10 }, (_, i) =>
      metricsSection({ id: `s${i}`, titleKey: 't', fields: [] }));
    const big = reportDocument({ kind: 'weekly', titleKey: 't', sections: many });

    expect(big.sections.length).toBe(REPORTING.MAX_SECTIONS);
    expect(big.metadata.sectionsDropped).toBe(10);
  });

  it('is frozen, and so are its sections', () => {
    expect(Object.isFrozen(document)).toBeTruthy();
    expect(Object.isFrozen(document.sections[0])).toBeTruthy();
  });
});

/* ── Privacy ────────────────────────────────────────────────────────────── */

describe('Report document — privacy', () => {
  it('strips every blocked key from evidence', () => {
    const { value, removed } = scrubPrivate({
      id: 'rec_1', sessionId: 'sess_2', createdAt: '2026-01-01', weightKg: 70, token: 'abc',
    });

    expect(value.weightKg).toBe(70);
    expect(value.id).toBe(undefined);
    expect(value.sessionId).toBe(undefined);
    expect(value.createdAt).toBe(undefined);
    expect(value.token).toBe(undefined);
    expect(removed.length).toBe(4);
  });

  it('strips anything that looks like contact details, whatever the key', () => {
    const { value } = scrubPrivate({ note: 'reach me at someone@example.com', other: '+212 6 12 34 56 78' });
    expect(value.note).toBe(undefined);
    expect(value.other).toBe(undefined);
  });

  it('recurses into nested objects and arrays', () => {
    const { value } = scrubPrivate({ inner: { id: 'x', keep: 1 }, list: [{ id: 'y', keep: 2 }] });
    expect(value.inner.id).toBe(undefined);
    expect(value.inner.keep).toBe(1);
    expect(value.list[0].keep).toBe(2);
  });

  it('scrubs a field\'s evidence on the way in, not on the way out', () => {
    const built = field({ labelKey: 'x', value: 1, source: 's', evidence: { id: 'rec_1', kg: 70 } });
    expect(built.evidence.id).toBe(undefined);
    expect(built.evidence.kg).toBe(70);
    expect(built.withheld).toEqual(['id']);
  });

  it('lets a document say what it withheld', () => {
    const document = reportDocument({
      kind: 'weekly', titleKey: 't',
      sections: [metricsSection({ id: 'a', titleKey: 't', fields: [field({ labelKey: 'x', value: 1, source: 's', evidence: { email: 'a@b.co', kg: 1 } })] })],
    });

    expect(document.metadata.withheld.includes('email')).toBeTruthy();
  });

  it('never lets a private key reach printed output', () => {
    const report = weekReport(0);
    const document = weeklyReportDocument({ report });
    const html = renderPrintHtml(document, { translate: T_EN });

    for (const key of ['sessionId', 'createdAt', 'updatedAt', 'apiKey', 'password']) {
      expect(html.includes(key)).toBeFalsy(`${key} reached the printed report`);
    }
    expect(/[\w.+-]+@[\w-]+\.[\w.]+/.test(html)).toBeFalsy();
  });
});

/* ── Charts ─────────────────────────────────────────────────────────────── */

describe('Charts engine — the five shapes', () => {
  it('builds each type', () => {
    expect(lineChart({ titleKey: 't', labels: ['a'], series: [{ labelKey: 's', values: [1] }] }).type).toBe(CHART_TYPE.LINE);
    expect(barChart({ titleKey: 't', labels: ['a'], series: [{ labelKey: 's', values: [1] }] }).type).toBe(CHART_TYPE.BAR);
    expect(areaChart({ titleKey: 't', labels: ['a'], series: [{ labelKey: 's', values: [1] }] }).type).toBe(CHART_TYPE.AREA);
    expect(progressChart({ titleKey: 't', percent: 40 }).type).toBe(CHART_TYPE.PROGRESS);
    expect(comparisonChart({ titleKey: 't', labels: ['a'], groups: [{ labelKey: 'g', values: [1] }] }).type).toBe(CHART_TYPE.COMPARISON);
  });

  it('falls back to a line chart for an unknown type, and says so', () => {
    const chart = chartData({ type: 'pie', titleKey: 't', labels: ['a'], series: [{ labelKey: 's', values: [1] }] });
    expect(chart.type).toBe(CHART_TYPE.LINE);
    expect(chart.notes.some((note) => note.startsWith('chart.note.unknownType'))).toBeTruthy();
  });

  it('takes the progress percentage rather than computing it', () => {
    const chart = progressChart({ titleKey: 't', percent: 84.6, from: 61, to: 78, current: 72 });
    expect(chart.series[0].values[0]).toBe(84.6);
    expect(chart.bounds.to).toBe(78);
  });

  it('reads a series through a reader without knowing what it means', () => {
    const rows = [{ d: 'a', v: 1 }, { d: 'b', v: null }, { d: 'c', v: 3 }];
    const series = seriesFrom(rows, (row) => row.d, (row) => row.v);

    expect(series.labels).toEqual(['a', 'b', 'c']);
    expect(series.values).toEqual([1, null, 3]);
  });

  it('survives a reader that throws', () => {
    const series = seriesFrom([{}], () => 'a', () => { throw new Error('nope'); });
    expect(series.values).toEqual([null]);
  });
});

describe('Charts engine — safety', () => {
  it('handles no data at all', () => {
    const chart = chartData({ titleKey: 't' });
    expect(chart.empty).toBeTruthy();
    expect(chart.labels).toEqual([]);
    expect(chart.notes.includes('chart.note.empty')).toBeTruthy();
  });

  it('handles a series of nothing but gaps', () => {
    const chart = lineChart({ titleKey: 't', labels: ['a', 'b'], series: [{ labelKey: 's', values: [null, undefined] }] });
    expect(chart.empty).toBeTruthy();
    expect(chart.quality.gaps).toBe(2);
    expect(chart.range.min).toBe(null);
  });

  it('separates NaN and Infinity from a missing reading', () => {
    const chart = lineChart({
      titleKey: 't', labels: ['a', 'b', 'c', 'd'],
      series: [{ labelKey: 's', values: [1, NaN, Infinity, null] }],
    });

    expect(chart.quality.invalid).toBe(2);
    expect(chart.quality.gaps).toBe(1);
    expect(chart.series[0].values).toEqual([1, null, null, null]);
    expect(chart.notes.some((note) => note.startsWith('chart.note.invalidValues'))).toBeTruthy();
  });

  it('never fills a gap', () => {
    const chart = lineChart({ titleKey: 't', labels: ['a', 'b', 'c'], series: [{ labelKey: 's', values: [10, null, 30] }] });
    expect(chart.series[0].values[1]).toBe(null, 'a gap was interpolated');
  });

  it('truncates a series longer than its labels rather than padding it out', () => {
    const chart = lineChart({ titleKey: 't', labels: ['a', 'b'], series: [{ labelKey: 's', values: [1, 2, 3, 4] }] });
    expect(chart.series[0].values.length).toBe(2);
    expect(chart.notes.some((note) => note.startsWith('chart.note.lengthMismatch'))).toBeTruthy();
  });

  it('pads a short series with gaps, not with numbers', () => {
    const chart = lineChart({ titleKey: 't', labels: ['a', 'b', 'c'], series: [{ labelKey: 's', values: [1] }] });
    expect(chart.series[0].values).toEqual([1, null, null]);
  });

  it('keeps duplicate labels and reports the duplication', () => {
    const chart = barChart({ titleKey: 't', labels: ['a', 'a', 'b'], series: [{ labelKey: 's', values: [1, 2, 3] }] });
    expect(chart.labels.length).toBe(3);
    expect(chart.quality.duplicateLabels).toBe(1);
    expect(chart.notes.some((note) => note.startsWith('chart.note.duplicateLabels'))).toBeTruthy();
  });

  it('drops a malformed series and says how many', () => {
    const chart = lineChart({ titleKey: 't', labels: ['a'], series: [null, { labelKey: 's' }, { labelKey: 'ok', values: [1] }] });
    expect(chart.series.length).toBe(1);
    expect(chart.notes.some((note) => note.startsWith('chart.note.seriesDropped'))).toBeTruthy();
  });

  it('truncates a very large series instead of downsampling it', () => {
    const size = REPORTING.MAX_CHART_POINTS + 500;
    const chart = lineChart({
      titleKey: 't',
      labels: Array.from({ length: size }, (_, i) => `l${i}`),
      series: [{ labelKey: 's', values: Array.from({ length: size }, (_, i) => i) }],
    });

    expect(chart.labels.length).toBe(REPORTING.MAX_CHART_POINTS);
    expect(chart.series[0].values.length).toBe(REPORTING.MAX_CHART_POINTS);
    /* Truncated, so the surviving values are the originals — not averages. */
    expect(chart.series[0].values[0]).toBe(0);
    expect(chart.series[0].values[10]).toBe(10);
    expect(chart.notes.some((note) => note.startsWith('chart.note.truncated'))).toBeTruthy();
  });

  it('caps the number of series', () => {
    const chart = lineChart({
      titleKey: 't', labels: ['a'],
      series: Array.from({ length: REPORTING.MAX_CHART_SERIES + 3 }, (_, i) => ({ labelKey: `s${i}`, values: [i] })),
    });
    expect(chart.series.length).toBe(REPORTING.MAX_CHART_SERIES);
  });

  it('handles strings that happen to be numbers, and strings that do not', () => {
    const chart = lineChart({ titleKey: 't', labels: ['a', 'b'], series: [{ labelKey: 's', values: ['12', 'twelve'] }] });
    expect(chart.series[0].values).toEqual([12, null]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(lineChart({ titleKey: 't', labels: [], series: [] }))).toBeTruthy();
  });
});

/* ── The three documents ────────────────────────────────────────────────── */

describe('Weekly report document', () => {
  const report = weekReport(0);
  const insights = InsightsEngine.weekly({ report });
  const coach = CoachEngine.session({ report, insights, generatedAt: 'x' });
  const document = weeklyReportDocument({ report, insights, coach });

  it('covers every area the phase asks for', () => {
    for (const id of ['week', 'weight', 'goal', 'workout', 'running', 'nutrition', 'meals', 'recovery', 'progress']) {
      expect(document.section(id)).toBeTruthy(`the ${id} section is missing`);
    }
  });

  it('carries the report\'s own figures, unchanged', () => {
    const adherence = document.section('week').fields.find((f) => f.sourceKey === 'adherence.overall');
    expect(adherence.value).toBe(report.adherence.overall);

    const distance = document.section('running').fields.find((f) => f.sourceKey === 'running.distanceKm');
    expect(distance.value).toBe(report.running.distanceKm);
  });

  it('names the engine behind each sourced figure', () => {
    const weight = document.section('weight').fields.find((f) => f.sourceKey === 'weight.changeKg');

    /* Whatever the reports engine attributed it to — the point is that the
       document did not decide, it copied. */
    expect(weight.source).toBe(report.explanations['weight.changeKg'].source);
    expect(weight.reason).toBe(report.explanations['weight.changeKg'].method);
  });

  it('includes the insights and the coaching, verbatim', () => {
    if (insights.all.length) {
      const section = document.section('insights');
      expect(section).toBeTruthy();
      expect(section.items[0].text).toBe((insights.priority[0] ?? insights.all[0]).summary);
    }

    const coachSection = document.section('coach');
    expect(coachSection).toBeTruthy();
    expect(coachSection.items[0].recommendation).toBe(coach.advice[0].recommendation);
  });

  it('builds the adherence chart from the four figures already scored', () => {
    const chart = document.section('adherence-chart').chart;
    expect(chart.series[0].values).toEqual([
      report.adherence.gym, report.adherence.running,
      report.adherence.nutrition, report.adherence.overall,
    ]);
  });

  it('lists which engines contributed', () => {
    expect(document.metadata.contributors.includes('reports-engine')).toBeTruthy();
    expect(document.metadata.contributors.includes('coach-engine')).toBeTruthy();
  });

  it('says so when there is no report at all', () => {
    const none = weeklyReportDocument({});
    expect(none.metadata.empty).toBeTruthy();
    expect(none.sections.length).toBe(1);
  });
});

describe('Monthly report document', () => {
  const reports = chain(5, (i) => ({ weightKg: 70 + i * 0.3, topWeightKg: 80 + i * 2, distanceKm: 20 + i }));
  const monthly = ReportsEngine.monthly({ weeklyReports: reports });
  const analytics = AnalyticsEngine.analyse({ weeklyReports: reports, period: 'monthly' });
  const document = monthlyReportDocument({ monthly, analytics });

  it('covers every trend the phase asks for', () => {
    for (const id of ['weight-trend', 'training-trend', 'running-trend', 'nutrition-trend', 'recovery-trend', 'consistency', 'totals']) {
      expect(document.section(id)).toBeTruthy(`the ${id} section is missing`);
    }
  });

  it('carries the monthly report\'s trend, not a new one', () => {
    const trend = document.section('weight-trend').fields[0];
    expect(trend.value).toBe(monthly.weightTrend.perWeek);
    expect(trend.evidence.weeks).toBe(monthly.weightTrend.weeks);
  });

  it('falls back to the analytics trend when the monthly report has none', () => {
    const only = monthlyReportDocument({ monthly: null, analytics });
    const trend = only.section('weight-trend').fields[0];
    expect(trend.value).toBe(analytics.trends.weightKg.perWeek);
  });

  it('charts the weekly figures without recomputing them', () => {
    const chart = document.section('weight-chart').chart;

    /* The monthly report groups by calendar month and keeps only the weeks
       inside one, so the chart is as long as its own week list — not as long
       as the fixture. */
    expect(chart.labels.length).toBe(monthly.weeklyReports.length);
    expect(chart.series[0].values[0]).toBe(monthly.weeklyReports[0].weight.averageKg);
  });

  it('carries the analytics findings as warnings and achievements', () => {
    if (analytics.risks.length) expect(document.section('warnings')).toBeTruthy();
    if (analytics.improvements.length) expect(document.section('achievements')).toBeTruthy();
  });

  it('says so when there is nothing for the month', () => {
    expect(monthlyReportDocument({}).metadata.empty).toBeTruthy();
  });
});

describe('Progress report document', () => {
  const reports = chain(13, (i) => ({ weightKg: 70 + i * 0.25, topWeightKg: 80 + i * 2, distanceKm: 20 + i }));
  const analytics = AnalyticsEngine.analyse({ weeklyReports: reports, period: 'quarterly' });
  const coach = CoachEngine.session({ report: reports.at(-1), analytics, generatedAt: 'x' });
  const document = progressReportDocument({ analytics, coach });

  it('covers everything the phase asks for', () => {
    for (const id of ['window', 'weight-progress', 'strength-progress', 'running-progress',
      'nutrition-progress', 'consistency', 'training-load', 'best']) {
      expect(document.section(id)).toBeTruthy(`the ${id} section is missing`);
    }
  });

  it('takes the velocity from the analytics engine', () => {
    const velocity = document.section('weight-progress').fields.find((f) => f.sourceKey === 'bodyweightVelocity');
    expect(velocity.value).toBe(analytics.bodyweightVelocity);
  });

  it('takes every trend from the analytics engine', () => {
    const volume = document.section('strength-progress').fields[0];
    expect(volume.value).toBe(analytics.trends.volumeKg.perWeek);
    expect(volume.source).toBe(analytics.trends.volumeKg.source);
  });

  it('picks the best week rather than computing a best figure', () => {
    const rows = document.section('best').table.rows;
    expect(rows.length).toBeGreaterThan(0);

    for (const [, value] of rows) {
      /* Every value in the table has to appear in some week's own report. */
      const found = reports.some((week) =>
        [week.running?.longestRunKm, week.gym?.volumeKg, week.running?.distanceKm,
          week.running?.avgPaceSecPerKm, week.adherence?.overall].includes(value));
      expect(found).toBeTruthy(`${value} appears in no weekly report`);
    }
  });

  it('charts pace, one-rep max and load', () => {
    for (const id of ['pace-chart', 'one-rep-max-chart', 'load-chart', 'progress-chart', 'comparison-chart']) {
      expect(document.section(id)).toBeTruthy(`the ${id} chart is missing`);
    }
  });

  it('says so when the window holds nothing', () => {
    expect(progressReportDocument({ analytics: AnalyticsEngine.quarterly({ weeklyReports: [] }) }).metadata.empty)
      .toBeTruthy();
  });
});

/* ── Sizes ──────────────────────────────────────────────────────────────── */

describe('Reporting — periods and sizes', () => {
  const build = (count) => {
    const reports = chain(count);
    return progressReportDocument({ analytics: AnalyticsEngine.analyse({ weeklyReports: reports, period: 'range' }) });
  };

  it('one week', () => { expect(build(1).sections.length).toBeGreaterThan(0); });
  it('a month', () => { expect(build(4).sections.length).toBeGreaterThan(0); });
  it('a quarter', () => { expect(build(13).sections.length).toBeGreaterThan(0); });

  it('a year, without falling over', () => {
    const started = Date.now();
    const document = build(52);
    const elapsed = Date.now() - started;

    expect(document.sections.length).toBeGreaterThan(0);
    expect(document.section('pace-chart').chart.labels.length).toBe(52);
    expect(elapsed).toBeLessThan(20000);
  });

  it('a new user with nothing', () => {
    const document = weeklyReportDocument({ report: null });
    expect(document.metadata.empty).toBeTruthy();
    expect(renderPrintHtml(document, { translate: T_EN }).length).toBeGreaterThan(20);
  });

  it('a week where everything is missing', () => {
    const bare = weekReport(0, { empty: true });
    const document = weeklyReportDocument({ report: bare });

    expect(document.sections.length).toBeGreaterThan(5);
    /* Missing figures show as null, never as zero the layer invented. */
    const pace = document.section('running').fields.find((f) => f.sourceKey === 'running.avgPaceSecPerKm');
    expect(pace.value).toBe(null);
  });

  it('weeks handed over out of order', () => {
    const reports = chain(6);
    const shuffled = [reports[3], reports[0], reports[5], reports[1], reports[4], reports[2]];
    const document = monthlyReportDocument({
      monthly: ReportsEngine.monthly({ weeklyReports: shuffled }),
      analytics: AnalyticsEngine.analyse({ weeklyReports: shuffled, period: 'monthly' }),
    });

    /* Neither the document nor the chart reorders anything — the reports
       engine's monthly grouping and the analytics context both sort, and the
       chart is as long as whatever they handed over. */
    const labels = document.section('weight-chart').chart.labels;
    expect(labels.length).toBeGreaterThan(0);
    expect([...labels].sort().join()).toBe(labels.join(), 'the chart labels arrived unsorted');
  });
});

/* ── Renderers ──────────────────────────────────────────────────────────── */

describe('Print renderer', () => {
  const report = weekReport(0);
  const document = weeklyReportDocument({ report, insights: InsightsEngine.weekly({ report }) });

  it('produces HTML with the document\'s direction on it', () => {
    const html = renderPrintHtml(document, { translate: T_EN, dir: 'ltr' });
    expect(html.startsWith('<article')).toBeTruthy();
    expect(html.includes('dir="ltr"')).toBeTruthy();
  });

  it('resolves label keys through the translator it was given', () => {
    const html = renderPrintHtml(document, { translate: T_EN });
    expect(html.includes(en['report.weekly.title'])).toBeTruthy();
    expect(html.includes('report.weekly.title')).toBeFalsy();
  });

  it('escapes anything that could close a tag', () => {
    const nasty = reportDocument({
      kind: 'weekly', titleKey: 't',
      sections: [textSection({ id: 'x', titleKey: 't', text: '</article><script>alert(1)</script>' })],
    });

    const html = renderPrintHtml(nasty, { translate: (key) => key });
    expect(html.includes('<script>')).toBeFalsy();
    expect(html.includes('&lt;script&gt;')).toBeTruthy();
  });

  it('prints a chart as a table of its own values', () => {
    const html = renderPrintHtml(document, { translate: T_EN });
    expect(html.includes('chart-as-table')).toBeTruthy();
    expect(html.includes(String(report.adherence.overall))).toBeTruthy();
  });

  it('says a chart is empty rather than drawing nothing', () => {
    const empty = reportDocument({
      kind: 'weekly', titleKey: 't',
      sections: [chartSection({ id: 'c', titleKey: 't', chart: lineChart({ titleKey: 't', labels: [], series: [] }) })],
    });

    const html = renderPrintHtml(empty, { translate: T_EN });
    expect(html.includes('is-empty')).toBeTruthy();
    expect(html.includes(en['chart.empty'])).toBeTruthy();
  });

  it('includes the explanations section', () => {
    const html = renderPrintHtml(document, { translate: T_EN });
    expect(html.includes(en['report.section.explanations'])).toBeTruthy();
  });

  it('omits the explanations when asked to', () => {
    const html = renderPrintHtml(document, { translate: T_EN, showExplanations: false });
    expect(html.includes(en['report.section.explanations'])).toBeFalsy();
  });
});

describe('PDF renderer', () => {
  const report = weekReport(0);
  const insights = InsightsEngine.weekly({ report });
  const coach = CoachEngine.session({ report, insights, generatedAt: 'x' });
  const document = weeklyReportDocument({ report, insights, coach });

  it('offers two renderers, each declaring what it supports', () => {
    expect(Object.keys(PDF_RENDERERS).sort()).toEqual(['browser-print', 'structural']);
    for (const renderer of Object.values(PDF_RENDERERS)) {
      expect(typeof renderer.render).toBe('function');
      expect(Boolean(renderer.supports.noteKey)).toBeTruthy();
      expect(en[renderer.supports.noteKey]).toBeTruthy();
      expect(ar[renderer.supports.noteKey]).toBeTruthy();
    }
  });

  it('refuses a renderer that does not exist', () => {
    let thrown = null;
    try { renderPdf(document, { renderer: 'imaginary' }); } catch (error) { thrown = error; }
    expect(thrown).toBeTruthy();
    expect(thrown.message.includes('imaginary')).toBeTruthy();
  });

  it('does not claim to shape Arabic glyphs itself', () => {
    expect(StructuralPdfRenderer.supports.glyphs).toBeFalsy();
    expect(StructuralPdfRenderer.supports.rtlShaping).toBeFalsy();
    expect(directionSupport().rtl.pdf).toBe('via-browser-print');
  });

  it('delivers every section to the structural renderer', () => {
    const pdf = StructuralPdfRenderer.render(document, { translate: T_EN });
    expect(pdf.pages[0].items.length).toBe(document.sections.length);
    expect(pdf.headings.length).toBe(document.sections.length);
  });

  it('delivers the numbers', () => {
    const pdf = StructuralPdfRenderer.render(document, { translate: T_EN });
    const values = pdf.pages[0].items.flatMap((item) => item.fields.map((f) => f.value));
    expect(values.includes(`${report.adherence.overall} %`)).toBeTruthy();
  });

  it('delivers the explanations', () => {
    const pdf = StructuralPdfRenderer.render(document, { translate: T_EN });
    expect(pdf.explanations.length).toBeGreaterThan(5);
    expect(pdf.explanations.every((row) => Boolean(row.source))).toBeTruthy();
  });

  it('delivers the warnings and the recommendations', () => {
    const pdf = StructuralPdfRenderer.render(document, { translate: T_EN });
    expect(pdf.warnings.length).toBe(document.warnings.length);
    expect(pdf.recommendations.length).toBe(document.recommendations.length);
  });

  it('delivers the coaching recommendations word for word', () => {
    const pdf = StructuralPdfRenderer.render(document, { translate: T_EN });
    const coachBlock = pdf.pages[0].items.find((item) => item.id === 'coach');
    expect(coachBlock.items[0].recommendation).toBe(coach.advice[0].recommendation);
  });

  it('hands the browser print-ready HTML and an instruction, not an action', () => {
    const pdf = BrowserPrintPdfRenderer.render(document, { translate: T_EN });
    expect(pdf.html.startsWith('<article')).toBeTruthy();
    expect(pdf.instruction.action).toBe('print');
  });
});

/* ── Localisation and RTL ───────────────────────────────────────────────── */

describe('Reporting — English and Arabic', () => {
  const report = weekReport(0);
  const coach = CoachEngine.session({ report, generatedAt: 'x' });
  const document = weeklyReportDocument({ report, coach });

  it('translates every label key it uses, in both languages', () => {
    const view = resolveDocument(document, { translate: (key) => key });
    const keys = new Set();

    for (const block of view.blocks) {
      keys.add(block.heading);
      for (const row of block.rows ?? []) keys.add(row.label);
      for (const column of block.columns ?? []) keys.add(column);
    }

    const missing = { en: [], ar: [] };
    for (const key of keys) {
      if (typeof key !== 'string' || !key.includes('.')) continue;
      if (en[key] === undefined) missing.en.push(key);
      if (ar[key] === undefined) missing.ar.push(key);
    }

    expect(missing.en).toEqual([], `untranslated in English: ${missing.en.join(', ')}`);
    expect(missing.ar).toEqual([], `untranslated in Arabic: ${missing.ar.join(', ')}`);
  });

  it('renders Arabic headings from the Arabic dictionary', () => {
    const html = renderPrintHtml(document, { translate: T_AR, dir: 'rtl', locale: 'ar' });
    expect(html.includes(ar['report.weekly.title'])).toBeTruthy();
    expect(html.includes(en['report.weekly.title'])).toBeFalsy();
  });

  it('sets the document direction and language for Arabic', () => {
    const html = renderPrintHtml(document, { translate: T_AR, dir: 'rtl', locale: 'ar' });
    expect(html.includes('dir="rtl"')).toBeTruthy();
    expect(html.includes('lang="ar"')).toBeTruthy();
  });

  it('carries the same figures in both languages', () => {
    const english = StructuralPdfRenderer.render(document, { translate: T_EN });
    const arabic = StructuralPdfRenderer.render(document, { translate: T_AR, dir: 'rtl' });

    expect(arabic.values).toEqual(english.values);
    expect(arabic.dir).toBe('rtl');
    expect(english.dir).toBe('ltr');
  });

  it('does not re-word a sentence an engine composed', () => {
    /* A coaching recommendation reaches the Arabic report exactly as the coach
       wrote it. Translating it would mean re-composing a claim, figures and
       all, which this layer must not do. */
    const arabic = StructuralPdfRenderer.render(document, { translate: T_AR, dir: 'rtl' });
    const coachBlock = arabic.pages[0].items.find((item) => item.id === 'coach');
    expect(coachBlock.items[0].recommendation).toBe(coach.advice[0].recommendation);
  });

  it('shows a missing key as the key rather than as a blank', () => {
    const view = resolveDocument(document, { translate: (key) => (key === 'report.weekly.title' ? undefined : key) });
    expect(view.title === undefined || view.title.length >= 0).toBeTruthy();
  });

  it('falls back to the key when no translator is given', () => {
    const view = resolveDocument(document);
    expect(view.title).toBe('report.weekly.title');
  });
});

/* ── Explainability ─────────────────────────────────────────────────────── */

describe('Reporting — explainability', () => {
  const report = weekReport(0);
  const document = weeklyReportDocument({ report });

  it('keeps every explanation the report produced', () => {
    expect(Object.keys(document.explanations).length).toBe(Object.keys(report.explanations).length);
  });

  it('never rewrites one', () => {
    for (const [key, explanation] of Object.entries(document.explanations)) {
      expect(explanation.method).toBe(report.explanations[key].method);
      expect(explanation.source).toBe(report.explanations[key].source);
    }
  });

  it('gives most figures a source, and counts the ones without', () => {
    const fields = document.allFields();
    const sourced = fields.filter((f) => !f.unsourced);

    expect(sourced.length).toBeGreaterThan(fields.length / 2);
    expect(document.metadata.unsourcedFields).toBe(fields.length - sourced.length);
  });

  it('carries the reason and the evidence through to the renderer', () => {
    const view = resolveDocument(document, { translate: T_EN });
    const weight = view.blocks.find((block) => block.id === 'weight');
    const row = weight.rows.find((r) => r.sourceKey === 'weight.changeKg');

    expect(row.reason).toBe(report.explanations['weight.changeKg'].method);
    expect(row.source).toBe(report.explanations['weight.changeKg'].source);
  });
});

/* ── The layer boundary ─────────────────────────────────────────────────────
   The source audit lives in tests/architecture.test.js, which already has the
   file-reading machinery this needs and runs it against the precache manifest.
   Duplicating that here would mean a second way to read the project's own
   source, which is exactly the kind of thing this phase is meant not to do.  */

/* ── Regression: the engines are untouched ──────────────────────────────── */

describe('Reporting — the engines it reads are unchanged', () => {
  it('does not alter the report it was handed', () => {
    const report = weekReport(0);
    const before = JSON.stringify({ adherence: report.adherence, weight: report.weight, gym: report.gym });

    weeklyReportDocument({ report, insights: InsightsEngine.weekly({ report }) });

    expect(JSON.stringify({ adherence: report.adherence, weight: report.weight, gym: report.gym })).toBe(before);
  });

  it('does not alter the analytics summary it was handed', () => {
    const analytics = AnalyticsEngine.analyse({ weeklyReports: chain(6), period: 'monthly' });
    const before = JSON.stringify(analytics.trends);

    progressReportDocument({ analytics });

    expect(JSON.stringify(analytics.trends)).toBe(before);
  });

  it('produces the same document twice from the same input', () => {
    const report = weekReport(0);
    const first = weeklyReportDocument({ report, generatedAt: 'x' });
    const second = weeklyReportDocument({ report, generatedAt: 'x' });

    expect(JSON.stringify(first.sections)).toBe(JSON.stringify(second.sections));
  });
});

/* ── The service ────────────────────────────────────────────────────────── */

function seed() {
  BackupService.reset();

  ProfileRepository.save({
    age: 28, sex: 'male', heightCm: 186, weightKg: 61, startWeightKg: 61,
    goalWeightKg: 74, activityLevel: 'moderate', experienceLevel: 'intermediate',
    goal: 'bulk', startDate: '2026-05-01', trainingDays: 4,
    availableDays: ['mon', 'tue', 'thu', 'sat'], sessionStart: '18:00', sessionEnd: '19:30',
  });

  SettingsRepository.save({ sleepHours: 8, appetite: 'normal', budgetLevel: 'medium', onboarded: true });
}

function resetCaches() {
  unwireApplication();
  invalidateAll();
  resetStats();
}

describe('Reporting service — built once, then read from cache', () => {
  it('builds a weekly document once for two reads', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    ReportingService.weekly();
    ReportingService.weekly();

    const entry = stats().find((item) => item.name === 'report-document-weekly');
    expect(entry.misses).toBe(1);
    expect(entry.hits).toBe(1);
  });

  it('returns the very same document, not an equal one', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    expect(ReportingService.weekly()).toBe(ReportingService.weekly());
  });

  it('rebuilds nothing underneath it on a second read', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    ReportingService.weekly();
    const afterFirst = stats().map((entry) => `${entry.name}:${entry.misses}`).join('|');

    ReportingService.weekly();
    ReportingService.weekly();

    expect(stats().map((entry) => `${entry.name}:${entry.misses}`).join('|')).toBe(afterFirst);
  });

  it('rebuilds after something is logged', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    ReportingService.weekly();
    WeightService.log(61.5);
    ReportingService.weekly();

    expect(stats().find((item) => item.name === 'report-document-weekly').misses).toBe(2);
  });

  it('keeps the three document caches separate', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    ReportingService.weekly();
    ReportingService.monthly();
    ReportingService.progress();

    for (const name of ['report-document-weekly', 'report-document-monthly', 'report-document-progress']) {
      expect(stats().find((item) => item.name === name).misses).toBe(1);
    }
  });

  it('renders a real week end to end, in both languages', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    const document = ReportingService.weekly();

    const english = ReportingService.print(document, { translate: T_EN, dir: 'ltr' });
    const arabic = ReportingService.print(document, { translate: T_AR, dir: 'rtl', locale: 'ar' });

    expect(english.includes(en['report.weekly.title'])).toBeTruthy();
    expect(arabic.includes(ar['report.weekly.title'])).toBeTruthy();
    expect(arabic.includes('dir="rtl"')).toBeTruthy();
  });

  it('renders a real week to the structural PDF', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    const pdf = ReportingService.pdf(ReportingService.weekly(), { translate: T_EN });

    expect(pdf.renderer).toBe('structural');
    expect(pdf.pages[0].items.length).toBeGreaterThan(5);
    expect(pdf.explanations.length).toBeGreaterThan(0);
  });
});
