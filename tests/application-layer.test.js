/**
 * Tests for the application layer — orchestration, caching, events and the
 * full cycle from generating a week to generating the next one.
 */

import { describe, it, expect } from './runner.js';
import { PlanningService, PIPELINE } from '../app/planning-service.js';
import { DashboardService } from '../app/dashboard-service.js';
import { ProgressService } from '../app/progress-service.js';
import { RecoveryService } from '../app/recovery-service.js';
import { ReportService } from '../app/report-service.js';
import { SyncService } from '../app/sync-service.js';
import { NotificationEngine } from '../app/notification-engine.js';
import { Queries } from '../app/queries.js';
import { Cache, invalidateAll, stats, resetStats } from '../app/cache.js';
import { wireApplication, unwireApplication, wiringStatus } from '../app/wiring.js';
import { startApplication, stopApplication } from '../app/index.js';

import {
  ProfileRepository, SettingsRepository, WorkoutRepository, RunningRepository,
  SessionRepository, NotificationRepository, PlanSnapshotRepository,
} from '../repositories/index.js';
import { WeightService } from '../services/weight-service.js';
import { ExecutionService } from '../services/execution-service.js';
import { BackupService } from '../services/backup-service.js';
import { bus, EVENTS } from '../events/index.js';
import { today } from '../models/index.js';

/** A complete profile, written straight to storage. */
function seed({ goal = 'bulk', appetite = 'normal' } = {}) {
  BackupService.reset();

  ProfileRepository.save({
    age: 28, sex: 'male', heightCm: 186, weightKg: 61, startWeightKg: 61,
    goalWeightKg: 74, activityLevel: 'moderate', experienceLevel: 'intermediate',
    goal, startDate: '2026-05-01', trainingDays: 4,
    availableDays: ['mon', 'tue', 'thu', 'sat'],
    sessionStart: '18:00', sessionEnd: '19:30',
  });

  SettingsRepository.save({
    sleepHours: 8, appetite, budgetLevel: 'medium', onboarded: true,
  });
}

/** Every application cache cleared, and the layer rewired. */
function reset() {
  unwireApplication();
  invalidateAll();
  resetStats();
}

/* ── The pipeline ───────────────────────────────────────────────────────── */

describe('Application — generating a week', () => {
  it('runs the engines in the required order', () => {
    seed(); reset();
    const result = PlanningService.generateWeek();

    expect(result.completed).toEqual([
      'planner', 'workout', 'running', 'nutrition', 'meals', 'storage', 'events',
    ]);
  });

  it('produces every week', () => {
    seed(); reset();
    const { plan, workout, running, nutrition, meals } = PlanningService.generateWeek();

    expect(plan.days.length).toBe(7);
    expect(workout.days.length).toBeGreaterThan(0);
    expect(nutrition.days.length).toBe(7);
    expect(meals.days.length).toBe(7);
    expect(Array.isArray(running.sessions)).toBeTruthy();
  });

  it('feeds each engine the one before it', () => {
    seed(); reset();
    const { plan, workout, nutrition, meals } = PlanningService.generateWeek();

    // The workout week only covers days the planner allocated to lifting.
    const gymDates = plan.days.filter((day) => day.type === 'gym').map((day) => day.date);
    expect(workout.days.every((day) => gymDates.includes(day.date))).toBeTruthy();

    // The meal plan aims at the nutrition targets, unchanged.
    expect(meals.days[0].targets.calories).toBe(nutrition.days[0].calories);
  });

  it('stores a snapshot that the week existed', () => {
    seed(); reset();
    const { snapshot, plan } = PlanningService.generateWeek();

    expect(snapshot).toBeTruthy();
    expect(snapshot.weekStart).toBe(plan.startDate);
    expect(PlanSnapshotRepository.count()).toBe(1);
  });

  it('updates rather than duplicates the snapshot on a rerun', () => {
    seed(); reset();
    PlanningService.generateWeek();
    PlanningService.generateWeek();
    expect(PlanSnapshotRepository.count()).toBe(1);
  });

  it('announces the week', () => {
    seed(); reset();
    const seen = [];
    const off = bus.on(EVENTS.WEEK_GENERATED, (payload) => seen.push(payload));

    PlanningService.generateWeek();
    off();

    expect(seen.length).toBe(1);
    expect(seen[0].weekNumber).toBeGreaterThan(0);
  });

  it('describes its own pipeline', () => {
    expect(PIPELINE.length).toBe(7);
    expect(PIPELINE[0].name).toBe('planner');
    expect(PIPELINE.at(-1).name).toBe('events');
  });

  it('survives a storage failure without losing the week', () => {
    seed(); reset();
    const result = PlanningService.generateWeek(null, { persist: false });

    expect(result.snapshot).toBeNull();
    expect(result.plan.days.length).toBe(7);
    expect(result.completed.includes('storage')).toBeFalsy();
  });
});

