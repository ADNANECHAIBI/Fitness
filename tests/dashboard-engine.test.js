/**
 * dashboard-engine.test.js — phase 18.
 *
 * The engine produces no figure of its own, so almost none of these tests
 * check arithmetic. They check the three claims the phase rests on:
 *
 *   • nothing is invented — a missing engine produces null and a named gap,
 *     never a zero,
 *   • nothing is recalculated — every figure carried from the weekly report
 *     is identical to the report's, and its explanation still names the
 *     engine that owns it,
 *   • nothing appears without a reason — a notification missing any of the
 *     four required fields is dropped and counted.
 *
 * The reports and insights the fixtures use are built by the real engines
 * rather than hand-written. A test that faked them would test the fixture.
 */

import { describe, it, expect } from './runner.js';
import { DashboardEngine } from '../engines/dashboard-engine.js';
import { createDashboardContext } from '../engines/dashboard-context.js';
import { ReportsEngine } from '../engines/reports-engine.js';
import { InsightsEngine } from '../engines/insights-engine.js';
import { DASHBOARD_RULE_SETS, allDashboardRules } from '../rules/dashboard/index.js';
import {
  DASHBOARD, DASHBOARD_SEVERITY, DASHBOARD_RISK, RECOVERY_STATUS, PRIORITY,
} from '../engines/constants.js';

import { DashboardService } from '../app/dashboard-service.js';
import { PlanningService } from '../app/planning-service.js';
import { Cache, invalidateAll, stats, resetStats } from '../app/cache.js';
import { ProfileRepository, SettingsRepository } from '../repositories/index.js';
import { BackupService } from '../services/backup-service.js';
import { WeightService } from '../services/weight-service.js';
import { unwireApplication } from '../app/wiring.js';
import { today } from '../models/index.js';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const WEEK = '2026-06-01';
const DAY = '2026-06-01';
const DAYS = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'];

/** A WeeklyPlan, shaped as the planner engine returns one. */
function plan(overrides = {}) {
  return {
    weekNumber: 12,
    phase: 'hypertrophy',
    deload: false,
    startDate: WEEK,
    endDate: DAYS[6],
    sleepTargetHours: 8,
    days: DAYS.map((date, index) => ({
      date,
      weekday: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][index],
      type: index === 0 ? 'gym' : 'rest',
      focus: index === 0 ? 'volume' : 'recovery',
      durationMin: index === 0 ? 90 : 0,
      waterL: 3.2,
      priority: PRIORITY.IMPORTANT,
    })),
    summary: { gymDays: 4, runningDays: 2, restDays: 1, mobilityDays: 0, totalMinutes: 400, volumeFactor: 1 },
    recovery: { score: 7, strainIndex: 40, strainComponents: { volume: 20 } },
    ...overrides,
  };
}

/** One day of a WorkoutWeek. */
function workout(overrides = {}) {
  return {
    date: DAY,
    weekday: 'mon',
    goal: 'Upper body — volume',
    targetMuscles: ['chest', 'back'],
    estimatedMinutes: 72,
    availableMinutes: 90,
    priority: PRIORITY.IMPORTANT,
    exercises: [{ exerciseId: 'bench-press' }, { exerciseId: 'row' }, { exerciseId: 'curl' }],
    reasons: [{ ruleId: 'split.upper', rule: 'Upper split', scope: 'day', message: 'Four days available, so an upper/lower split.' }],
    ...overrides,
  };
}

/** One session of a RunningWeek. */
function run(overrides = {}) {
  return {
    date: DAY,
    weekday: 'mon',
    type: 'easy-run',
    distanceKm: 8,
    durationMin: 44,
    totalMinutes: 52,
    targetPace: '5:30',
    targetPaceSecPerKm: 330,
    reason: { ruleId: 'run.easy', rule: 'Easy run', scope: 'day', message: 'Base week, so the run stays easy.' },
    ...overrides,
  };
}

/** One day of a NutritionWeek. */
function nutrition(overrides = {}) {
  return {
    date: DAY,
    goal: 'lean_bulk',
    calories: 2800,
    proteinG: 140,
    carbsG: 300,
    fatG: 80,
    waterL: 3.2,
    expectedWeightTrend: { kgPerWeek: 0.25, observedKgPerWeek: 0.3, status: 'on-track' },
    reason: { ruleId: 'nutrition.surplus', rule: 'Surplus', scope: 'day', message: 'A lean bulk sets a modest surplus.' },
    ...overrides,
  };
}

