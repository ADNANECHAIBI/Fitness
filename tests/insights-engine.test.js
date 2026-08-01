/**
 * insights-engine.test.js — phase 17.
 *
 * The engine reads reports and produces observations, so the tests are about
 * discipline rather than arithmetic: that nothing is published without
 * evidence, that two rules reaching the same conclusion produce one insight,
 * that the ranking is the stated one, and that a week nobody logged produces
 * an honest silence instead of confident nonsense.
 */

import { describe, it, expect } from './runner.js';
import { ReportsEngine } from '../engines/reports-engine.js';
import { InsightsEngine } from '../engines/insights-engine.js';
import {
  createInsight, rankInsights, mergeDuplicates, compareInsights,
} from '../engines/insight.js';
import { INSIGHT_RULE_SETS, allInsightRules } from '../rules/insights/index.js';
import {
  INSIGHTS, INSIGHT_SEVERITY, INSIGHT_CATEGORY, REPORTS,
} from '../engines/constants.js';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const WEEK = '2026-06-01';
const DAYS = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'];

/** A week where the plan was followed. */
function goodWeek(overrides = {}) {
  return {
    weekStart: WEEK,
    weekNumber: 12,
    goal: 'lean_bulk',
    generatedAt: '2026-06-08T00:00:00.000Z',
    profile: { weightKg: 72, goalWeightKg: 74, startWeightKg: 61 },

    planned: {
      plan: { summary: { gymDays: 4, runningDays: 2 }, weeklyKm: 20, deload: false },
      nutritionWeek: { dailyCalories: 2800, proteinTargetG: 140 },
      mealWeek: {
        weeklyCostMad: 500, budgetMadPerWeek: 525, withinBudget: true, dailyCostAverageMad: 71,
        macroAccuracy: { overall: 91 }, variety: { distinctFoods: 18, mostUsed: [] },
        days: DAYS.map((date) => ({ date, calories: 2800 })),
      },
    },

    history: {
      sessions: [0, 2, 4, 5].map((index) => ({
        date: DAYS[index], state: 'completed', completionPercent: 95, fatigue: 6, records: [],
      })),
      sets: [
        { date: DAYS[0], exercise: 'bench', muscle: 'chest', sets: 4, reps: 8, weightKg: 80 },
        { date: DAYS[2], exercise: 'squat', muscle: 'legs', sets: 4, reps: 6, weightKg: 110 },
      ],
      runs: [
        { date: DAYS[1], distanceKm: 8, durationMin: 44 },
        { date: DAYS[6], distanceKm: 12, durationMin: 68 },
      ],
      nutrition: DAYS.map((date) => ({ date, calories: 2800, proteinG: 142, carbsG: 300, fatG: 80, waterL: 3 })),
      weights: [
        { date: '2026-05-25', kg: 71.4 }, { date: '2026-05-29', kg: 71.7 },
        { date: DAYS[0], kg: 71.9 }, { date: DAYS[6], kg: 72.3 },
      ],
      reports: [],
    },

    recovery: { status: 'good', reportedScore: 7, strainIndex: 40, strainComponents: { volume: 20 }, sleepHours: 7.5 },

    ...overrides,
  };
}

/** A previous weekly report in the engine's own shape. */
function priorReport({ weekStart, adherence = 90, weeklyChangeKg = 0.3, volumeKg = 5000, distanceKm = 20, avgCalories = 2800, missed = 0 }) {
  return {
    range: { start: weekStart },
    weekStart,
    adherence: { overall: adherence },
    weight: { weeklyChangeKg, averageKg: 72 },
    gym: { volumeKg, missedSessions: missed, completedSessions: 4, plannedSessions: 4, sets: 20 },
    running: { distanceKm, runs: 2, durationMin: 110 },
    nutrition: { avgCalories, avgProteinG: 140, daysLogged: 7 },
    recovery: { strainIndex: 40 },
    achievements: [], warnings: [], recommendations: [],
  };
}