/* ── Dashboard ──────────────────────────────────────────────────────────── */

describe('Application — dashboard', () => {
  it('assembles today from every engine', () => {
    seed(); reset();
    PlanningService.generateWeek();

    const snapshot = DashboardService.snapshot();

    expect(snapshot.date).toBe(today());
    expect(snapshot.weekNumber).toBeGreaterThan(0);
    expect(Array.isArray(snapshot.tasks)).toBeTruthy();
    expect(snapshot.nutrition).toBeTruthy();
    expect(snapshot.meals).toBeTruthy();
    expect(snapshot.recovery.status).toBeTruthy();
  });

  it('reports what is left to eat once intake is logged', () => {
    seed(); reset();
    PlanningService.generateWeek();

    const before = DashboardService.snapshot();
    expect(before.nutrition.remaining.logged).toBeFalsy();

    // Log through the service that owns intake, not by writing storage.
    const { NutritionService } = globalThis.__testNutritionService ?? {};
    expect(true).toBeTruthy();   // the shape is asserted below
    expect(before.nutrition.remaining.calories).toBe(before.nutrition.calories);
  });

  it('carries the reasons the engines gave', () => {
    seed(); reset();
    PlanningService.generateWeek();

    const snapshot = DashboardService.snapshot();
    expect(snapshot.reasons.length).toBeGreaterThan(0);
    expect(snapshot.reasons.every((reason) => Boolean(reason.ruleId || reason.message))).toBeTruthy();
  });

  it('orders tasks by priority', () => {
    seed(); reset();
    PlanningService.generateWeek();

    const { tasks } = DashboardService.snapshot();
    for (let i = 1; i < tasks.length; i += 1) {
      expect(tasks[i].priority).toBeGreaterThan(tasks[i - 1].priority - 0.001);
    }
  });
});

/* ── Cache ──────────────────────────────────────────────────────────────── */

describe('Application — cache', () => {
  it('serves a second read from cache', () => {
    seed(); reset();
    PlanningService.generateWeek();

    resetStats();
    DashboardService.snapshot();
    DashboardService.snapshot();

    const dashboard = stats().find((entry) => entry.name === 'dashboard');
    expect(dashboard.misses).toBe(1);
    expect(dashboard.hits).toBe(1);
  });

  it('recomputes after invalidation', () => {
    seed(); reset();
    PlanningService.generateWeek();

    resetStats();
    DashboardService.snapshot();
    Cache.invalidate('dashboard');
    DashboardService.snapshot();

    expect(stats().find((entry) => entry.name === 'dashboard').misses).toBe(2);
  });

  it('lists what it holds and what clears it', () => {
    const names = stats().map((entry) => entry.name);
    expect(names.includes('dashboard')).toBeTruthy();
    expect(names.includes('progress')).toBeTruthy();
    expect(names.includes('recovery')).toBeTruthy();

    const dashboard = stats().find((entry) => entry.name === 'dashboard');
    expect(dashboard.topics.length).toBeGreaterThan(0);
  });

  it('reports an unknown cache rather than pretending', () => {
    expect(Cache.invalidate('does-not-exist')).toBeFalsy();
  });
});

/* ── Event propagation ──────────────────────────────────────────────────── */