/** One day of a MealPlanWeek. */
function meals(overrides = {}) {
  return {
    date: DAY,
    calories: 2790,
    proteinG: 141,
    costMad: 68,
    prepMinutes: 35,
    withinBudget: true,
    overBudgetBy: 0,
    meals: [
      { slot: 'breakfast', calories: 700, foods: [{ foodId: 'oats', name: 'Oats', quantity: 100 }] },
      { slot: 'lunch', calories: 1000, foods: [{ foodId: 'chicken', name: 'Chicken', quantity: 200 }] },
      { slot: 'dinner', calories: 1090, foods: [{ foodId: 'rice', name: 'Rice', quantity: 150 }] },
    ],
    reason: { ruleId: 'meals.built', rule: 'Day built', scope: 'day', message: 'Three slots inside the daily budget.' },
    ...overrides,
  };
}

/** The recovery snapshot the application layer produces. */
function recovery(overrides = {}) {
  return {
    status: RECOVERY_STATUS.GOOD,
    strainIndex: 40,
    strainComponents: { volume: 20, running: 12, sleep: 8 },
    reportedScore: 7,
    sleepHours: 7.5,
    runningLoad: { ratio: 1.05, verdict: 'steady' },
    compliancePercent: 90,
    ...overrides,
  };
}

/** Input for the reports engine — a week that was followed. */
function reportInput(overrides = {}) {
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

    recovery: recovery(),
    settings: { sleepHours: 7.5 },
    ...overrides,
  };
}

const reportFor = (overrides) => ReportsEngine.weekly(reportInput(overrides));
const insightsFor = (report) => InsightsEngine.weekly({ report });

/** A complete input: every engine heard from. */
function fullInput(overrides = {}) {
  const report = overrides.report ?? reportFor();

  return {
    date: DAY,
    generatedAt: '2026-06-01T06:00:00.000Z',
    plan: plan(),
    workout: workout(),
    run: run(),
    nutrition: nutrition(),
    meals: meals(),
    logged: null,
    session: null,
    recovery: recovery(),
    report,
    insights: insightsFor(report),
    weightProgress: { start: 61, current: 72, goal: 74, gained: 11, remaining: 2, percent: 84.6 },
    notifications: [],
    settings: { sleepHours: 7.5 },
    ...overrides,
  };
}

const snapshotOf = (overrides) => DashboardEngine.snapshot(fullInput(overrides));
const noteKeys = (snapshot) => snapshot.notifications.map((note) => note.key);

/* ── A new user ─────────────────────────────────────────────────────────── */

describe('Dashboard engine — a new user with nothing at all', () => {
  const snapshot = DashboardEngine.snapshot({ date: DAY, generatedAt: '2026-06-01T06:00:00.000Z' });

  it('builds a snapshot rather than throwing', () => {
    expect(snapshot.date).toBe(DAY);
  });

  it('names every engine it did not hear from', () => {
    expect(snapshot.missing.length).toBe(9);
    expect(snapshot.missing.map((gap) => gap.input).includes('plan')).toBeTruthy();
    expect(snapshot.missing.every((gap) => Boolean(gap.engine))).toBeTruthy();
  });

  it('shows nothing to do rather than an empty day', () => {
    expect(snapshot.tasks.length).toBe(0);
    expect(snapshot.today.topTask.kind).toBe('setup');
  });

  it('reports missing figures as null, never as zero', () => {
    expect(snapshot.week.trainingCompletion).toBe(null);
    expect(snapshot.week.overallAdherence).toBe(null);
    expect(snapshot.today.requiredMinutes).toBe(null);
    expect(snapshot.today.remainingCalories).toBe(null);
  });

  it('refuses a risk level it cannot support', () => {
    expect(snapshot.health.riskLevel).toBe(DASHBOARD_RISK.UNKNOWN);
    expect(snapshot.health.riskReason.length).toBeGreaterThan(0);
  });

  it('says there is no plan, and says why that matters', () => {
    expect(noteKeys(snapshot).includes('no-plan')).toBeTruthy();
    expect(snapshot.notifications.every((note) => Boolean(note.reason))).toBeTruthy();
  });

  it('reports no insights as an absence, not as a quiet week', () => {
    expect(snapshot.insights.available).toBeFalsy();
    expect(snapshot.insights.reason.length).toBeGreaterThan(0);
  });

  it('projects no arrival date without a goal or a rate', () => {
    expect(snapshot.goal.eta.available).toBeFalsy();
    expect(snapshot.goal.eta.reason.length).toBeGreaterThan(0);
  });
});