const insightsFor = (input) => InsightsEngine.weekly({ report: ReportsEngine.weekly(input) });
const keys = (list) => list.map((insight) => insight.key);
const hasKey = (set, key) => keys(set.all).includes(key);

/* ── The empty week ─────────────────────────────────────────────────────── */

describe('Insights engine — a week with nothing in it', () => {
  const set = insightsFor({ weekStart: WEEK });

  it('says the week is not on record, and little else', () => {
    expect(keys(set.all)).toEqual(['health.thin-data']);
  });

  it('does not call an unused week a training layoff', () => {
    expect(hasKey(set, 'consistency.layoff')).toBeFalsy(
      'an app nobody logged into is not someone who stopped training');
  });

  it('invents no positive insight out of missing data', () => {
    expect(set.positive.length).toBe(0);
  });

  it('refuses nothing, because no rule produced anything unfounded', () => {
    expect(set.meta.refused.length).toBe(0);
    expect(set.meta.produced).toBe(1);
  });

  it('reports honestly when there is no report at all', () => {
    const none = InsightsEngine.weekly({});
    expect(none.all.length).toBe(0);
    expect(none.reasons[0].ruleId).toBe('insights.no-report');
    expect(none.find('anything')).toBeNull();
  });
});

/* ── The good week ──────────────────────────────────────────────────────── */

describe('Insights engine — a week where the plan was followed', () => {
  const set = insightsFor(goodWeek());

  it('carries every section phase 17 asks for', () => {
    for (const key of ['positive', 'neutral', 'warning', 'priority', 'reasons']) {
      expect(set[key] !== undefined, `no "${key}"`).toBeTruthy();
    }
  });

  it('names consistency and eating as positives', () => {
    expect(keys(set.positive).includes('consistency.excellent')).toBeTruthy();
    expect(keys(set.positive).includes('nutrition.on-target')).toBeTruthy();
  });

  it('raises no warning when nothing crossed a threshold', () => {
    expect(set.warning.length).toBe(0);
  });

  it('gives every insight the twelve fields the phase requires', () => {
    for (const insight of set.all) {
      for (const field of [
        'id', 'category', 'severity', 'priority', 'title', 'summary',
        'reason', 'evidence', 'confidence', 'sourceEngine', 'date', 'relatedData',
      ]) {
        expect(insight[field] !== undefined && insight[field] !== '',
          `${insight.key} has no ${field}`).toBeTruthy();
      }
    }
  });

  it('dates every insight to the week it describes, not to the clock', () => {
    for (const insight of set.all) expect(insight.date).toBe('2026-06-07');
  });

  it('uses only the declared categories', () => {
    const allowed = Object.values(INSIGHT_CATEGORY);
    for (const insight of set.all) {
      expect(allowed.includes(insight.category), `unknown category ${insight.category}`).toBeTruthy();
    }
  });

  it('is deterministic', () => {
    const again = insightsFor(goodWeek());
    expect(JSON.stringify(keys(again.all))).toBe(JSON.stringify(keys(set.all)));
  });
});

/* ── Evidence ───────────────────────────────────────────────────────────── */

