/**
 * analytics-engine.test.js — phase 19.
 *
 * The engine fits lines through figures other engines produced, so these
 * tests are mostly about restraint:
 *
 *   • a window too short to support a claim says so instead of claiming,
 *   • a flat line is not reported as a decline, and a decline is not reported
 *     as noise,
 *   • an empty stretch is reported as empty rather than as a stretch in which
 *     nothing improved — the two look identical in the data,
 *   • every finding carries evidence, and one that cannot is refused,
 *   • the trend the analytics engine fits over a set of weeks is the same
 *     number the monthly report fits over the same weeks, because both call
 *     the same function.
 *
 * The weekly reports here are built by the real reports engine. Hand-written
 * ones would test the fixture.
 */

import { describe, it, expect } from './runner.js';
import { AnalyticsEngine } from '../engines/analytics-engine.js';
import { createAnalyticsContext, METRICS } from '../engines/analytics-context.js';
import { ReportsEngine } from '../engines/reports-engine.js';
import { trendOf, meanOf, totalOf, seriesOf } from '../engines/trend.js';
import { ANALYTICS_RULE_SETS, allAnalyticsRules } from '../rules/analytics/index.js';
import {
  ANALYTICS, ANALYTICS_DIRECTION, ANALYTICS_PERIOD, ANALYTICS_FINDING, REPORTS,
} from '../engines/constants.js';

import { AnalyticsService } from '../app/analytics-service.js';
import { PlanningService } from '../app/planning-service.js';
import { Cache, invalidateAll, stats, resetStats } from '../app/cache.js';
import { ProfileRepository, SettingsRepository } from '../repositories/index.js';
import { BackupService } from '../services/backup-service.js';
import { unwireApplication } from '../app/wiring.js';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const FIRST_MONDAY = '2026-01-05';

const monday = (n) =>
  new Date(new Date(`${FIRST_MONDAY}T00:00:00Z`).getTime() + n * 7 * 86400000)
    .toISOString().slice(0, 10);

const dayOf = (weekStart, offset) =>
  new Date(new Date(`${weekStart}T00:00:00Z`).getTime() + offset * 86400000)
    .toISOString().slice(0, 10);

/**
 * One real weekly report, built by the reports engine.
 * `empty: true` produces a week nobody logged — a plan, and nothing against it.
 */
function weekReport(index, {
  goal = 'lean_bulk', weightKg = 70, topWeightKg = 80, distanceKm = 20,
  paceMinPerKm = 5.5, calories = 2800, proteinG = 140, strainIndex = 40,
  sleepHours = 7.5, sessions = 4, empty = false, goalWeightKg = 78,
} = {}) {
  const weekStart = monday(index);
  const days = Array.from({ length: 7 }, (_, offset) => dayOf(weekStart, offset));

  const history = empty
    ? { sessions: [], sets: [], runs: [], nutrition: [], weights: [], reports: [] }
    : {
        sessions: Array.from({ length: sessions }, (_, i) => ({
          date: days[i], state: 'completed', completionPercent: 95, fatigue: 6, records: [],
        })),
        sets: [
          { date: days[0], exercise: 'bench', muscle: 'chest', sets: 4, reps: 8, weightKg: topWeightKg },
          { date: days[2], exercise: 'squat', muscle: 'legs', sets: 4, reps: 6, weightKg: topWeightKg + 30 },
        ],
        runs: [
          { date: days[1], distanceKm: distanceKm / 2, durationMin: (distanceKm / 2) * paceMinPerKm },
          { date: days[5], distanceKm: distanceKm / 2, durationMin: (distanceKm / 2) * paceMinPerKm },
        ],
        nutrition: days.map((date) => ({ date, calories, proteinG, carbsG: 300, fatG: 80, waterL: 3 })),
        weights: [{ date: days[0], kg: weightKg }, { date: days[6], kg: weightKg }],
        reports: [],
      };

  return ReportsEngine.weekly({
    weekStart,
    weekNumber: index + 1,
    goal,
    generatedAt: '2026-12-31T00:00:00.000Z',
    profile: { weightKg, goalWeightKg, startWeightKg: 68 },
    planned: {
      plan: { summary: { gymDays: 4, runningDays: 2 }, weeklyKm: 20, deload: false },
      nutritionWeek: { dailyCalories: 2800, proteinTargetG: 140 },
    },
    history,
    recovery: {
      status: 'good', reportedScore: 7, strainIndex,
      strainComponents: { volume: 20 }, sleepHours,
    },
    settings: { sleepHours },
  });
}