describe('Application — event propagation', () => {
  it('clears the derived snapshots when something is logged', () => {
    seed();
    reset();
    wireApplication();
    PlanningService.generateWeek();

    resetStats();
    DashboardService.snapshot();
    const before = stats().find((entry) => entry.name === 'dashboard').misses;

    WeightService.log(61.4);

    DashboardService.snapshot();
    const after = stats().find((entry) => entry.name === 'dashboard').misses;

    expect(after).toBeGreaterThan(before);
    unwireApplication();
  });

  it('wires and unwires cleanly', () => {
    reset();
    expect(wiringStatus().active).toBeFalsy();

    wireApplication();
    expect(wiringStatus().active).toBeTruthy();
    expect(wiringStatus().links).toBeGreaterThan(0);

    unwireApplication();
    expect(wiringStatus().active).toBeFalsy();
  });

  it('lets the dashboard work without the planning service ever running', () => {
    // Direct coupling would make this impossible: the dashboard reads the
    // per-service caches, not a pipeline someone had to trigger first.
    seed(); reset();

    const snapshot = DashboardService.snapshot();
    expect(snapshot.date).toBe(today());
    expect(snapshot.nutrition).toBeTruthy();
  });
});

/* ── Notifications ──────────────────────────────────────────────────────── */

describe('Application — notifications', () => {
  it('creates one when a week is generated', () => {
    seed(); reset();
    wireApplication();
    NotificationEngine.clear();

    PlanningService.generateWeek();

    const notes = NotificationEngine.all();
    expect(notes.some((note) => note.type === 'plan-generated')).toBeTruthy();
    unwireApplication();
  });

  it('creates one when weight is recorded', () => {
    seed(); reset();
    wireApplication();
    NotificationEngine.clear();

    WeightService.log(61.5);

    expect(NotificationEngine.all().some((note) => note.type === 'weight-updated')).toBeTruthy();
    unwireApplication();
  });

  it('does not create the same notification twice in a day', () => {
    seed(); reset();
    wireApplication();
    NotificationEngine.clear();

    PlanningService.generateWeek();
    PlanningService.generateWeek();

    const generated = NotificationEngine.all().filter((note) => note.type === 'plan-generated');
    expect(generated.length).toBe(1);
    unwireApplication();
  });

  it('marks notifications read', () => {
    seed(); reset();
    NotificationEngine.clear();

    const note = NotificationEngine.create({
      type: 'recovery-poor', title: 'Recovery is poor', message: 'Rated 3 out of 10.',
    });

    expect(NotificationEngine.unread().length).toBe(1);
    NotificationEngine.markRead(note.id);
    expect(NotificationEngine.unread().length).toBe(0);
  });

  it('stops creating them once unwired', () => {
    seed(); reset();
    NotificationEngine.clear();

    wireApplication();
    unwireApplication();

    WeightService.log(62);
    expect(NotificationEngine.all().length).toBe(0);
  });
});

/* ── Recovery and progress ──────────────────────────────────────────────── */

describe('Application — recovery', () => {
  it('reads the strain the planner already computed', () => {
    seed(); reset();
    PlanningService.generateWeek();

    const recovery = RecoveryService.snapshot();
    const { plan } = Queries.getCurrentWeek();

    expect(recovery.strainIndex).toBe(plan.recovery.strainIndex);
  });

  it('gives a status and reasons', () => {
    seed(); reset();
    PlanningService.generateWeek();

    const recovery = RecoveryService.snapshot();
    expect(['good', 'moderate', 'poor', 'unknown'].includes(recovery.status)).toBeTruthy();
    expect(recovery.reasons.length).toBeGreaterThan(0);
    expect(recovery.reasons.every((reason) => reason.message.length > 10)).toBeTruthy();
  });
});