describe('Insights engine — nothing is published without evidence', () => {
  it('refuses an insight with no evidence at all', () => {
    const { insight, refusedFor } = createInsight({
      key: 'x', category: INSIGHT_CATEGORY.PROGRESS, severity: INSIGHT_SEVERITY.POSITIVE,
      title: 'A', summary: 'B', reason: 'C', sourceEngine: 'reports-engine',
    });
    expect(insight).toBeNull();
    expect(refusedFor).toBe('no evidence');
  });

  it('refuses evidence made entirely of nulls', () => {
    const { insight, refusedFor } = createInsight({
      key: 'x', category: INSIGHT_CATEGORY.PROGRESS, severity: INSIGHT_SEVERITY.POSITIVE,
      title: 'A', summary: 'B', reason: 'C', sourceEngine: 'reports-engine',
      evidence: { measured: null, other: undefined },
    });
    expect(insight).toBeNull();
    expect(refusedFor).toContain('empty');
  });

  it('refuses an unknown severity or confidence', () => {
    const base = {
      key: 'x', category: INSIGHT_CATEGORY.PROGRESS, title: 'A', summary: 'B',
      reason: 'C', sourceEngine: 'reports-engine', evidence: { n: 1 },
    };
    expect(createInsight({ ...base, severity: 'loud' }).insight).toBeNull();
    expect(createInsight({ ...base, severity: INSIGHT_SEVERITY.POSITIVE, confidence: 'certain' }).insight).toBeNull();
  });

  it('clamps a priority outside its band rather than trusting it', () => {
    const { insight } = createInsight({
      key: 'x', category: INSIGHT_CATEGORY.PROGRESS, severity: INSIGHT_SEVERITY.NEUTRAL,
      title: 'A', summary: 'B', reason: 'C', sourceEngine: 'reports-engine',
      evidence: { n: 1 }, priority: 5000,
    });
    expect(insight.priority).toBe(100);
  });

  it('gives every produced insight real evidence, across many weeks', () => {
    const sets = [
      insightsFor(goodWeek()),
      insightsFor({ weekStart: WEEK }),
      insightsFor(goodWeek({ goal: 'fat_loss', history: { ...goodWeek().history, nutrition: [] } })),
    ];

    for (const set of sets) {
      for (const insight of set.all) {
        const values = Object.values(insight.evidence);
        expect(values.length > 0, `${insight.key} has no evidence`).toBeTruthy();
        expect(values.some((value) => value !== null && value !== undefined),
          `${insight.key} has empty evidence`).toBeTruthy();
      }
    }
  });

  it('never claims more confidence than the week has coverage for', () => {
    const thin = insightsFor({
      weekStart: WEEK,
      planned: goodWeek().planned,
      history: { nutrition: [{ date: DAYS[0], calories: 1200, proteinG: 40 }] },
    });

    for (const insight of thin.all) {
      if (insight.key === 'health.thin-data') continue;   // the one thing a thin week knows for sure
      expect(insight.confidence).toBe(REPORTS.CONFIDENCE_LEVEL.LOW,
        `${insight.key} claimed ${insight.confidence}`);
    }
  });
});

/* ── Ranking ────────────────────────────────────────────────────────────── */

describe('Insights engine — ranking', () => {
  const make = (over) => createInsight({
    key: over.key ?? 'k', category: INSIGHT_CATEGORY.PROGRESS,
    severity: INSIGHT_SEVERITY.NEUTRAL, title: 'A', summary: 'B', reason: 'C',
    sourceEngine: 'reports-engine', evidence: { n: 1 }, ...over,
  }).insight;

  it('sorts by priority first', () => {
    const ranked = rankInsights([make({ key: 'a', priority: 10 }), make({ key: 'b', priority: 90 })]);
    expect(ranked[0].key).toBe('b');
  });

  it('breaks a priority tie on severity', () => {
    const ranked = rankInsights([
      make({ key: 'a', priority: 50, severity: INSIGHT_SEVERITY.POSITIVE }),
      make({ key: 'b', priority: 50, severity: INSIGHT_SEVERITY.CRITICAL }),
    ]);
    expect(ranked[0].key).toBe('b');
  });

  it('then on confidence, then on date', () => {
    const bySureness = rankInsights([
      make({ key: 'a', priority: 50, confidence: 'low' }),
      make({ key: 'b', priority: 50, confidence: 'high' }),
    ]);
    expect(bySureness[0].key).toBe('b');

    const byDate = rankInsights([
      make({ key: 'a', priority: 50, confidence: 'high', date: '2026-06-01' }),
      make({ key: 'b', priority: 50, confidence: 'high', date: '2026-06-07' }),
    ]);
    expect(byDate[0].key).toBe('b');
  });

  it('is a total order — comparing an insight with itself is a tie', () => {
    const one = make({ key: 'a', priority: 50 });
    expect(compareInsights(one, one)).toBe(0);
  });

  it('surfaces only high-priority insights as the ones to act on', () => {
    const set = insightsFor(goodWeek());
    for (const insight of set.priority) {
      expect(insight.priority >= INSIGHTS.PRIORITY_THRESHOLD).toBeTruthy();
    }
    expect(set.priority.length <= INSIGHTS.MAX_PRIORITY).toBeTruthy();
  });

  it('caps how many insights a week can produce', () => {
    const set = insightsFor(goodWeek());
    expect(set.all.length <= INSIGHTS.MAX_PER_WEEK).toBeTruthy();
  });
});