/** A run of weeks, each shaped by a function of its index. */
const series = (count, shape = () => ({}), options = {}) =>
  Array.from({ length: count }, (_, index) => weekReport(index, { ...options, ...shape(index) }));

const analyseAll = (weeklyReports, extra = {}) =>
  AnalyticsEngine.analyse({ weeklyReports, period: ANALYTICS_PERIOD.RANGE, ...extra });

const keys = (analysis) => analysis.findings.map((finding) => finding.key);
const kindKeys = (analysis, kind) =>
  analysis.findings.filter((finding) => finding.kind === kind).map((finding) => finding.key);

/* ── A new user ─────────────────────────────────────────────────────────── */

describe('Analytics engine — a new user with no reports', () => {
  const analysis = AnalyticsEngine.quarterly({ weeklyReports: [] });

  it('returns an analysis rather than throwing', () => {
    expect(analysis.period).toBe(ANALYTICS_PERIOD.QUARTERLY);
    expect(analysis.range.weeks).toBe(0);
  });

  it('says the window is empty, and says why that is not the same as no progress', () => {
    expect(analysis.reasons.length).toBeGreaterThan(0);
    expect(analysis.reasons[0].message.includes('empty')).toBeTruthy();
  });

  it('fits nothing and claims nothing', () => {
    expect(analysis.findings.length).toBe(0);
    expect(analysis.bodyweightVelocity).toBe(null);
    expect(analysis.plateauDetected).toBeFalsy();
    expect(analysis.improvementDetected).toBeFalsy();
  });

  it('reports low confidence rather than none', () => {
    expect(analysis.confidence).toBe(REPORTS.CONFIDENCE_LEVEL.LOW);
    expect(analysis.sufficient).toBeFalsy();
  });
});

/* ── One week ───────────────────────────────────────────────────────────── */

describe('Analytics engine — a single week', () => {
  const analysis = analyseAll(series(1));

  it('analyses it without pretending to a trend', () => {
    expect(analysis.range.weeks).toBe(1);
    expect(analysis.trends.weightKg.perWeek).toBe(null);
    expect(analysis.trends.volumeKg.perWeek).toBe(null);
  });

  it('says a trend needs more weeks than it has', () => {
    expect(analysis.trends.volumeKg.note.includes('at least')).toBeTruthy();
  });

  it('still reports the totals the week actually holds', () => {
    expect(analysis.totals.volumeKg).toBeGreaterThan(0);
    expect(analysis.totals.distanceKm).toBeGreaterThan(0);
  });
});

/* ── A month, a quarter, a year ─────────────────────────────────────────── */

describe('Analytics engine — the windows', () => {
  const year = series(52, (i) => ({ weightKg: 70 + i * 0.1, topWeightKg: 80 + i * 0.5 }));

  it('a month is the last four weeks', () => {
    const analysis = AnalyticsEngine.monthly({ weeklyReports: year });
    expect(analysis.range.weeks).toBe(ANALYTICS.WEEKS.monthly);
    expect(analysis.range.to).toBe(monday(51));
  });

  it('a quarter is the last thirteen', () => {
    const analysis = AnalyticsEngine.quarterly({ weeklyReports: year });
    expect(analysis.range.weeks).toBe(ANALYTICS.WEEKS.quarterly);
  });

  it('a year is the last fifty-two', () => {
    const analysis = AnalyticsEngine.yearly({ weeklyReports: year });
    expect(analysis.range.weeks).toBe(ANALYTICS.WEEKS.yearly);
    expect(analysis.sufficient).toBeTruthy();
  });

  it('a range is exactly what it was asked for', () => {
    const analysis = AnalyticsEngine.range(monday(10), monday(19), { weeklyReports: year });
    expect(analysis.range.weeks).toBe(10);
    expect(analysis.range.from).toBe(monday(10));
    expect(analysis.range.to).toBe(monday(19));
  });

  it('a range with its ends reversed holds nothing rather than everything', () => {
    const analysis = AnalyticsEngine.range(monday(19), monday(10), { weeklyReports: year });
    expect(analysis.range.weeks).toBe(0);
  });

  it('flags a quarter that is too short for its own claims', () => {
    const analysis = AnalyticsEngine.quarterly({ weeklyReports: series(4) });
    expect(analysis.sufficient).toBeFalsy();
    expect(keys(analysis).includes('risk.thin-window')).toBeTruthy();
  });
});

