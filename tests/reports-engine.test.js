/**
 * reports-engine.test.js — phase 16.
 *
 * The engine produces no numbers of its own, so most of what is worth testing
 * is the opposite of arithmetic: that an empty week reports as empty rather
 * than as zeros, that a corrupt row is dropped and counted, that nothing is
 * recommended without evidence, and that every figure can say where it came
 * from.
 */

import { describe, it, expect } from './runner.js';
import { ReportsEngine } from '../engines/reports-engine.js';
import { createWeeklyReportContext } from '../engines/report-context.js';
import { createExplainer } from '../engines/report-explain.js';
import { REPORT_RULE_SETS, allReportRules } from '../rules/reports/index.js';
import { REPORTS, WARNING, ACHIEVEMENT, RUNNING_LOAD } from '../engines/constants.js';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const WEEK = '2026-06-01';               // a Monday
const DAYS = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'];

/** A week where everything was planned and everything was done. */
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
        weeklyCostMad: 500, budgetMadPerWeek: 525, withinBudget: true,
        dailyCostAverageMad: 71,
        macroAccuracy: { overall: 91 },
        variety: { distinctFoods: 18, mostUsed: [] },
        days: DAYS.map((date) => ({ date, calories: 2800 })),
      },
    },

    history: {
      sessions: [
        { date: DAYS[0], state: 'completed', completionPercent: 100, fatigue: 6 },
        { date: DAYS[2], state: 'completed', completionPercent: 95, fatigue: 6 },
        { date: DAYS[4], state: 'completed', completionPercent: 92, fatigue: 5 },
        { date: DAYS[5], state: 'completed', completionPercent: 98, fatigue: 6 },
      ],
      sets: [
        { date: DAYS[0], exercise: 'bench', muscle: 'chest', sets: 4, reps: 8, weightKg: 80 },
        { date: DAYS[2], exercise: 'squat', muscle: 'legs', sets: 4, reps: 6, weightKg: 110 },
      ],
      runs: [
        { date: DAYS[1], distanceKm: 8, durationMin: 44 },
        { date: DAYS[6], distanceKm: 12, durationMin: 68 },
      ],
      nutrition: DAYS.map((date) => ({
        date, calories: 2800, proteinG: 142, carbsG: 300, fatG: 80, waterL: 3,
      })),
      weights: [
        { date: '2026-05-25', kg: 71.4 },
        { date: '2026-05-29', kg: 71.7 },
        { date: DAYS[0], kg: 71.9 },
        { date: DAYS[6], kg: 72.3 },
      ],
      reports: [],
    },

    recovery: {
      status: 'good', reportedScore: 7, strainIndex: 40,
      strainComponents: { volume: 20, running: 10 }, sleepHours: 7.5, compliancePercent: 90,
    },

    ...overrides,
  };
}

/** Four weeks of running history, so the load ratio has something to divide by. */
function runHistory(weeks = 4, kmPerRun = 8) {
  const runs = [];
  for (let week = weeks; week >= 1; week -= 1) {
    for (const offset of [0, 3]) {
      const day = new Date(new Date(`${WEEK}T00:00:00Z`).getTime() - (week * 7 - offset) * 86400000);
      runs.push({ date: day.toISOString().slice(0, 10), distanceKm: kmPerRun, durationMin: kmPerRun * 5.5 });
    }
  }
  return runs;
}

/** A previous weekly report, in the engine's own shape, for streaks and trends. */
function priorReport({ weekStart, adherence = 90, weeklyChangeKg = 0.3, volumeKg = 5000, missed = 0, averageKg = 72 }) {
  return {
    range: { start: weekStart },
    weekStart,
    adherence: { overall: adherence },
    weight: { weeklyChangeKg, averageKg },
    gym: { volumeKg, missedSessions: missed, completedSessions: 4, plannedSessions: 4, sets: 20 },
    running: { distanceKm: 20, runs: 2, durationMin: 110 },
    nutrition: { avgCalories: 2800, avgProteinG: 140, daysLogged: 7 },
    recovery: { strainIndex: 40 },
    achievements: [],
    warnings: [],
    recommendations: [],
  };
}