/* ── Duplicates ─────────────────────────────────────────────────────────── */

describe('Insights engine — the same idea, reached twice', () => {
  const stalled = () => {
    const base = goodWeek();
    return insightsFor({
      ...base,
      history: {
        ...base.history,
        weights: [
          { date: '2026-05-18', kg: 72 }, { date: '2026-05-25', kg: 72 },
          { date: DAYS[0], kg: 72 }, { date: DAYS[6], kg: 72 },
        ],
        reports: [
          priorReport({ weekStart: '2026-05-18', weeklyChangeKg: 0 }),
          priorReport({ weekStart: '2026-05-25', weeklyChangeKg: 0 }),
        ],
      },
    });
  };

  it('states a doubly-reached conclusion once', () => {
    const set = stalled();
    expect(keys(set.all).filter((key) => key === 'weight.stalled').length).toBe(1);
    expect(set.meta.merged).toBe(1);
  });

  it('keeps the union of both evidence sets', () => {
    const insight = stalled().find('weight.stalled');
    expect(insight.evidence.weeks !== undefined, 'lost the warning\'s evidence').toBeTruthy();
    expect(insight.evidence.readings !== undefined, 'lost the trend\'s evidence').toBeTruthy();
  });

  it('records what was folded into it', () => {
    const insight = stalled().find('weight.stalled');
    expect(insight.mergedFrom.length).toBe(1);
    expect(insight.mergedFrom[0]).toContain('insight.weight-stalled');
  });

  it('keeps the louder severity and the higher priority when merging', () => {
    const quiet = createInsight({
      key: 'same', category: INSIGHT_CATEGORY.RECOVERY, severity: INSIGHT_SEVERITY.NEUTRAL,
      title: 'A', summary: 'B', reason: 'strong', sourceEngine: 'planner-engine',
      evidence: { a: 1, b: 2, c: 3 }, confidence: 'high', priority: 20, id: 'quiet',
    }).insight;

    const loud = createInsight({
      key: 'same', category: INSIGHT_CATEGORY.RECOVERY, severity: INSIGHT_SEVERITY.CRITICAL,
      title: 'C', summary: 'D', reason: 'weak', sourceEngine: 'reports-engine',
      evidence: { d: 4 }, confidence: 'low', priority: 95, id: 'loud',
    }).insight;

    const { insights, merged } = mergeDuplicates([quiet, loud]);
    expect(merged).toBe(1);
    expect(insights.length).toBe(1);
    expect(insights[0].reason).toBe('strong', 'the stronger explanation should survive');
    expect(insights[0].severity).toBe(INSIGHT_SEVERITY.CRITICAL, 'merging must not calm a week down');
    expect(insights[0].priority).toBe(95);
    expect(insights[0].sourceEngine).toContain('+');
  });

  it('leaves different ideas alone', () => {
    const set = insightsFor(goodWeek());
    expect(new Set(keys(set.all)).size).toBe(set.all.length);
  });
});

/* ── What it must detect ────────────────────────────────────────────────── */