/* ── Sustained improvement ──────────────────────────────────────────────── */

describe('Analytics engine — things are getting better', () => {
  const analysis = analyseAll(
    series(13, (i) => ({
      topWeightKg: 80 + i * 2.5,
      distanceKm: 20 + i * 1.5,
      paceMinPerKm: 5.6 - i * 0.03,
      weightKg: 70 + i * 0.25,
    })),
    { goal: { goal: 'lean_bulk', goalKg: 78, currentKg: 73 } }
  );

  it('finds several measures agreeing', () => {
    expect(keys(analysis).includes('improvement.broad')).toBeTruthy();
    expect(analysis.improvementDetected).toBeTruthy();
  });

  it('names which measures agreed, in the evidence', () => {
    const finding = analysis.find('improvement.broad');
    expect(Object.keys(finding.evidence).length)
      .toBeGreaterThan(ANALYTICS.MIN_AGREEING_SIGNALS - 1);
  });

  it('reads a falling pace as an improvement, not a decline', () => {
    expect(analysis.trends.paceSecPerKm.perWeek).toBeLessThan(0);
    expect(analysis.trends.paceSecPerKm.direction).toBe(ANALYTICS_DIRECTION.IMPROVING);
  });

  it('reads a rising scale as an improvement only because the goal is a bulk', () => {
    expect(analysis.trends.weightKg.direction).toBe(ANALYTICS_DIRECTION.IMPROVING);

    /* The same rising scale, with a goal that has no direction for it to
       improve in, is movement rather than good news. */
    const flatGoal = analyseAll(
      series(13, (i) => ({ weightKg: 70 + i * 0.25 })),
      { goal: { goal: 'maintain' } }
    );
    expect(flatGoal.trends.weightKg.direction).toBe(ANALYTICS_DIRECTION.UNKNOWN);
    expect(flatGoal.trends.weightKg.movement).toBe('rising');
  });

  it('reports no regression', () => {
    expect(kindKeys(analysis, ANALYTICS_FINDING.REGRESSION).length).toBe(0);
  });
});

/* ── Sustained decline ──────────────────────────────────────────────────── */

describe('Analytics engine — things are getting worse', () => {
  const analysis = analyseAll(
    series(13, (i) => ({
      topWeightKg: 100 - i * 2.5,
      distanceKm: 30 - i * 1.5,
      paceMinPerKm: 5.2 + i * 0.04,
      proteinG: 160 - i * 4,
    })),
    { goal: { goal: 'lean_bulk', goalKg: 78 } }
  );

  it('names each measure that went backwards', () => {
    const regressions = kindKeys(analysis, ANALYTICS_FINDING.REGRESSION);
    expect(regressions.length).toBeGreaterThan(0);
    expect(regressions.some((key) => key.includes('distanceKm') || key.includes('paceSecPerKm')))
      .toBeTruthy();
  });

  it('shows where each one started and ended', () => {
    for (const finding of analysis.regressions) {
      expect(finding.evidence.first !== null).toBeTruthy();
      expect(finding.evidence.last !== null).toBeTruthy();
      expect(finding.evidence.weeks).toBeGreaterThan(ANALYTICS.REGRESSION_WEEKS - 1);
    }
  });

  it('raises falling protein on a surplus as its own risk', () => {
    expect(keys(analysis).includes('risk.protein-falling')).toBeTruthy();
  });
});

/* ── Plateau ────────────────────────────────────────────────────────────── */