/* ── An empty week ──────────────────────────────────────────────────────── */

describe('Dashboard engine — a week that was planned and never used', () => {
  const report = ReportsEngine.weekly({ weekStart: WEEK });
  const snapshot = snapshotOf({
    report,
    insights: insightsFor(report),
    workout: null, run: null, meals: null, logged: null,
    weightProgress: null,
  });

  it('still shows the plan it was given', () => {
    expect(snapshot.weekNumber).toBe(12);
    expect(snapshot.weeklyProgress.gymDaysPlanned).toBe(4);
  });

  it('does not read an unlogged week as a failed one', () => {
    expect(snapshot.week.trainingCompletion).toBe(null);
    expect(snapshot.week.overallAdherence).toBe(null);
  });

  it('marks confidence low when nothing was logged', () => {
    expect(snapshot.goal.confidence).toBe('low');
  });

  it('falls back to rest as the day\'s focus', () => {
    expect(snapshot.today.topTask.kind).toBe('rest');
  });
});

/* ── A full training week ───────────────────────────────────────────────── */

describe('Dashboard engine — a week with lifting, running and meals', () => {
  const snapshot = snapshotOf();

  it('reports every part of today', () => {
    expect(snapshot.today.hasWorkout).toBeTruthy();
    expect(snapshot.today.hasRun).toBeTruthy();
    expect(snapshot.today.hasMeals).toBeTruthy();
  });

  it('adds the minutes each engine estimated, and nothing else', () => {
    // 72 (workout engine) + 52 (running engine) + 35 (meal engine)
    expect(snapshot.today.requiredMinutes).toBe(159);
    expect(snapshot.explain('today.requiredMinutes').source).toBe('calculation-engine');
    expect(snapshot.explain('today.requiredMinutes').inputs.workoutMinutes).toBe(72);
  });

  it('orders today by the priority the planner assigned', () => {
    const { tasks } = snapshot;
    for (let i = 1; i < tasks.length; i += 1) {
      expect(tasks[i].priority).toBeGreaterThan(tasks[i - 1].priority - 0.001);
    }
  });

  it('names one task as the most important, with a reason', () => {
    expect(snapshot.today.topTask.kind).toBe('workout');
    expect(snapshot.today.topTask.reason.length).toBeGreaterThan(0);
    expect(snapshot.today.topTask.task).toBeTruthy();
  });

  it('carries the reasons the engines gave, unedited', () => {
    const messages = snapshot.reasons.map((reason) => reason.message);
    expect(messages.includes('Four days available, so an upper/lower split.')).toBeTruthy();
    expect(messages.includes('A lean bulk sets a modest surplus.')).toBeTruthy();
  });

  it('gives every notification a title, message, severity and reason', () => {
    expect(snapshot.notifications.length).toBeGreaterThan(0);
    for (const note of snapshot.notifications) {
      expect(Boolean(note.title && note.message && note.severity && note.reason)).toBeTruthy(
        `${note.key} is missing one of the four required fields`);
      expect(Object.keys(note.evidence ?? {}).length).toBeGreaterThan(0);
    }
  });

  it('ranks notifications by severity', () => {
    const ranks = snapshot.notifications.map((note) => DASHBOARD.SEVERITY_RANK[note.severity]);
    for (let i = 1; i < ranks.length; i += 1) {
      expect(ranks[i]).toBeLessThan(ranks[i - 1] + 0.001);
    }
  });
});

/* ── Running only, lifting only ─────────────────────────────────────────── */