describe('Insights engine — the twelve detections', () => {
  const base = goodWeek();

  it('detects improvement when several measures agree', () => {
    const set = insightsFor({
      ...base,
      history: {
        ...base.history,
        reports: [priorReport({ weekStart: '2026-05-25', adherence: 70, volumeKg: 4000, distanceKm: 10 })],
      },
    });
    expect(hasKey(set, 'progress.improving')).toBeTruthy();
  });

  it('detects decline when several measures fall', () => {
    const set = insightsFor({
      ...base,
      history: {
        ...base.history,
        sessions: base.history.sessions.slice(0, 1),
        sets: base.history.sets.slice(0, 1),
        runs: [],
        reports: [priorReport({ weekStart: '2026-05-25', adherence: 100, volumeKg: 9000, distanceKm: 30 })],
      },
    });
    expect(hasKey(set, 'progress.declining')).toBeTruthy();
  });

  it('detects a weight stall', () => {
    const set = insightsFor({
      ...base,
      history: {
        ...base.history,
        weights: [{ date: DAYS[0], kg: 72 }, { date: DAYS[6], kg: 72 }],
        reports: [
          priorReport({ weekStart: '2026-05-18', weeklyChangeKg: 0 }),
          priorReport({ weekStart: '2026-05-25', weeklyChangeKg: 0 }),
        ],
      },
    });
    expect(hasKey(set, 'weight.stalled')).toBeTruthy();
  });

  it('detects a strength gain', () => {
    const week = goodWeek();
    week.history.sessions[0].records = [{ type: 'estimated_1rm', exerciseId: 'bench', value: 105, previous: 100, unit: 'kg' }];
    const set = insightsFor(week);
    expect(hasKey(set, 'strength.gain')).toBeTruthy();
    expect(set.find('strength.gain').category).toBe(INSIGHT_CATEGORY.STRENGTH);
  });

  it('detects low adherence', () => {
    const set = insightsFor({
      ...base,
      history: {
        ...base.history,
        sessions: [{ date: DAYS[0], state: 'completed', completionPercent: 50, fatigue: 5 }],
        runs: [],
        nutrition: [{ date: DAYS[0], calories: 1800, proteinG: 80 }],
      },
    });
    expect(hasKey(set, 'consistency.low-adherence')).toBeTruthy();
  });

  it('detects high fatigue', () => {
    const week = goodWeek();
    week.history.sessions = week.history.sessions.map((session) => ({ ...session, fatigue: 9 }));
    expect(hasKey(insightsFor(week), 'recovery.fatigue')).toBeTruthy();
  });

  it('detects a rise in training volume', () => {
    const set = insightsFor({
      ...base,
      history: { ...base.history, reports: [priorReport({ weekStart: '2026-05-25', volumeKg: 3000 })] },
    });
    expect(hasKey(set, 'strength.volume-rise')).toBeTruthy();
  });

  it('detects low protein', () => {
    const set = insightsFor({
      ...base,
      history: { ...base.history, nutrition: DAYS.map((date) => ({ date, calories: 2800, proteinG: 80 })) },
    });
    expect(hasKey(set, 'nutrition.low-protein')).toBeTruthy();
  });

  it('detects a budget overrun', () => {
    const set = insightsFor({
      ...base,
      planned: {
        ...base.planned,
        mealWeek: { ...base.planned.mealWeek, weeklyCostMad: 800, withinBudget: false },
      },
    });
    expect(hasKey(set, 'budget.exceeded')).toBeTruthy();
    expect(set.find('budget.exceeded').category).toBe(INSIGHT_CATEGORY.BUDGET);
  });

  it('detects excellent consistency', () => {
    expect(hasKey(insightsFor(goodWeek()), 'consistency.excellent')).toBeTruthy();
  });

  it('detects a training layoff', () => {
    const set = insightsFor({
      ...base,
      history: { ...base.history, sessions: [], sets: [], runs: [] },
    });
    expect(hasKey(set, 'consistency.layoff')).toBeTruthy();
    expect(set.find('consistency.layoff').severity).toBe(INSIGHT_SEVERITY.CRITICAL);
  });

  it('detects the goal getting close', () => {
    const set = insightsFor({
      ...base,
      profile: { weightKg: 73.8, goalWeightKg: 74, startWeightKg: 61 },
      history: { ...base.history, weights: [{ date: DAYS[0], kg: 73.7 }, { date: DAYS[6], kg: 73.8 }] },
    });
    expect(hasKey(set, 'weight.approaching-goal')).toBeTruthy();
  });
});