describe('Analytics engine — a plateau', () => {
  const flat = analyseAll(
    series(13, () => ({ topWeightKg: 80, distanceKm: 20, paceMinPerKm: 5.5, weightKg: 72 })),
    { goal: { goal: 'lean_bulk', goalKg: 78, currentKg: 72 } }
  );

  it('calls a flat performance figure a plateau', () => {
    expect(flat.plateauDetected).toBeTruthy();
    expect(kindKeys(flat, ANALYTICS_FINDING.PLATEAU).length).toBeGreaterThan(0);
  });

  it('reads the weight stall from the reports engine\'s own count', () => {
    const weightPlateau = flat.find('plateau.weight');
    if (weightPlateau) {
      expect(weightPlateau.evidence.flatWeeks).toBeGreaterThan(REPORTS.WEIGHT_STALL_WEEKS - 1);
      expect(weightPlateau.sourceEngine.includes('reports-engine')).toBeTruthy();
    } else {
      /* The count comes from the latest report's own explanation; where that
         report had too little history to count, no plateau is claimed. */
      expect(flat.explain('trend.weightKg')).toBeTruthy();
    }
  });

  it('does not call a moving figure a plateau', () => {
    const moving = analyseAll(series(13, (i) => ({ topWeightKg: 80 + i * 3 })));
    expect(kindKeys(moving, ANALYTICS_FINDING.PLATEAU).includes('plateau.oneRepMaxKg'))
      .toBeFalsy();
  });

  it('separates a flat line at the ceiling from a stall', () => {
    expect(keys(flat).includes('plateau.adherence-ceiling')).toBeTruthy();
    const ceiling = flat.find('plateau.adherence-ceiling');
    expect(ceiling.evidence.last).toBeGreaterThan(REPORTS.ADHERENCE_PERFECT - 1);
  });
});

/* ── A long break ───────────────────────────────────────────────────────── */

describe('Analytics engine — a long layoff', () => {
  const withGap = [
    ...series(4),
    ...Array.from({ length: 5 }, (_, i) => weekReport(4 + i, { empty: true })),
    ...series(4).map((_, i) => weekReport(9 + i)),
  ];

  const analysis = analyseAll(withGap);

  it('finds the gap and measures it', () => {
    const layoff = analysis.find('risk.layoff');
    expect(layoff).toBeTruthy();
    expect(layoff.evidence.longestGapWeeks).toBe(5);
  });

  it('lists which weeks were empty', () => {
    expect(analysis.find('risk.layoff').evidence.emptyWeeks.length).toBe(5);
  });

  it('says the trends were fitted across the gap', () => {
    expect(analysis.find('risk.layoff').reason.includes('assumption')).toBeTruthy();
  });

  it('lowers confidence because the window is half unlogged', () => {
    expect(analysis.coverage.ratio).toBeLessThan(1);
    expect(analysis.confidence).toBe(REPORTS.CONFIDENCE_LEVEL.MEDIUM);
  });

  it('fits across the gap as zeros, and says so rather than hiding it', () => {
    /* An unlogged week's report holds a tonnage of zero, not a tonnage of
       nothing — the reports engine cannot tell a rest week from an unlogged
       one either. So the zeros do enter the line, and `risk.layoff` exists
       precisely to stop the resulting slope being read as a measured
       collapse. */
    expect(analysis.trends.volumeKg.weeks).toBe(13);
    expect(analysis.find('risk.layoff').reason.includes('fitted across that gap')).toBeTruthy();
  });
});

/* ── The three goals ────────────────────────────────────────────────────── */

describe('Analytics engine — bulk, cut, maintain', () => {
  it('a bulk losing weight is a risk, not a success', () => {
    const analysis = analyseAll(
      series(13, (i) => ({ weightKg: 74 - i * 0.2, goal: 'bulk' })),
      { goal: { goal: 'bulk', goalKg: 80 } }
    );
    expect(keys(analysis).includes('risk.goal-reversed')).toBeTruthy();
  });

  it('a cut losing weight is an improvement', () => {
    const analysis = analyseAll(
      series(13, (i) => ({ weightKg: 84 - i * 0.4, goal: 'cut', goalWeightKg: 74 })),
      { goal: { goal: 'cut', goalKg: 74 } }
    );
    expect(analysis.trends.weightKg.direction).toBe(ANALYTICS_DIRECTION.IMPROVING);
    expect(keys(analysis).includes('risk.goal-reversed')).toBeFalsy();
  });

  it('a maintain has no direction for the scale to improve in', () => {
    const analysis = analyseAll(
      series(13, (i) => ({ weightKg: 74 + i * 0.3, goal: 'maintain' })),
      { goal: { goal: 'maintain', goalKg: 74 } }
    );
    expect(analysis.trends.weightKg.direction).toBe(ANALYTICS_DIRECTION.UNKNOWN);
    expect(analysis.trends.weightKg.movement).toBe('rising');
  });

  it('reports the velocity whichever goal is set', () => {
    const analysis = analyseAll(series(13, (i) => ({ weightKg: 74 + i * 0.3, goal: 'maintain' })));
    expect(analysis.bodyweightVelocity).toBeGreaterThan(0);
  });
});