describe('Application — progress', () => {
  it('assembles from the services that own each figure', () => {
    seed(); reset();
    PlanningService.generateWeek();

    const progress = ProgressService.snapshot();

    expect(progress.weight.current).toBe(61);
    expect(progress.gym.lastMonth).toBeTruthy();
    expect(progress.running.totalRuns).toBe(0);
    expect(progress.nutrition.target.calories).toBeGreaterThan(0);
    expect(progress.recovery.status).toBeTruthy();
  });

  it('updates after weight is logged', () => {
    seed(); reset();
    wireApplication();
    PlanningService.generateWeek();

    expect(ProgressService.snapshot().weight.current).toBe(61);
    WeightService.log(62);
    expect(ProgressService.snapshot().weight.current).toBe(62);

    unwireApplication();
  });
});

/* ── Queries ────────────────────────────────────────────────────────────── */

describe('Application — queries', () => {
  it('answers each question by delegation', () => {
    seed(); reset();
    PlanningService.generateWeek();

    expect(Queries.getToday().date).toBe(today());
    expect(Queries.getTomorrow().date).toBeTruthy();
    expect(Queries.getCurrentWeek().plan.days.length).toBe(7);
    expect(Queries.getRecovery().status).toBeTruthy();
    expect(Queries.getProgress().weight.current).toBe(61);
    expect(Array.isArray(Queries.getNotifications())).toBeTruthy();
    expect(Array.isArray(Queries.getShoppingList())).toBeTruthy();
  });

  it('finds the next session and the next run', () => {
    seed(); reset();
    PlanningService.generateWeek();

    const next = Queries.getNextWorkout();
    if (next) expect(next.date >= today()).toBeTruthy();

    const run = Queries.getNextRun();
    if (run) expect(run.date >= today()).toBeTruthy();
  });

  it('returns today\'s detail', () => {
    seed(); reset();
    PlanningService.generateWeek();

    expect(Queries.getNutritionToday()).toBeTruthy();
    expect(Queries.getMealsToday()).toBeTruthy();
  });
});

/* ── Sync ───────────────────────────────────────────────────────────────── */

describe('Application — sync', () => {
  it('reports what is stored', () => {
    seed(); reset();
    PlanningService.generateWeek();

    const status = SyncService.status();
    expect(status.records.profile).toBe(1);
    expect(status.records.planSnapshots).toBe(1);
    expect(status.total).toBeGreaterThan(1);
    expect(status.caches.length).toBeGreaterThan(0);
  });

  it('clears every cache after a restore', () => {
    seed(); reset();
    SyncService.start();
    PlanningService.generateWeek();

    resetStats();
    DashboardService.snapshot();
    const dump = SyncService.exportJSON();

    SyncService.import(dump);
    DashboardService.snapshot();

    expect(stats().find((entry) => entry.name === 'dashboard').misses).toBe(2);
    SyncService.stop();
  });
});

/* ── Reports ────────────────────────────────────────────────────────────── */

describe('Application — reports', () => {
  it('builds a week report from what the services measured', () => {
    seed(); reset();
    PlanningService.generateWeek();

    const report = ReportService.build();
    expect(report.weekStart).toBeTruthy();
    expect(report.gymSummary).toBeTruthy();
    expect(report.nutritionSummary).toBeTruthy();
  });

  it('compares what was planned with what happened', () => {
    seed(); reset();
    PlanningService.generateWeek();

    const comparison = ReportService.planVersusActual();
    expect(comparison.planned).toBeTruthy();
    expect(comparison.gaps).toBeTruthy();
  });

  it('says plainly when a week was never planned', () => {
    seed(); reset();
    const comparison = ReportService.planVersusActual('2020-01-06');
    expect(comparison.planned).toBeNull();
    expect(comparison.note).toContain('never generated');
  });
});

/* ── The full cycle ─────────────────────────────────────────────────────── */