const typesOf = (list) => list.map((item) => item.type ?? item.id);
const has = (list, value) => typesOf(list).includes(value);

/* ── The empty week ─────────────────────────────────────────────────────── */

describe('Reports engine — a week with nothing in it', () => {
  const report = ReportsEngine.weekly({ weekStart: WEEK });

  it('still produces a report, over the right seven days', () => {
    expect(report.range.start).toBe(WEEK);
    expect(report.range.end).toBe('2026-06-07');
    expect(report.range.days.length).toBe(7);
  });

  it('reports missing figures as null, never as zero', () => {
    expect(report.weight.averageKg).toBeNull('an unweighed week is not a week at 0 kg');
    expect(report.weight.weeklyChangeKg).toBeNull();
    expect(report.nutrition.avgCalories).toBeNull('no logs is not a zero-calorie week');
    expect(report.adherence.overall).toBeNull('nothing planned cannot be adhered to');
  });

  it('counts what it does know', () => {
    expect(report.gym.sessions).toBe(0);
    expect(report.running.runs).toBe(0);
    expect(report.nutrition.daysLogged).toBe(0);
    expect(report.coverage.ratio).toBe(0);
  });

  it('warns that the week is not on record', () => {
    expect(has(report.warnings, WARNING.DATA_MISSING)).toBeTruthy();
  });

  it('recommends logging rather than changing anything', () => {
    expect(typesOf(report.recommendations)).toEqual(['log-more']);
    expect(report.recommendations[0].confidence).toBe(REPORTS.CONFIDENCE_LEVEL.LOW);
  });

  it('claims no achievements', () => {
    expect(report.achievements.length).toBe(0);
  });
});

/* ── The full week ──────────────────────────────────────────────────────── */

describe('Reports engine — a week where everything was done', () => {
  const report = ReportsEngine.weekly(goodWeek());

  it('carries every section phase 16 asks for', () => {
    for (const key of [
      'weekNumber', 'range', 'weight', 'gym', 'running', 'nutrition', 'meals',
      'recovery', 'adherence', 'trainingLoad', 'progress', 'achievements',
      'warnings', 'recommendations', 'reasons', 'explanations',
    ]) {
      expect(report[key] !== undefined, `the report has no "${key}"`).toBeTruthy();
    }
  });

  it('reads tonnage from the strength engine rather than recomputing it', () => {
    // 4×8×80 + 4×6×110 = 2560 + 2640
    expect(report.gym.volumeKg).toBe(5200);
    expect(report.explain('gym.volumeKg').source).toBe('strength-engine');
  });

  it('reads distance and pace from the running engine', () => {
    expect(report.running.distanceKm).toBe(20);
    expect(report.running.durationMin).toBe(112);
    expect(report.explain('running.avgPaceSecPerKm').source).toBe('running-engine');
  });

  it('scores adherence out of the three components that had a plan', () => {
    expect(report.adherence.componentsCounted).toEqual(['gym', 'running', 'nutrition']);
    expect(report.adherence.overall).toBe(100);
  });

  it('grants perfect adherence and stays inside the budget', () => {
    expect(has(report.achievements, ACHIEVEMENT.PERFECT_ADHERENCE)).toBeTruthy();
    expect(has(report.achievements, ACHIEVEMENT.BUDGET_SUCCESS)).toBeTruthy();
  });

  it('keeps the plan when nothing crossed a threshold', () => {
    expect(report.warnings.length).toBe(0);
    expect(typesOf(report.recommendations)).toEqual(['hold-course']);
  });

  it('takes the weight rate from the body engine\'s trend, not from two readings', () => {
    expect(report.explain('weight.weeklyChangeKg').source).toBe('body-engine');
    expect(report.weight.weeklyChangeKg > 0).toBeTruthy();
  });

  it('is deterministic — the same input twice is the same report', () => {
    const again = ReportsEngine.weekly(goodWeek());
    expect(JSON.stringify(again.gym)).toBe(JSON.stringify(report.gym));
    expect(JSON.stringify(again.nutrition)).toBe(JSON.stringify(report.nutrition));
    expect(again.meta.generatedAt).toBe(report.meta.generatedAt);
  });
});