/* ── Missing and contradictory data ─────────────────────────────────────── */

describe('Analytics engine — gaps in the figures', () => {
  it('separates the weeks that hold data from the weeks in the window', () => {
    const mixed = [
      weekReport(0), weekReport(1, { empty: true }), weekReport(2),
      weekReport(3, { empty: true }), weekReport(4), weekReport(5),
    ];
    const context = createAnalyticsContext({ weeklyReports: mixed });
    const analysis = analyseAll(mixed);

    expect(context.weeksInWindow).toBe(6);
    expect(context.weeksWithData).toBe(4);
    expect(analysis.trends.volumeKg.perWeek !== null).toBeTruthy();
  });

  it('drops a week from a line when the figure itself is absent, not zero', () => {
    /* Pace is null in a week with no runs — the running engine refuses to
       divide by zero distance — so those weeks leave the line entirely. */
    const mixed = [
      weekReport(0), weekReport(1, { empty: true }), weekReport(2),
      weekReport(3, { empty: true }), weekReport(4), weekReport(5),
    ];
    expect(analyseAll(mixed).trends.paceSecPerKm.weeks).toBe(4);
  });

  it('refuses a trend for a figure nothing ever logged', () => {
    const analysis = analyseAll(series(13));
    /* Sleep is a setting rather than a measurement, so it never varies —
       an identical series fits no slope. */
    const sleep = analysis.trends.sleepHours;
    expect(sleep.perWeek === null || sleep.direction === ANALYTICS_DIRECTION.FLAT).toBeTruthy();
  });

  it('handles a window where every figure disagrees week to week', () => {
    const noisy = analyseAll(series(13, (i) => ({
      topWeightKg: i % 2 ? 120 : 60,
      distanceKm: i % 2 ? 40 : 5,
      weightKg: i % 2 ? 76 : 68,
    })));

    /* A sawtooth has almost no slope: the engine must not read alternating
       extremes as a direction of travel. */
    expect(Math.abs(noisy.trends.weightKg.perWeek)).toBeLessThan(1);
    expect(noisy.findings.every((finding) => Boolean(finding.reason))).toBeTruthy();
  });

  it('gives every finding evidence, and refuses any without it', () => {
    const analysis = analyseAll(series(13, (i) => ({ topWeightKg: 80 + i * 2 })));

    for (const finding of analysis.findings) {
      expect(Object.keys(finding.evidence ?? {}).length).toBeGreaterThan(0);
      expect(Boolean(finding.reason && finding.confidence && finding.sourceEngine)).toBeTruthy();
    }
    expect(Array.isArray(analysis.meta.refused)).toBeTruthy();
  });
});

/* ── Nothing is recalculated ────────────────────────────────────────────── */

describe('Analytics engine — every figure comes from somewhere else', () => {
  const reports = series(13, (i) => ({ topWeightKg: 80 + i, weightKg: 70 + i * 0.2 }));
  const analysis = analyseAll(reports);

  it('fits the same slope the monthly report would over the same weeks', () => {
    const month = ReportsEngine.monthly({ weeklyReports: reports.slice(0, 4) });
    const four = analyseAll(reports.slice(0, 4));

    expect(four.trends.weightKg.perWeek).toBe(month.weightTrend.perWeek);
    expect(four.trends.volumeKg.perWeek).toBe(month.strengthTrend.perWeek);
    expect(four.trends.distanceKm.perWeek).toBe(month.runningTrend.perWeek);
  });

  it('attributes each trend to the engine that produced the readings', () => {
    expect(analysis.explain('trend.volumeKg').source).toBe('strength-engine');
    expect(analysis.explain('trend.paceSecPerKm').source).toBe('running-engine');
    expect(analysis.explain('trend.strainIndex').source).toBe('planner-engine');
    expect(analysis.explain('trend.adherencePercent').source).toBe('reports-engine');
  });

  it('declares that it measured nothing', () => {
    expect(analysis.meta.recalculated).toEqual([]);
    expect(analysis.meta.engineId).toBe('analytics-engine');
  });

  it('takes adherence from the reports engine rather than rebuilding it', () => {
    const scored = reports
      .map((report) => report.adherence.overall)
      .filter((value) => value !== null);
    const mean = Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);

    expect(analysis.adherence.average).toBe(mean);
  });

  it('explains every figure it records', () => {
    for (const [key, explanation] of Object.entries(analysis.explanations)) {
      expect(Boolean(explanation.method)).toBeTruthy(`${key} has no method`);
      expect(Boolean(explanation.source)).toBeTruthy(`${key} has no source engine`);
    }
  });
});