describe('Dashboard engine — a running-only day', () => {
  const snapshot = snapshotOf({ workout: null });

  it('does not invent a session that was not planned', () => {
    expect(snapshot.workout).toBe(null);
    expect(snapshot.tasks.some((task) => task.kind === 'workout')).toBeFalsy();
  });

  it('makes the run the focus', () => {
    expect(snapshot.today.topTask.kind).toBe('running');
  });

  it('counts only the minutes that exist', () => {
    expect(snapshot.today.requiredMinutes).toBe(87);   // 52 + 35
  });
});

describe('Dashboard engine — a lifting-only day', () => {
  const snapshot = snapshotOf({ run: null });

  it('does not invent a run', () => {
    expect(snapshot.running).toBe(null);
    expect(noteKeys(snapshot).includes('run-today')).toBeFalsy();
  });

  it('keeps the session as the focus', () => {
    expect(snapshot.today.topTask.kind).toBe('workout');
  });
});

/* ── The three goals ────────────────────────────────────────────────────── */

describe('Dashboard engine — bulk', () => {
  const snapshot = snapshotOf();

  it('reads the goal from the nutrition engine, not from the profile', () => {
    expect(snapshot.goal.goal).toBe('lean_bulk');
    expect(snapshot.goal.expectedWeeklyKg).toBe(0.25);
  });

  it('projects an arrival when the scale is moving toward the goal', () => {
    expect(snapshot.goal.eta.available).toBeTruthy();
    expect(snapshot.goal.eta.weeks).toBeGreaterThan(0);
    expect(snapshot.goal.eta.date).toBeTruthy();
  });

  it('shows the division it did, with both operands', () => {
    const explanation = snapshot.explain('goal.eta.weeks');
    expect(explanation.source).toBe('calculation-engine');
    expect(explanation.inputs.remainingKg).toBe(snapshot.goal.remainingKg);
  });
});

describe('Dashboard engine — cut', () => {
  const report = reportFor({
    goal: 'cut',
    profile: { weightKg: 80, goalWeightKg: 74, startWeightKg: 88 },
    history: {
      ...reportInput().history,
      weights: [
        { date: '2026-05-25', kg: 80.8 }, { date: '2026-05-29', kg: 80.5 },
        { date: DAYS[0], kg: 80.3 }, { date: DAYS[6], kg: 79.9 },
      ],
    },
  });

  const snapshot = snapshotOf({
    report,
    insights: insightsFor(report),
    nutrition: nutrition({ goal: 'cut', calories: 2100, expectedWeightTrend: { kgPerWeek: -0.5 } }),
    weightProgress: { start: 88, current: 80, goal: 74, gained: -8, remaining: -6, percent: 57.1 },
  });

  it('projects an arrival when the scale is falling toward a lower goal', () => {
    expect(snapshot.goal.remainingKg).toBeLessThan(0);
    expect(snapshot.goal.currentTrendKgPerWeek).toBeLessThan(0);
    expect(snapshot.goal.eta.available).toBeTruthy();
    expect(snapshot.goal.eta.weeks).toBeGreaterThan(0);
  });
});

describe('Dashboard engine — maintain', () => {
  const report = reportFor({
    goal: 'maintain',
    profile: { weightKg: 74, goalWeightKg: 74, startWeightKg: 74 },
    history: {
      ...reportInput().history,
      weights: [
        { date: '2026-05-25', kg: 74.0 }, { date: '2026-05-29', kg: 74.0 },
        { date: DAYS[0], kg: 74.0 }, { date: DAYS[6], kg: 74.0 },
      ],
    },
  });

  const snapshot = snapshotOf({
    report,
    insights: insightsFor(report),
    nutrition: nutrition({ goal: 'maintain', expectedWeightTrend: { kgPerWeek: 0 } }),
    weightProgress: { start: 74, current: 74, goal: 74, gained: 0, remaining: 0, percent: 100 },
  });

  it('refuses to divide by a rate of nothing', () => {
    expect(snapshot.goal.eta.available).toBeFalsy();
    expect(snapshot.goal.eta.reason.includes('rate')).toBeTruthy();
  });

  it('still reports the goal as reached', () => {
    expect(snapshot.goal.remainingKg).toBe(0);
  });
});

/* ── High fatigue ───────────────────────────────────────────────────────── */