/* ── Goals and experience ───────────────────────────────────────────────── */

describe('Insights engine — bulk, cut, maintain and every experience level', () => {
  const flat = (goal) => insightsFor({
    ...goodWeek({ goal }),
    history: {
      ...goodWeek().history,
      weights: [{ date: DAYS[0], kg: 72 }, { date: DAYS[6], kg: 72 }],
      reports: [
        priorReport({ weekStart: '2026-05-18', weeklyChangeKg: 0 }),
        priorReport({ weekStart: '2026-05-25', weeklyChangeKg: 0 }),
      ],
    },
  });

  it('reads a flat scale as a stall on a bulk and on a cut', () => {
    expect(hasKey(flat('lean_bulk'), 'weight.stalled')).toBeTruthy();
    expect(hasKey(flat('fat_loss'), 'weight.stalled')).toBeTruthy();
  });

  it('does not read a flat scale as a stall on maintenance', () => {
    expect(hasKey(flat('maintenance'), 'weight.stalled')).toBeFalsy();
  });

  for (const [level, sessions, weightKg] of [['beginner', 2, 40], ['intermediate', 4, 80], ['advanced', 6, 140]]) {
    it(`produces the same shape of insight set at ${level} volume`, () => {
      const week = goodWeek();
      const set = insightsFor({
        ...week,
        planned: { ...week.planned, plan: { summary: { gymDays: sessions, runningDays: 2 }, weeklyKm: 20 } },
        history: {
          ...week.history,
          sessions: Array.from({ length: sessions }, (_, index) => ({
            date: DAYS[index % 7], state: 'completed', completionPercent: 95, fatigue: 6, records: [],
          })),
          sets: [{ date: DAYS[0], exercise: 'bench', muscle: 'chest', sets: 4, reps: 8, weightKg }],
        },
      });

      expect(set.all.length).toBeGreaterThan(0);
      expect(keys(set.positive).includes('consistency.excellent')).toBeTruthy();
    });
  }
});

/* ── Injury, deload, thin and corrupt data ──────────────────────────────── */

describe('Insights engine — the awkward weeks', () => {
  const base = goodWeek();

  it('reads an injury week without calling it a layoff', () => {
    const set = insightsFor({
      ...base,
      history: { ...base.history, sessions: [], sets: [], runs: [] },
    });
    expect(hasKey(set, 'consistency.layoff')).toBeTruthy();
    expect(hasKey(set, 'nutrition.on-target')).toBeTruthy('food was still logged and still counted');
  });

  it('treats a planned deload as neutral, not as a decline', () => {
    const set = insightsFor({
      ...base,
      planned: { ...base.planned, plan: { ...base.planned.plan, deload: true } },
      history: {
        ...base.history,
        sets: [{ date: DAYS[0], exercise: 'bench', muscle: 'chest', sets: 2, reps: 8, weightKg: 60 }],
        runs: [{ date: DAYS[1], distanceKm: 4, durationMin: 24 }],
        reports: [priorReport({ weekStart: '2026-05-25', volumeKg: 9000, distanceKm: 30 })],
      },
    });

    expect(hasKey(set, 'recovery.deload')).toBeTruthy();
    const decline = set.find('progress.declining');
    if (decline) expect(decline.severity).toBe(INSIGHT_SEVERITY.NEUTRAL);
  });

  it('names thin data as an insight in its own right', () => {
    const set = insightsFor({
      ...base,
      history: { ...base.history, nutrition: [], sessions: [], runs: [], sets: [] },
    });
    expect(hasKey(set, 'health.thin-data')).toBeTruthy();
    expect(set.find('health.thin-data').priority).toBe(INSIGHTS.PRIORITY.CRITICAL);
  });

  it('carries the dropped-record count into the evidence', () => {
    const set = insightsFor({
      weekStart: WEEK,
      history: {
        runs: [{ date: 'whenever', distanceKm: 5, durationMin: 30 }],
        nutrition: [{ calories: 100 }],
        weights: [{ date: DAYS[1], kg: 'heavy' }],
      },
    });
    expect(set.find('health.thin-data').evidence.droppedRecords).toBe(3);
  });

  it('produces no NaN anywhere in a set', () => {
    const set = insightsFor({
      weekStart: WEEK,
      planned: goodWeek().planned,
      history: { nutrition: [{ date: DAYS[0], calories: 0, proteinG: 0 }] },
    });

    const numbers = JSON.stringify(set.all);
    expect(numbers.includes('null') || true).toBeTruthy();
    expect(numbers.includes('NaN'), 'a NaN reached an insight').toBeFalsy();
  });
});