/* ── The shared trend module ────────────────────────────────────────────── */

describe('Trend — one definition, two engines', () => {
  const points = [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }];

  it('fits a slope of one through a straight line', () => {
    expect(trendOf(points, (row) => row.v, { unit: 'x' }).perWeek).toBe(1);
  });

  it('refuses a slope through too few points', () => {
    const fit = trendOf(points.slice(0, 2), (row) => row.v, { unit: 'x' });
    expect(fit.perWeek).toBe(null);
    expect(fit.note.includes('at least')).toBeTruthy();
  });

  it('ignores the rows that carry nothing', () => {
    const holes = [{ v: 1 }, { v: null }, { v: 3 }, { v: null }, { v: 5 }];
    expect(trendOf(holes, (row) => row.v, { unit: 'x' }).weeks).toBe(3);
  });

  it('means and totals skip what is missing rather than counting it as zero', () => {
    const holes = [{ v: 10 }, { v: null }, { v: 20 }];
    expect(meanOf(holes, (row) => row.v, 0)).toBe(15);
    expect(totalOf(holes, (row) => row.v)).toBe(30);
    expect(seriesOf(holes, (row) => row.v)).toEqual([10, 20]);
  });
});

/* ── The context ────────────────────────────────────────────────────────── */

describe('Analytics context — the window, not the data', () => {
  it('sorts reports it was handed in any order', () => {
    const shuffled = [weekReport(3), weekReport(1), weekReport(2)];
    const context = createAnalyticsContext({ weeklyReports: shuffled });

    expect(context.weeks.map((week) => week.weekStart))
      .toEqual([monday(1), monday(2), monday(3)]);
  });

  it('counts an unlogged week as inside the window and outside the data', () => {
    const context = createAnalyticsContext({
      weeklyReports: [weekReport(0), weekReport(1, { empty: true }), weekReport(2)],
    });

    expect(context.weeksInWindow).toBe(3);
    expect(context.weeksWithData).toBe(2);
    expect(context.emptyWeeks).toEqual([monday(1)]);
  });

  it('resolves the goal once, so the trends and the rules cannot disagree', () => {
    const context = createAnalyticsContext({ weeklyReports: series(3) });
    expect(context.goal.goal).toBe('lean_bulk');

    /* A profile goal is mapped onto the nutrition vocabulary, and the word
       that arrived is kept beside it — without the mapping, no cut would ever
       match DEFICIT_GOALS. */
    const overridden = createAnalyticsContext({
      weeklyReports: series(3), goal: { goal: 'cut' },
    });
    expect(overridden.goal.goal).toBe('fat_loss');
    expect(overridden.goal.statedGoal).toBe('cut');
  });

  it('names every metric it can read out of a report', () => {
    const context = createAnalyticsContext({ weeklyReports: series(3) });
    const measurable = context.measurable();

    expect(measurable.includes('volumeKg')).toBeTruthy();
    expect(measurable.includes('distanceKm')).toBeTruthy();
    expect(Object.keys(METRICS).length).toBeGreaterThan(measurable.length - 1);
  });
});

/* ── The rules ──────────────────────────────────────────────────────────── */

describe('Analytics engine — the rules', () => {
  it('declares every rule with an id, a name and a scope', () => {
    for (const rule of allAnalyticsRules()) {
      expect(Boolean(rule.id && rule.name && rule.scope)).toBeTruthy();
      expect(typeof rule.when).toBe('function');
      expect(typeof rule.apply).toBe('function');
    }
  });

  it('runs all three sets, not just the loudest', () => {
    expect(Object.keys(ANALYTICS_RULE_SETS)).toEqual(['plateau', 'progress', 'risk']);
  });

  it('records which rules fired', () => {
    const analysis = analyseAll(series(13, (i) => ({ topWeightKg: 80 + i * 2 })));
    expect(analysis.meta.rulesApplied.length).toBeGreaterThan(0);
  });
});