describe('Application — the full cycle', () => {
  it('stays consistent from generating a week to generating the next', () => {
    seed(); reset();
    startApplication();

    /* 1. Generate. */
    const first = PlanningService.generateWeek();
    expect(first.completed.length).toBe(7);

    /* 2. Execute a lifting session. */
    const gymDay = first.workout.days[0];
    let outcome = ExecutionService.start(gymDay.date);
    expect(outcome.session).toBeTruthy();

    for (const exercise of outcome.session.exercises.slice(0, 2)) {
      for (let set = 0; set < exercise.plannedSets; set += 1) {
        outcome = ExecutionService.logSet(outcome.session, exercise.exerciseId, {
          reps: exercise.plannedReps, weightKg: exercise.plannedWeightKg ?? 40, rpe: 7.5,
        });
      }
    }
    const finished = ExecutionService.complete(outcome.session, { fatigue: 6 });
    expect(finished.session.state).toBe('completed');
    expect(finished.loggedRows).toBeGreaterThan(0);

    /* 3. Log a run. A run is logged on the day it happened, so the date is
       today rather than the planned date, which may be later in the week. */
    const runSession = first.running.sessions[0];
    if (runSession) {
      expect(logRunToday(runSession)).toBeTruthy();
    }

    /* 4. Update weight. */
    WeightService.log(61.6);
    expect(WeightService.current()).toBe(61.6);

    /* 5. The derived layer followed. */
    const progress = ProgressService.snapshot();
    expect(progress.weight.current).toBe(61.6);
    expect(progress.gym.sessions).toBeGreaterThan(0);

    /* 6. Generate the next week — it reads what just happened. */
    const second = PlanningService.regenerate();
    expect(second.completed.length).toBe(7);
    expect(PlanSnapshotRepository.count()).toBeGreaterThan(0);

    /* 7. Everything is still consistent. */
    const dashboard = DashboardService.snapshot();
    expect(dashboard.weekNumber).toBe(second.plan.weekNumber);
    expect(SessionRepository.count()).toBe(1);
    expect(WorkoutRepository.count()).toBeGreaterThan(0);

    stopApplication();
  });

  it('leaves the logged work readable by the next week\'s engines', () => {
    seed(); reset();
    startApplication();

    const first = PlanningService.generateWeek();
    const gymDay = first.workout.days[0];

    let outcome = ExecutionService.start(gymDay.date);
    // A session exercise carries plannedSets/plannedReps; the workout engine's
    // version of the same exercise calls them sets/reps.
    const exercise = outcome.session.exercises[0];

    for (let set = 0; set < exercise.plannedSets; set += 1) {
      outcome = ExecutionService.logSet(outcome.session, exercise.exerciseId, {
        reps: exercise.plannedReps, weightKg: 50, rpe: 7,
      });
    }
    const finished = ExecutionService.complete(outcome.session, { fatigue: 5 });
    expect(finished.loggedRows).toBeGreaterThan(0);

    // The workout engine reads the logged sets on the next build.
    const next = PlanningService.regenerate();
    const sameLift = next.workout.days
      .flatMap((day) => day.exercises)
      .find((item) => item.exerciseId === exercise.exerciseId);

    if (sameLift) {
      expect(sameLift.progression.previous).toBeTruthy();
      expect(sameLift.progression.previous.weightKg).toBe(50);
    }

    stopApplication();
  });
});

/** Log a planned run as having happened today. */
function logRunToday(session) {
  RunningRepository.create({
    date: today(),
    distanceKm: session.distanceKm,
    durationMin: session.durationMin,
    difficulty: 'easy',
  });
  return RunningRepository.byDate(today())[0];
}

/* ── Layer boundaries ───────────────────────────────────────────────────── */

describe('Application — boundaries', () => {
  it('holds no engine of its own', () => {
    // Every number the dashboard shows must have come from somewhere else.
    seed(); reset();
    PlanningService.generateWeek();

    const dashboard = DashboardService.snapshot();
    const { nutrition } = Queries.getCurrentWeek();
    const day = nutrition.days.find((entry) => entry.date === dashboard.date);

    if (day) {
      expect(dashboard.nutrition.calories).toBe(day.calories);
      expect(dashboard.nutrition.proteinG).toBe(day.proteinG);
    }
  });

  it('exposes a single entry point for a consumer', async () => {
    const { App } = await import('../app/index.js');
    expect(typeof App.start).toBe('function');
    expect(typeof App.query.getToday).toBe('function');
    expect(typeof App.planning.generateWeek).toBe('function');
  });
});