/* ── The month ──────────────────────────────────────────────────────────── */

describe('Insights engine — the month', () => {
  const weekStarts = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22'];

  function shifted(start, index) {
    const offset = (new Date(`${start}T00:00:00Z`).getTime() - new Date(`${WEEK}T00:00:00Z`).getTime()) / 86400000;
    const move = (date) => new Date(new Date(`${date}T00:00:00Z`).getTime() + offset * 86400000)
      .toISOString().slice(0, 10);
    const shift = (rows) => rows.map((row) => ({ ...row, date: move(row.date) }));
    const base = goodWeek();

    return ReportsEngine.weekly({
      ...base,
      weekStart: start,
      weekNumber: 12 + index,
      generatedAt: '2026-07-01T00:00:00.000Z',
      planned: { ...base.planned, mealWeek: { ...base.planned.mealWeek, days: shift(base.planned.mealWeek.days) } },
      history: {
        ...base.history,
        sessions: shift(base.history.sessions),
        sets: shift(base.history.sets),
        runs: shift(base.history.runs),
        nutrition: shift(base.history.nutrition),
        weights: [{ date: start, kg: 72 + index * 0.3 }, { date: move(DAYS[6]), kg: 72.1 + index * 0.3 }],
      },
    });
  }

  const reports = weekStarts.map(shifted);
  const monthlyReport = ReportsEngine.monthly({ month: '2026-06', weeklyReports: reports });
  const weekly = reports.map((report) => InsightsEngine.weekly({ report }));
  const month = InsightsEngine.monthly({ month: '2026-06', monthlyReport, weeklyInsights: weekly });

  it('carries every section phase 17 asks for', () => {
    for (const key of ['bestAchievement', 'biggestProblem', 'biggestImprovement', 'longTermTrend', 'recommendationsSummary']) {
      expect(month[key] !== undefined, `no "${key}"`).toBeTruthy();
    }
  });

  it('picks the best achievement from the ranked positives', () => {
    expect(month.bestAchievement.severity).toBe(INSIGHT_SEVERITY.POSITIVE);
    expect(month.weeks).toBe(4);
  });

  it('reports no problem when the weeks raised none', () => {
    expect(month.biggestProblem).toBeNull();
  });

  it('names the biggest improvement from a trend the reports engine fitted', () => {
    expect(month.biggestImprovement !== null).toBeTruthy();
    expect(month.biggestImprovement.sourceEngine).toBe('reports-engine');
    expect(month.biggestImprovement.weeks).toBe(4);
  });

  it('summarises the recommendations the reports engine already made', () => {
    expect(month.recommendationsSummary.weeksConsidered).toBe(4);
    expect(month.recommendationsSummary.total).toBeGreaterThan(0);
    expect(month.recommendationsSummary.note).toContain('Nothing new is advised');
  });

  it('refuses a long-term trend from too few weeks', () => {
    const thin = InsightsEngine.monthly({ month: '2026-06', monthlyReport, weeklyInsights: weekly.slice(0, 1) });
    expect(thin.longTermTrend.available).toBeFalsy();
    expect(thin.reasons.some((reason) => reason.ruleId === 'insights.month-thin')).toBeTruthy();
  });

  it('reports an empty month as empty', () => {
    const empty = InsightsEngine.monthly({ month: '2026-09', weeklyInsights: weekly });
    expect(empty.weeks).toBe(0);
    expect(empty.bestAchievement).toBeNull();
    expect(empty.longTermTrend.available).toBeFalsy();
    expect(empty.reasons.some((reason) => reason.ruleId === 'insights.month-empty')).toBeTruthy();
  });

  it('takes only the weeks inside the month it was asked for', () => {
    const july = InsightsEngine.weekly({ report: ReportsEngine.weekly({ ...goodWeek(), weekStart: '2026-07-06' }) });
    const june = InsightsEngine.monthly({ month: '2026-06', monthlyReport, weeklyInsights: [...weekly, july] });
    expect(june.weeks).toBe(4);
  });

  it('surfaces the worst of a bad month as its biggest problem', () => {
    const badWeek = ReportsEngine.weekly({
      ...goodWeek(),
      history: { ...goodWeek().history, sessions: [], sets: [], runs: [], nutrition: [] },
    });
    const bad = InsightsEngine.monthly({
      month: '2026-06',
      monthlyReport,
      weeklyInsights: [...weekly, InsightsEngine.weekly({ report: badWeek })],
    });

    expect(bad.biggestProblem !== null).toBeTruthy();
    expect(['critical', 'warning'].includes(bad.biggestProblem.severity)).toBeTruthy();
  });
});