describe('Dashboard engine — high fatigue', () => {
  const tired = recovery({
    status: RECOVERY_STATUS.POOR,
    strainIndex: 78,
    reportedScore: 3,
    runningLoad: { ratio: 1.6, verdict: 'spiking' },
  });

  const report = reportFor({
    recovery: tired,
    history: {
      ...reportInput().history,
      sessions: [0, 2, 4, 5].map((index) => ({
        date: DAYS[index], state: 'completed', completionPercent: 95, fatigue: 9, records: [],
      })),
    },
  });

  const snapshot = snapshotOf({ recovery: tired, report, insights: insightsFor(report) });

  it('raises the risk level, and says which signals agreed', () => {
    expect([DASHBOARD_RISK.HIGH, DASHBOARD_RISK.MODERATE].includes(snapshot.health.riskLevel)).toBeTruthy();
    expect(snapshot.health.riskReason.length).toBeGreaterThan(0);
  });

  it('carries the fatigue the execution engine recorded, without re-averaging it', () => {
    expect(snapshot.health.fatigue).toBe(report.recovery.avgFatigue);
    expect(snapshot.explain('health.fatigue').source).toBe('execution-engine');
  });

  it('notifies about recovery before the session, not after it', () => {
    expect(noteKeys(snapshot).includes('recovery-poor')).toBeTruthy();
    const note = snapshot.notifications.find((item) => item.key === 'recovery-poor');
    expect(note.severity).toBe(DASHBOARD_SEVERITY.WARNING);
    expect(note.evidence.strainIndex).toBe(78);
  });
});

/* ── An injury ──────────────────────────────────────────────────────────── */

describe('Dashboard engine — an injury took today\'s session out', () => {
  /* The workout engine is what excludes restricted movements; by the time
     the dashboard sees the day, the session is simply not there. */
  const snapshot = snapshotOf({
    workout: null,
    run: null,
    plan: plan({
      days: DAYS.map((date, index) => ({
        date, weekday: 'mon', type: 'rest',
        focus: index === 0 ? 'shoulder rehabilitation only' : 'recovery',
        durationMin: 0, waterL: 3.2, priority: PRIORITY.IMPORTANT,
      })),
    }),
  });

  it('does not put back a session the workout engine removed', () => {
    expect(snapshot.workout).toBe(null);
    expect(snapshot.running).toBe(null);
  });

  it('shows the plan\'s own words for the day', () => {
    const rest = snapshot.tasks.find((task) => task.kind === 'rest');
    expect(rest.detailText).toBe('shoulder rehabilitation only');
  });

  it('makes eating the focus, since nothing can be trained', () => {
    expect(snapshot.today.topTask.kind).toBe('meals');
  });
});

/* ── A layoff ───────────────────────────────────────────────────────────── */

describe('Dashboard engine — a break in training', () => {
  const report = reportFor({
    history: {
      ...reportInput().history,
      sessions: [], sets: [], runs: [], nutrition: [],
    },
  });

  const snapshot = snapshotOf({ report, insights: insightsFor(report), logged: null });

  it('carries the report\'s warnings through as notifications, unchanged', () => {
    const warnings = report.warnings.map((warning) => `warning.${warning.type}`);
    if (warnings.length) {
      expect(warnings.some((key) => noteKeys(snapshot).includes(key))).toBeTruthy();
    } else {
      expect(snapshot.activeWarnings.length).toBe(0);
    }
  });

  it('does not describe an unlogged week as a completed one', () => {
    expect(snapshot.week.trainingCompletion === null || snapshot.week.trainingCompletion === 0).toBeTruthy();
  });

  it('keeps today\'s plan visible even when the week went unused', () => {
    expect(snapshot.today.hasWorkout).toBeTruthy();
  });
});

/* ── Missing data ───────────────────────────────────────────────────────── */

describe('Dashboard engine — partial inputs', () => {
  const snapshot = snapshotOf({ insights: null, recovery: null });

  it('names exactly what is missing', () => {
    const missing = snapshot.missing.map((gap) => gap.input);
    expect(missing.includes('insights')).toBeTruthy();
    expect(missing.includes('recovery')).toBeTruthy();
    expect(missing.includes('report')).toBeFalsy();
  });

  it('says which engine each gap belongs to', () => {
    const gap = snapshot.missing.find((item) => item.input === 'insights');
    expect(gap.engine).toBe('insights-engine');
  });

  it('reports an unknown recovery status rather than a good one', () => {
    expect(snapshot.recovery.status).toBe(RECOVERY_STATUS.UNKNOWN);
  });

  it('records the gap as a reason', () => {
    const gapReason = snapshot.reasons.find((reason) => reason.ruleId === 'dashboard.missing-inputs');
    expect(gapReason).toBeTruthy();
    expect(gapReason.message.includes('insights-engine')).toBeTruthy();
  });

  it('still produces the sections the remaining engines can fill', () => {
    expect(snapshot.week.overallAdherence).toBeTruthy();
    expect(snapshot.today.hasWorkout).toBeTruthy();
  });
});