/* ── Explainability ─────────────────────────────────────────────────────── */

describe('Reports engine — every number can say where it came from', () => {
  const report = ReportsEngine.weekly(goodWeek());

  it('explains the adherence figure with the parts it was built from', () => {
    const explanation = report.explain('adherence.overall');
    expect(explanation.value).toBe(100);
    expect(explanation.inputs.gym).toBe(100);
    expect(explanation.method).toContain('weighted mean');
  });

  it('explains why recovery reads the way it does', () => {
    expect(report.explain('recovery.strainIndex').source).toBe('planner-engine');
    expect(report.explain('recovery.avgFatigue').source).toBe('execution-engine');
  });

  it('explains why the week was or was not a deload', () => {
    const explanation = report.explain('recovery.deload');
    expect(explanation.value).toBe(false);
    expect(explanation.inputs.planned).toBe(false);
  });

  it('names a source engine on every explanation', () => {
    const missing = Object.values(report.explanations).filter((entry) => !entry.source);
    expect(missing.length, 'an explanation without a source engine').toBe(0);
  });

  it('renders one explanation as a sentence, for a console', () => {
    expect(report.describe('gym.volumeKg')).toContain('strength-engine');
    expect(report.describe('nothing.here')).toContain('Nothing was recorded');
  });

  it('refuses to record a figure with no method or source', () => {
    const explain = createExplainer();
    expect(() => explain.figure('x', 1, { source: 'reports-engine' })).toThrow();
    expect(() => explain.figure('x', 1, { method: 'guessing' })).toThrow();
  });
});

/* ── Evidence ───────────────────────────────────────────────────────────── */

describe('Reports engine — nothing is recommended without evidence', () => {
  const weeks = [
    ReportsEngine.weekly(goodWeek()),
    ReportsEngine.weekly({ weekStart: WEEK }),
    ReportsEngine.weekly(goodWeek({
      goal: 'fat_loss',
      history: { ...goodWeek().history, nutrition: [] },
    })),
  ];

  it('gives every recommendation a reason, evidence, confidence and source engine', () => {
    for (const report of weeks) {
      for (const item of report.recommendations) {
        expect(Boolean(item.reason), `${item.id} has no reason`).toBeTruthy();
        expect(Object.keys(item.evidence ?? {}).length > 0, `${item.id} has no evidence`).toBeTruthy();
        expect(Boolean(item.confidence), `${item.id} has no confidence`).toBeTruthy();
        expect(Boolean(item.sourceEngine), `${item.id} has no source engine`).toBeTruthy();
      }
    }
  });

  it('gives every warning its evidence too', () => {
    for (const report of weeks) {
      for (const warning of report.warnings) {
        expect(Object.keys(warning.evidence ?? {}).length > 0, `${warning.type} has no evidence`).toBeTruthy();
        expect(Boolean(warning.severity)).toBeTruthy();
      }
    }
  });

  it('never claims more confidence than the week has coverage for', () => {
    const thin = ReportsEngine.weekly({
      weekStart: WEEK,
      history: { nutrition: [{ date: DAYS[0], calories: 2000 }] },
    });
    for (const item of thin.recommendations) {
      expect(item.confidence).toBe(REPORTS.CONFIDENCE_LEVEL.LOW);
    }
  });

  it('drops an incomplete recommendation instead of showing it', () => {
    const report = ReportsEngine.weekly(goodWeek());
    expect(report.meta.recommendationsDropped.length).toBe(0);
    expect(report.recommendations.every((item) => item.evidence)).toBeTruthy();
  });
});

/* ── Goals ──────────────────────────────────────────────────────────────── */