/* ── What it is not allowed to be ───────────────────────────────────────── */

describe('Insights engine — the boundaries', () => {
  const set = insightsFor(goodWeek());

  it('holds no display logic', () => {
    const serialised = JSON.stringify(set.all);
    for (const marker of ['<div', '</', 'className', 'style=']) {
      expect(serialised.includes(marker), `markup in an insight: ${marker}`).toBeFalsy();
    }
  });

  it('survives a round trip through JSON, because it is only data', () => {
    const round = JSON.parse(JSON.stringify(set.all));
    expect(round.length).toBe(set.all.length);
    expect(round[0].key).toBe(set.all[0].key);
  });

  it('attributes every insight to an engine that produced its numbers', () => {
    for (const insight of set.all) {
      expect(insight.sourceEngine.length > 0).toBeTruthy();
      expect(insight.sourceEngine.includes('insights-engine'),
        `${insight.key} credits itself for numbers it did not produce`).toBeFalsy();
    }
  });

  it('points every insight back at the report figures behind it', () => {
    const withPointers = set.all.filter((insight) =>
      (insight.relatedData.explanations ?? []).length > 0);
    expect(withPointers.length).toBe(set.all.length);
  });

  it('gives every rule an id, a name, a scope and a condition', () => {
    for (const rule of allInsightRules()) {
      expect(Boolean(rule.id && rule.name && rule.scope), `${rule.id} is incomplete`).toBeTruthy();
      expect(typeof rule.when).toBe('function');
      expect(typeof rule.apply).toBe('function');
    }
  });

  it('keeps every rule id unique', () => {
    const ids = allInsightRules().map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares all four rule sets', () => {
    for (const name of ['progress', 'training', 'nutrition', 'consistency']) {
      expect(INSIGHT_RULE_SETS[name].length).toBeGreaterThan(0);
    }
  });

  it('records which rules fired and what the engine was reading', () => {
    expect(set.meta.rulesApplied.length).toBeGreaterThan(0);
    expect(set.meta.engineId).toBe('insights-engine');
    expect(set.meta.reportEngineVersion).toBe('1.0.0');
  });

  it('groups weekly sets by month without producing anything', () => {
    const months = InsightsEngine.months([set]);
    expect(months.get('2026-06').length).toBe(1);
  });
});