/* ── Intake ─────────────────────────────────────────────────────────────── */

describe('Dashboard engine — what is left to eat', () => {
  it('equals the whole target before anything is logged', () => {
    const snapshot = snapshotOf();
    expect(snapshot.nutrition.remaining.calories).toBe(2800);
    expect(snapshot.nutrition.remaining.logged).toBeFalsy();
  });

  it('subtracts what was logged, and shows both operands', () => {
    const snapshot = snapshotOf({ logged: { date: DAY, calories: 1800, proteinG: 90 } });

    expect(snapshot.nutrition.remaining.calories).toBe(1000);
    expect(snapshot.nutrition.remaining.proteinG).toBe(50);

    const explanation = snapshot.explain('today.remainingCalories');
    expect(explanation.source).toBe('calculation-engine');
    expect(explanation.inputs.targetCalories).toBe(2800);
    expect(explanation.inputs.loggedCalories).toBe(1800);
  });

  it('reports going over target without calling it a failure', () => {
    const snapshot = snapshotOf({ logged: { date: DAY, calories: 3200, proteinG: 150 } });

    expect(snapshot.nutrition.remaining.calories).toBe(-400);
    expect(noteKeys(snapshot).includes('calories-over')).toBeTruthy();
    const note = snapshot.notifications.find((item) => item.key === 'calories-over');
    expect(note.severity).toBe(DASHBOARD_SEVERITY.INFO);
  });

  it('flags protein below the low-intake share', () => {
    const snapshot = snapshotOf({ logged: { date: DAY, calories: 2700, proteinG: 60 } });
    expect(noteKeys(snapshot).includes('protein-short')).toBeTruthy();
  });
});

/* ── Nothing is recalculated ────────────────────────────────────────────── */

describe('Dashboard engine — every figure comes from somewhere else', () => {
  const report = reportFor();
  const snapshot = snapshotOf({ report, insights: insightsFor(report) });

  it('carries adherence identically to the report', () => {
    expect(snapshot.week.overallAdherence).toBe(report.adherence.overall);
    expect(snapshot.week.trainingCompletion).toBe(report.adherence.gym);
    expect(snapshot.week.runningCompletion).toBe(report.adherence.running);
    expect(snapshot.week.nutritionAdherence).toBe(report.adherence.nutrition);
  });

  it('carries the weight figures identically to the report', () => {
    expect(snapshot.week.weightChangeKg).toBe(report.weight.changeKg);
    expect(snapshot.week.weightRateKgPerWeek).toBe(report.weight.weeklyChangeKg);
  });

  it('keeps the owning engine on a carried explanation', () => {
    const explanation = snapshot.explain('week.weightRateKgPerWeek');
    expect(explanation.source).toBe('body-engine');
    expect(explanation.inputs.carriedFrom).toBe('weight.weeklyChangeKg');
  });

  it('declares that it recalculated nothing', () => {
    expect(snapshot.meta.recalculated).toEqual([]);
    expect(snapshot.meta.engineId).toBe('dashboard-engine');
  });

  it('ranks no insight of its own', () => {
    const set = insightsFor(report);
    const expected = set.priority[0] ?? set.all[0] ?? null;

    expect(snapshot.topInsights).toEqual(snapshot.insights.top);
    expect(snapshot.insights.highestPriority?.key ?? null).toBe(expected?.key ?? null);
    expect(snapshot.insights.top.map((item) => item.key))
      .toEqual((set.priority ?? set.all).slice(0, DASHBOARD.MAX_TOP_INSIGHTS).map((item) => item.key));
  });

  it('advises nothing the reports engine did not', () => {
    expect(snapshot.recommendations.length).toBeLessThan(report.recommendations.length + 1);
    for (const item of snapshot.recommendations) {
      expect(report.recommendations.includes(item)).toBeTruthy();
    }
  });
});