describe('Reports engine — bulk, cut and maintain', () => {
  const stalled = (goal) => {
    const base = goodWeek({ goal });
    return ReportsEngine.weekly({
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

  it('calls a flat scale a stall on a bulk, and suggests more calories', () => {
    const report = stalled('lean_bulk');
    expect(has(report.warnings, WARNING.WEIGHT_STALLED)).toBeTruthy();
    expect(typesOf(report.recommendations).includes('increase-calories')).toBeTruthy();
  });

  it('suggests the other direction on a cut', () => {
    const report = stalled('fat_loss');
    expect(typesOf(report.recommendations).includes('reduce-calories')).toBeTruthy();
    expect(typesOf(report.recommendations).includes('increase-calories')).toBeFalsy();
  });

  it('says nothing about the scale on maintenance', () => {
    const report = stalled('maintenance');
    expect(has(report.warnings, WARNING.WEIGHT_STALLED)).toBeFalsy('a flat week is the goal on maintenance');
  });

  it('explains why it did not raise calories when the week was not followed', () => {
    const base = goodWeek({ goal: 'lean_bulk' });
    const report = ReportsEngine.weekly({
      ...base,
      history: {
        ...base.history,
        nutrition: [{ date: DAYS[0], calories: 2800, proteinG: 140 }],
        sessions: [],
        weights: [{ date: DAYS[0], kg: 72 }, { date: DAYS[6], kg: 72 }],
        reports: [
          priorReport({ weekStart: '2026-05-18', weeklyChangeKg: 0, adherence: 30 }),
          priorReport({ weekStart: '2026-05-25', weeklyChangeKg: 0, adherence: 30 }),
        ],
      },
    });

    const hold = report.recommendations.find((item) => item.id === 'hold-calories');
    expect(Boolean(hold), 'no hold-calories recommendation').toBeTruthy();
    expect(hold.reason).toContain('cannot be said to have failed');
    expect(typesOf(report.recommendations).includes('increase-calories')).toBeFalsy();
  });
});

/* ── Experience levels ──────────────────────────────────────────────────── */

describe('Reports engine — beginner, intermediate, advanced', () => {
  for (const [level, volumeKg, sessions] of [
    ['beginner', 1500, 2],
    ['intermediate', 5200, 4],
    ['advanced', 14000, 6],
  ]) {
    it(`builds a report at ${level} volume without changing shape`, () => {
      const base = goodWeek();
      const report = ReportsEngine.weekly({
        ...base,
        planned: { ...base.planned, plan: { summary: { gymDays: sessions, runningDays: 2 }, weeklyKm: 20 } },
        history: {
          ...base.history,
          sessions: Array.from({ length: sessions }, (_, index) => ({
            date: DAYS[index % 7], state: 'completed', completionPercent: 95, fatigue: 6,
          })),
          sets: [{ date: DAYS[0], exercise: 'squat', muscle: 'legs', sets: 5, reps: 5, weightKg: volumeKg / 25 }],
        },
      });

      expect(report.gym.completedSessions).toBe(sessions);
      expect(report.gym.volumeKg).toBe(volumeKg);
      expect(report.adherence.gym).toBe(100);
    });
  }
});

/* ── The interesting weeks ──────────────────────────────────────────────── */

describe('Reports engine — the weeks worth reporting', () => {
  it('names a personal record the execution engine detected, without re-detecting it', () => {
    const base = goodWeek();
    base.history.sessions[0].records = [
      { type: 'estimated_1rm', exerciseId: 'bench', value: 105, previous: 100, unit: 'kg' },
    ];
    const report = ReportsEngine.weekly(base);

    expect(has(report.achievements, ACHIEVEMENT.PERSONAL_BEST)).toBeTruthy();
    const change = report.gym.estimated1RM.find((row) => row.exerciseId === 'bench');
    expect(change.changeKg).toBe(5);
    expect(change.source).toContain('execution-engine');
  });

  it('estimates a one-rep max itself only where no record exists, and says so', () => {
    const report = ReportsEngine.weekly(goodWeek());
    const squat = report.gym.estimated1RM.find((row) => row.exerciseId === 'squat');
    expect(squat.previousKg).toBeNull('nothing to compare against');
    expect(squat.source).toContain('strength-engine');
  });

  it('calls a load spike overreaching once there is a chronic window to divide by', () => {
    const base = goodWeek();
    const report = ReportsEngine.weekly({
      ...base,
      history: {
        ...base.history,
        runs: [...runHistory(4, 4), { date: DAYS[1], distanceKm: 25, durationMin: 150 }],
      },
    });

    expect(report.running.trainingLoadReliable).toBeTruthy();
    expect(report.running.trainingLoad.verdict).toBe('spiking');
    expect(has(report.warnings, WARNING.OVERREACHING)).toBeTruthy();
  });

  it('does not call a first week of running a spike', () => {
    const base = goodWeek();
    const report = ReportsEngine.weekly({
      ...base,
      history: { ...base.history, runs: [{ date: DAYS[1], distanceKm: 25, durationMin: 150 }] },
    });

    expect(report.running.trainingLoad.verdict).toBe('spiking', 'the ratio itself is unchanged');
    expect(report.running.trainingLoadReliable).toBeFalsy();
    expect(has(report.warnings, WARNING.OVERREACHING)).toBeFalsy('four days of history is not a chronic load');
  });

  it('suggests a deload when load and recovery disagree', () => {
    const base = goodWeek();
    const report = ReportsEngine.weekly({
      ...base,
      history: {
        ...base.history,
        runs: [...runHistory(4, 4), { date: DAYS[1], distanceKm: 25, durationMin: 150 }],
      },
      recovery: { status: 'poor', reportedScore: 3, strainIndex: 78, strainComponents: { volume: 40 }, sleepHours: 6 },
    });

    expect(has(report.warnings, WARNING.UNDER_RECOVERY)).toBeTruthy();
    expect(typesOf(report.recommendations).includes('deload')).toBeTruthy();
  });

  it('detects a deload from the plan, and does not then suggest one', () => {
    const base = goodWeek();
    const report = ReportsEngine.weekly({
      ...base,
      planned: { ...base.planned, plan: { ...base.planned.plan, deload: true } },
      recovery: { status: 'poor', reportedScore: 3, strainIndex: 78, sleepHours: 6 },
    });

    expect(report.recovery.deload.detected).toBeTruthy();
    expect(report.recovery.deload.planned).toBeTruthy();
    expect(typesOf(report.recommendations).includes('deload')).toBeFalsy();
  });

  it('detects a deload from a drop in tonnage against the previous week', () => {
    const base = goodWeek();
    const report = ReportsEngine.weekly({
      ...base,
      history: { ...base.history, reports: [priorReport({ weekStart: '2026-05-25', volumeKg: 9000 })] },
    });

    expect(report.recovery.deload.detected).toBeTruthy();
    expect(report.recovery.deload.planned).toBeFalsy();
    expect(report.explain('recovery.deload').inputs.previousVolumeKg).toBe(9000);
  });

  it('reports low adherence and missed sessions', () => {
    const base = goodWeek();
    const report = ReportsEngine.weekly({
      ...base,
      history: {
        ...base.history,
        sessions: [{ date: DAYS[0], state: 'completed', completionPercent: 60, fatigue: 8 }],
        runs: [],
        nutrition: [{ date: DAYS[0], calories: 1900, proteinG: 90 }],
      },
    });

    expect(report.gym.missedSessions).toBe(3);
    expect(has(report.warnings, WARNING.MISSED_WORKOUTS)).toBeTruthy();
    expect(has(report.warnings, WARNING.MISSED_RUNS)).toBeTruthy();
    expect(has(report.warnings, WARNING.LOW_PROTEIN)).toBeTruthy();
    expect(has(report.warnings, WARNING.CALORIES_TOO_LOW)).toBeTruthy();
    expect(report.adherence.overall < REPORTS.ADHERENCE_LOW).toBeTruthy();
  });

  it('flags high fatigue from what the sessions reported', () => {
    const base = goodWeek();
    base.history.sessions = base.history.sessions.map((session) => ({ ...session, fatigue: 9 }));
    const report = ReportsEngine.weekly(base);

    expect(report.recovery.avgFatigue).toBe(9);
    expect(has(report.warnings, WARNING.HIGH_FATIGUE)).toBeTruthy();
  });

  it('reads an injury week — nothing lifted, everything else intact', () => {
    const base = goodWeek();
    const report = ReportsEngine.weekly({
      ...base,
      history: { ...base.history, sessions: [], sets: [], runs: [] },
    });

    expect(report.gym.volumeKg).toBe(0);
    expect(report.gym.missedSessions).toBe(4);
    expect(report.nutrition.daysLogged).toBe(7, 'food was still logged');
    expect(report.adherence.nutrition).toBe(100);
    expect(report.adherence.overall < 100).toBeTruthy();
  });

  it('counts a streak only while it is unbroken', () => {
    const base = goodWeek();
    const report = ReportsEngine.weekly({
      ...base,
      history: {
        ...base.history,
        reports: [
          priorReport({ weekStart: '2026-05-11', adherence: 95 }),
          priorReport({ weekStart: '2026-05-18', adherence: 20 }),
          priorReport({ weekStart: '2026-05-25', adherence: 95 }),
        ],
      },
    });

    expect(report.explain('streak.weeks').value).toBe(2, 'this week plus one, stopping at the 20% week');
    expect(has(report.achievements, ACHIEVEMENT.STREAK)).toBeTruthy();
  });

  it('names the most consistent week only when it beats every earlier one', () => {
    const base = goodWeek();
    const better = ReportsEngine.weekly({
      ...base,
      history: { ...base.history, reports: [priorReport({ weekStart: '2026-05-25', adherence: 80 })] },
    });
    const worse = ReportsEngine.weekly({
      ...base,
      history: {
        ...base.history,
        sessions: base.history.sessions.slice(0, 2),
        reports: [priorReport({ weekStart: '2026-05-25', adherence: 100 })],
      },
    });

    expect(has(better.achievements, ACHIEVEMENT.MOST_CONSISTENT_WEEK)).toBeTruthy();
    expect(has(worse.achievements, ACHIEVEMENT.MOST_CONSISTENT_WEEK)).toBeFalsy();
  });

  it('marks the goal reached when the scale gets there', () => {
    const base = goodWeek();
    const report = ReportsEngine.weekly({
      ...base,
      profile: { weightKg: 74, goalWeightKg: 74, startWeightKg: 61 },
      history: { ...base.history, weights: [{ date: DAYS[0], kg: 73.8 }, { date: DAYS[6], kg: 74.2 }] },
    });

    expect(has(report.achievements, ACHIEVEMENT.GOAL_REACHED)).toBeTruthy();
  });

  it('flags a meal plan over budget and offers to rebuild it', () => {
    const base = goodWeek();
    const report = ReportsEngine.weekly({
      ...base,
      planned: {
        ...base.planned,
        mealWeek: { ...base.planned.mealWeek, weeklyCostMad: 700, budgetMadPerWeek: 525, withinBudget: false },
      },
    });

    expect(has(report.warnings, WARNING.BUDGET_EXCEEDED)).toBeTruthy();
    expect(typesOf(report.recommendations).includes('rebuild-meals')).toBeTruthy();
  });
});

/* ── Bad data ───────────────────────────────────────────────────────────── */

describe('Reports engine — incomplete and corrupt records', () => {
  const report = ReportsEngine.weekly({
    weekStart: WEEK,
    history: {
      runs: [
        { date: 'yesterday', distanceKm: 5, durationMin: 30 },
        { date: DAYS[1], distanceKm: null, durationMin: 30 },
        { date: DAYS[2], distanceKm: 6, durationMin: 33 },
      ],
      nutrition: [{ date: DAYS[1], calories: 2000 }, { calories: 1000 }],
      weights: [{ date: DAYS[1], kg: 'heavy' }],
      sessions: [{ date: DAYS[8 - 8], state: 'completed', completionPercent: 100 }],
    },
  });

  it('drops what it cannot read and counts every drop', () => {
    expect(report.quality.dropped).toBe(4);
    expect(report.quality.droppedBy.runs).toBe(2);
    expect(report.quality.droppedBy.nutrition).toBe(1);
    expect(report.quality.droppedBy.weights).toBe(1);
  });

  it('keeps the rows that are readable', () => {
    expect(report.running.runs).toBe(1);
    expect(report.running.distanceKm).toBe(6);
  });

  it('never lets a bad row become NaN in a figure', () => {
    const numbers = Object.values(report.explanations)
      .map((entry) => entry.value)
      .filter((value) => typeof value === 'number');
    expect(numbers.every((value) => Number.isFinite(value)), 'a NaN reached the report').toBeTruthy();
  });

  it('survives a week that is not a date at all', () => {
    const broken = ReportsEngine.weekly({ weekStart: 'not-a-date', history: { runs: [{ date: DAYS[0], distanceKm: 5, durationMin: 25 }] } });
    expect(broken.range.start).toBeNull();
    expect(broken.quality.unreadableWeek).toBeTruthy();
    expect(has(broken.warnings, WARNING.DATA_MISSING)).toBeTruthy();
  });

  it('ignores rows from outside the week', () => {
    const outside = ReportsEngine.weekly({
      weekStart: WEEK,
      history: { runs: [{ date: '2026-05-30', distanceKm: 10, durationMin: 55 }, { date: '2026-06-09', distanceKm: 10, durationMin: 55 }] },
    });
    expect(outside.running.runs).toBe(0);
    expect(outside.quality.dropped).toBe(0, 'out of range is not corrupt');
  });

  it('reports fibre and sodium as null, because nothing logs them', () => {
    const full = ReportsEngine.weekly(goodWeek());
    expect(full.nutrition.avgFibreG).toBeNull();
    expect(full.nutrition.avgSodiumMg).toBeNull();
    expect(full.explain('nutrition.fibreAndSodium').method).toContain('no fibre or sodium field');
  });
});

/* ── The month ──────────────────────────────────────────────────────────── */

describe('Reports engine — the month', () => {
  const weekStarts = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22'];

  /** The same week, shifted forward — so each week's records fall inside it. */
  function shiftedWeek(start, index) {
    const offset = (new Date(`${start}T00:00:00Z`).getTime() - new Date(`${WEEK}T00:00:00Z`).getTime()) / 86400000;
    const move = (date) => new Date(new Date(`${date}T00:00:00Z`).getTime() + offset * 86400000)
      .toISOString().slice(0, 10);
    const base = goodWeek();

    const shift = (rows) => rows.map((row) => ({ ...row, date: move(row.date) }));

    return ReportsEngine.weekly({
      ...base,
      weekStart: start,
      weekNumber: 12 + index,
      generatedAt: '2026-07-01T00:00:00.000Z',
      planned: {
        ...base.planned,
        mealWeek: { ...base.planned.mealWeek, days: shift(base.planned.mealWeek.days) },
      },
      history: {
        ...base.history,
        sessions: shift(base.history.sessions),
        sets: shift(base.history.sets),
        runs: shift(base.history.runs),
        nutrition: shift(base.history.nutrition),
        weights: [
          { date: start, kg: 72 + index * 0.3 },
          { date: move(DAYS[6]), kg: 72 + index * 0.3 },
        ],
      },
    });
  }

  const weeks = weekStarts.map(shiftedWeek);

  const month = ReportsEngine.monthly({ month: '2026-06', weeklyReports: weeks, generatedAt: '2026-07-01T00:00:00.000Z' });

  it('carries every section phase 16 asks for', () => {
    for (const key of [
      'month', 'weeklyReports', 'totals', 'weightTrend', 'strengthTrend',
      'runningTrend', 'nutritionTrend', 'recoveryTrend', 'consistency',
      'personalRecords', 'summary', 'reasons',
    ]) {
      expect(month[key] !== undefined, `the month has no "${key}"`).toBeTruthy();
    }
  });

  it('totals the weeks rather than the raw records', () => {
    expect(month.totals.weeks).toBe(4);
    expect(month.totals.volumeKg).toBe(4 * 5200);
    expect(month.totals.distanceKm).toBe(80);
    expect(month.totals.sessions).toBe(16);
  });

  it('fits a weight trend across the weeks', () => {
    expect(month.weightTrend.weeks).toBe(4);
    expect(month.weightTrend.perWeek).toBeCloseTo(0.3, 1);
  });

  it('refuses to fit a trend from too few weeks, and says why', () => {
    const short = ReportsEngine.monthly({ month: '2026-06', weeklyReports: weeks.slice(0, 2) });
    expect(short.weightTrend.perWeek).toBeNull();
    expect(short.weightTrend.note).toContain(`${REPORTS.MIN_WEEKS_FOR_TREND} weeks`);
  });

  it('measures consistency against the weeks it could score', () => {
    expect(month.consistency.weeksMeasured).toBe(4);
    expect(month.consistency.percent).toBe(100);
    expect(month.consistency.averageAdherence).toBe(100);
  });

  it('reports an empty month as empty, not as zeros everywhere', () => {
    const empty = ReportsEngine.monthly({ month: '2026-09', weeklyReports: weeks });
    expect(empty.totals.weeks).toBe(0);
    expect(empty.weightTrend.perWeek).toBeNull();
    expect(empty.consistency.percent).toBeNull();
    expect(empty.reasons.some((reason) => reason.ruleId === 'month.empty')).toBeTruthy();
  });

  it('takes only the weeks inside the month it was asked for', () => {
    const july = ReportsEngine.weekly({ ...goodWeek(), weekStart: '2026-07-06' });
    const june = ReportsEngine.monthly({ month: '2026-06', weeklyReports: [...weeks, july] });
    expect(june.totals.weeks).toBe(4);
  });

  it('lists records the weeks already granted, without re-detecting them', () => {
    const withRecord = ReportsEngine.weekly({
      ...goodWeek(),
      history: {
        ...goodWeek().history,
        sessions: [{ date: DAYS[0], state: 'completed', completionPercent: 100, fatigue: 5, records: [{ type: 'load', exerciseId: 'bench', value: 100, unit: 'kg' }] }],
      },
    });
    const withRecords = ReportsEngine.monthly({ month: '2026-06', weeklyReports: [withRecord] });
    expect(withRecords.personalRecords.length).toBeGreaterThan(0);
    expect(withRecords.personalRecords[0].sourceEngine).toBe('execution-engine');
  });

  it('groups weeks by month without building anything', () => {
    const months = ReportsEngine.months(weeks);
    expect(months.get('2026-06').length).toBe(4);
  });
});

/* ── The architecture of the thing ──────────────────────────────────────── */

describe('Reports engine — what it is not allowed to be', () => {
  const report = ReportsEngine.weekly(goodWeek());

  it('holds no display logic — data only', () => {
    const serialised = JSON.stringify(report);
    for (const marker of ['<div', '</', 'className', 'style=', '#'.concat('fff')]) {
      expect(serialised.includes(marker), `the report carries markup: ${marker}`).toBeFalsy();
    }
  });

  it('survives being serialised and read back, because it is only data', () => {
    const round = JSON.parse(JSON.stringify(report));
    expect(round.gym.volumeKg).toBe(report.gym.volumeKg);
    expect(round.adherence.overall).toBe(report.adherence.overall);
  });

  it('declares a rule set for achievements, warnings and recommendations', () => {
    expect(REPORT_RULE_SETS.achievement.length).toBeGreaterThan(0);
    expect(REPORT_RULE_SETS.warning.length).toBeGreaterThan(0);
    expect(REPORT_RULE_SETS.recommend.length).toBeGreaterThan(0);
  });

  it('gives every rule an id, a name, a scope and a condition', () => {
    for (const rule of allReportRules()) {
      expect(Boolean(rule.id && rule.name && rule.scope), `${rule.id} is incomplete`).toBeTruthy();
      expect(typeof rule.when).toBe('function');
      expect(typeof rule.apply).toBe('function');
    }
  });

  it('keeps every rule id unique', () => {
    const ids = allReportRules().map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records which rules fired', () => {
    expect(report.meta.rulesApplied.length).toBeGreaterThan(0);
    expect(report.meta.engineId).toBe('reports-engine');
  });

  it('builds a context that windows the week without measuring anything', () => {
    const context = createWeeklyReportContext(goodWeek());
    expect(context.weekStart).toBe(WEEK);
    expect(context.weekEnd).toBe('2026-06-07');
    expect(context.runs.length).toBe(2);
    expect(context.quality.daysLogged).toBe(7);
    expect(context.runsToDate.length).toBe(2);
  });

  it('snaps any day of the week back to its Monday', () => {
    const context = createWeeklyReportContext({ weekStart: '2026-06-04' });
    expect(context.weekStart).toBe(WEEK);
  });

  it('reads the safe load band from the constants, not from a literal', () => {
    expect(report.explain('running.trainingLoad').note).toContain(RUNNING_LOAD.SAFE_RATIO.join('–'));
  });
});