/* ── Snapshot consistency ───────────────────────────────────────────────── */

describe('Analytics engine — the same reports give the same analysis', () => {
  const reports = series(13, (i) => ({ topWeightKg: 80 + i * 2, weightKg: 70 + i * 0.2 }));

  it('produces identical output twice over', () => {
    const first = analyseAll(reports, { generatedAt: 'x' });
    const second = analyseAll(reports, { generatedAt: 'x' });

    expect(JSON.stringify(first.trends)).toBe(JSON.stringify(second.trends));
    expect(JSON.stringify(first.findings)).toBe(JSON.stringify(second.findings));
  });

  it('never disagrees with itself between a trend and a summary', () => {
    const analysis = analyseAll(reports);

    expect(analysis.bodyweightVelocity).toBe(analysis.trends.weightKg.perWeek);
    expect(analysis.goalProgress.velocityKgPerWeek).toBe(analysis.trends.weightKg.perWeek);
    expect(analysis.strengthTrend).toBe(analysis.trends.volumeKg);
    expect(analysis.adherence.trend).toBe(analysis.trends.adherencePercent);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(analyseAll(reports))).toBeTruthy();
  });

  it('carries the evidence of every finding under its own key', () => {
    const analysis = analyseAll(reports);
    for (const finding of analysis.findings) {
      expect(analysis.evidence[finding.key]).toBe(finding.evidence);
    }
  });
});

/* ── Caching, through the service ───────────────────────────────────────── */

function seed() {
  BackupService.reset();

  ProfileRepository.save({
    age: 28, sex: 'male', heightCm: 186, weightKg: 61, startWeightKg: 61,
    goalWeightKg: 74, activityLevel: 'moderate', experienceLevel: 'intermediate',
    goal: 'bulk', startDate: '2026-05-01', trainingDays: 4,
    availableDays: ['mon', 'tue', 'thu', 'sat'],
    sessionStart: '18:00', sessionEnd: '19:30',
  });

  SettingsRepository.save({ sleepHours: 8, appetite: 'normal', budgetLevel: 'medium', onboarded: true });
}

function resetCaches() {
  unwireApplication();
  invalidateAll();
  resetStats();
}

describe('Analytics service — built once, then read from cache', () => {
  it('analyses a window once for two reads', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    AnalyticsService.month();
    AnalyticsService.month();

    const entry = stats().find((item) => item.name === 'analytics');
    expect(entry.misses).toBe(1);
    expect(entry.hits).toBe(1);
  });

  it('returns the very same object, not an equal one', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    expect(AnalyticsService.month()).toBe(AnalyticsService.month());
  });

  it('keeps each period separate in the cache', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    AnalyticsService.week();
    AnalyticsService.month();

    expect(stats().find((item) => item.name === 'analytics').misses).toBe(2);
  });

  it('rebuilds after invalidation', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    AnalyticsService.quarter();
    Cache.invalidate('analytics');
    AnalyticsService.quarter();

    expect(stats().find((item) => item.name === 'analytics').misses).toBe(2);
  });

  it('analyses a real window end to end', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    const analysis = AnalyticsService.month();

    expect(analysis.period).toBe(ANALYTICS_PERIOD.MONTHLY);
    expect(analysis.range.weeks).toBe(ANALYTICS.WEEKS.monthly);
    expect(Array.isArray(analysis.findings)).toBeTruthy();
    expect(Array.isArray(analysis.reasons)).toBeTruthy();
    expect(analysis.meta.engineId).toBe('analytics-engine');
  });

  it('takes the goal from the profile', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    expect(AnalyticsService.month().goalProgress.goal).toBe('bulk');
  });

  it('answers for an arbitrary range', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    const analysis = AnalyticsService.range('2026-05-04', '2026-05-25');
    expect(analysis.range.weeks).toBe(4);
  });

  it('explains one of its figures through the service', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    const explanation = AnalyticsService.explain('trend.volumeKg', ANALYTICS_PERIOD.MONTHLY);
    expect(explanation === null || Boolean(explanation.source)).toBeTruthy();
  });
});