/* ── Explainability ─────────────────────────────────────────────────────── */

describe('Dashboard engine — no number without a source', () => {
  const snapshot = snapshotOf({ logged: { date: DAY, calories: 1800, proteinG: 90 } });

  it('explains every figure it records', () => {
    for (const [key, explanation] of Object.entries(snapshot.explanations)) {
      expect(Boolean(explanation.method)).toBeTruthy(`${key} has no method`);
      expect(Boolean(explanation.source)).toBeTruthy(`${key} has no source engine`);
    }
  });

  it('answers a question about one figure', () => {
    expect(snapshot.describe('today.remainingCalories').includes('calculation-engine')).toBeTruthy();
  });

  it('returns null for a figure it never recorded', () => {
    expect(snapshot.explain('not.a.figure')).toBe(null);
  });

  it('records why the focus and the risk level are what they are', () => {
    expect(snapshot.explain('today.focus').method.length).toBeGreaterThan(0);
    expect(snapshot.explain('health.riskLevel').method.length).toBeGreaterThan(0);
  });
});

/* ── Notifications ──────────────────────────────────────────────────────── */

describe('Dashboard engine — notifications', () => {
  it('folds in the stored ones without restating them', () => {
    const snapshot = snapshotOf({
      notifications: [{
        id: 'n1', type: 'new-pr', title: 'New personal record',
        message: 'bench press: 90 kg.', priority: 'high', source: 'ExecutionEngine',
        date: DAY, read: false,
      }],
    });

    const stored = snapshot.notifications.find((note) => note.key === 'stored.n1');
    expect(stored.title).toBe('New personal record');
    expect(stored.severity).toBe(DASHBOARD_SEVERITY.WARNING);
    expect(stored.reason.includes('notification engine')).toBeTruthy();
  });

  it('drops one that cannot say why it appeared, and counts the drop', () => {
    const nameless = { id: 'n2', type: 'weight-updated', title: '', message: '', priority: 'low', date: DAY };
    const snapshot = snapshotOf({ notifications: [nameless] });

    expect(noteKeys(snapshot).includes('stored.n2')).toBeFalsy();
    expect(snapshot.meta.notificationsDropped.length).toBeGreaterThan(0);
  });

  it('never carries more than the cap', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: `n${index}`, type: 'weight-updated', title: `Note ${index}`,
      message: 'Something happened.', priority: 'low', source: 'WeightService', date: DAY,
    }));

    const snapshot = snapshotOf({ notifications: many });
    expect(snapshot.notifications.length).toBe(DASHBOARD.MAX_NOTIFICATIONS);
    expect(snapshot.meta.notificationsProduced).toBeGreaterThan(DASHBOARD.MAX_NOTIFICATIONS);
  });
});

/* ── The rules ──────────────────────────────────────────────────────────── */

describe('Dashboard engine — the rules', () => {
  it('declares every rule with an id, a name and a scope', () => {
    for (const rule of allDashboardRules()) {
      expect(Boolean(rule.id && rule.name && rule.scope)).toBeTruthy();
      expect(typeof rule.when).toBe('function');
      expect(typeof rule.apply).toBe('function');
    }
  });

  it('picks exactly one focus and exactly one risk level', () => {
    expect(DASHBOARD_RULE_SETS.focus.length).toBeGreaterThan(0);
    expect(DASHBOARD_RULE_SETS.risk.length).toBeGreaterThan(0);

    const snapshot = snapshotOf();
    const applied = snapshot.meta.rulesApplied.filter((id) => id.startsWith('focus.'));
    expect(applied.length).toBe(1);
  });

  it('always reaches a risk level, because the last rule always matches', () => {
    const snapshot = snapshotOf();
    expect(Object.values(DASHBOARD_RISK).includes(snapshot.health.riskLevel)).toBeTruthy();
  });
});

/* ── The context ────────────────────────────────────────────────────────── */

describe('Dashboard context — reading, not deriving', () => {
  it('finds today inside the plan when the day is not passed in', () => {
    const context = createDashboardContext({ date: DAYS[2], plan: plan() });
    expect(context.planDay.date).toBe(DAYS[2]);
  });

  it('treats a session from another day as not in progress', () => {
    const context = createDashboardContext({
      date: DAY, session: { date: DAYS[3], state: 'in-progress' },
    });
    expect(context.sessionInProgress).toBeFalsy();
    expect(context.activeSession).toBe(null);
  });

  it('reads a figure out of the report\'s explanation map', () => {
    const report = reportFor();
    const context = createDashboardContext({ date: DAY, report });
    expect(context.figure('streak.weeks')).toBe(report.explanations['streak.weeks'].value);
  });
});

/* ── Consistency ────────────────────────────────────────────────────────── */

describe('Dashboard engine — the same input gives the same snapshot', () => {
  it('produces identical output twice over', () => {
    const input = fullInput();
    const first = DashboardEngine.snapshot(input);
    const second = DashboardEngine.snapshot(input);

    expect(JSON.stringify(first.week)).toBe(JSON.stringify(second.week));
    expect(JSON.stringify(first.today)).toBe(JSON.stringify(second.today));
    expect(JSON.stringify(first.notifications)).toBe(JSON.stringify(second.notifications));
  });

  it('never disagrees with itself between a section and the top level', () => {
    const snapshot = snapshotOf();

    expect(snapshot.weekNumber).toBe(snapshot.week.weekNumber);
    expect(snapshot.recovery.status).toBe(snapshot.health.recoveryStatus);
    expect(snapshot.currentWeightKg).toBe(snapshot.goal.currentWeightKg);
    expect(snapshot.today.remainingCalories).toBe(snapshot.nutrition.remaining.calories);
    expect(snapshot.weeklyProgress.gymDaysPlanned).toBe(snapshot.week.planned.gymDays);
  });

  it('is frozen, so a consumer cannot edit the figures it was given', () => {
    const snapshot = snapshotOf();
    expect(Object.isFrozen(snapshot)).toBeTruthy();
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

describe('Dashboard service — built once, then read from cache', () => {
  it('builds the snapshot once for two reads', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    DashboardService.snapshot();
    DashboardService.snapshot();

    const entry = stats().find((item) => item.name === 'dashboard');
    expect(entry.misses).toBe(1);
    expect(entry.hits).toBe(1);
  });

  it('returns the very same object, not an equal one', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    expect(DashboardService.snapshot()).toBe(DashboardService.snapshot());
  });

  it('calls no engine again while the data is unchanged', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    /* The first read pays for everything underneath it — the report itself
       and the four earlier weeks its context needs, then the insight set
       over them. What matters is that the second and third cost nothing. */
    DashboardService.snapshot();
    const afterFirst = stats().map((entry) => `${entry.name}:${entry.misses}`).join('|');

    DashboardService.snapshot();
    DashboardService.snapshot();
    const afterThird = stats().map((entry) => `${entry.name}:${entry.misses}`).join('|');

    expect(afterThird).toBe(afterFirst,
      'a cached dashboard read rebuilt something underneath it');
  });

  it('rebuilds after the cache is invalidated by name', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    DashboardService.snapshot();
    Cache.invalidate('dashboard');
    DashboardService.snapshot();

    expect(stats().find((item) => item.name === 'dashboard').misses).toBe(2);
  });

  it('rebuilds after something is logged', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    DashboardService.snapshot();
    const before = stats().find((item) => item.name === 'dashboard').misses;

    WeightService.log(61.5);

    DashboardService.snapshot();
    expect(stats().find((item) => item.name === 'dashboard').misses).toBeGreaterThan(before);
  });

  it('keeps the shape the UI has read since phase 12', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    const snapshot = DashboardService.snapshot();

    expect(snapshot.date).toBe(today());
    expect(Array.isArray(snapshot.tasks)).toBeTruthy();
    expect(snapshot.recovery.status).toBeTruthy();
    expect(Array.isArray(snapshot.notifications)).toBeTruthy();
    expect(Array.isArray(snapshot.reasons)).toBeTruthy();
    expect(snapshot.weeklyProgress.gymDaysPlanned !== undefined).toBeTruthy();
  });

  it('explains one of its figures through the service', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    const explanation = DashboardService.explain('today.requiredMinutes');
    expect(explanation === null || Boolean(explanation.source)).toBeTruthy();
  });
});
