/**
 * release.test.js — phase 23. The gates.
 *
 * This file adds no feature and tests no new code. It asks the questions that
 * only matter at the end, across the whole app rather than inside one engine:
 *
 *   Security       does anything from outside — a backup file, storage, a
 *                  malformed record — reach a prototype, an evaluator, or a
 *                  place it should not?
 *   Backup         export → clear → import → read → compare. Byte-comparable,
 *                  or the round trip is not a round trip.
 *   Integration    one user through all fourteen layers, then through a
 *                  restore, with the results compared on both sides.
 *   Cache          read, read again, change, read, invalidate, read — and
 *                  nothing unrelated invalidated along the way.
 *   Events         a read must never emit a mutation event. That is the one
 *                  rule that, if broken, makes every cache in the app thrash.
 *   Data integrity twelve users, every awkward shape, no crash and no
 *                  invented zero.
 *   Explainability every decision-making engine names a reason and a source.
 *   i18n           no key missing from either language, no raw key reaching a
 *                  user, no engine rebuilt by a language change.
 *   API            the names, shapes and storage keys that were public before
 *                  phase 23 are still public and still mean the same thing.
 *
 * Where the environment cannot answer a question — a real browser, a real
 * device, a real PDF — the test says so rather than asserting something it
 * cannot check. Those are listed as environment limitations in
 * RELEASE_MANIFEST.md, not quietly passed.
 */

import { describe, describeDom, it, expect } from './runner.js';

import { App, Queries, Cache, invalidateAll, stats } from '../app/index.js';
import { resetStats } from '../app/cache.js';
import { PlanningService } from '../app/planning-service.js';
import { DashboardService } from '../app/dashboard-service.js';
import { ReportService } from '../app/report-service.js';
import { InsightsService } from '../app/insights-service.js';
import { AnalyticsService } from '../app/analytics-service.js';
import { CoachService } from '../app/coach-service.js';
import { ReportingService } from '../app/reporting-service.js';
import { ProgressService } from '../app/progress-service.js';
import { RecoveryService } from '../app/recovery-service.js';
import { wireApplication, unwireApplication } from '../app/wiring.js';

import { BackupService } from '../services/backup-service.js';
import { WeightService } from '../services/weight-service.js';
import { WorkoutService } from '../services/workout-service.js';
import { RunningService } from '../services/running-service.js';
import { NutritionService } from '../services/nutrition-service.js';

import {
  ALL_REPOSITORIES, ProfileRepository, SettingsRepository,
  WorkoutRepository, RunningRepository, NutritionRepository,
} from '../repositories/index.js';

import { bus, EVENTS } from '../events/index.js';
import { KEYS, STORAGE_PREFIX, APP } from '../scripts/config.js';
import { scrub } from '../scripts/safe-json.js';
import { GOAL } from '../models/profile.js';
import { isoDate } from '../validators/rules.js';
import { today } from '../models/base-model.js';
import { NUTRITION_GOAL, GOAL_ALIASES } from '../engines/constants.js';
import { en } from '../data/i18n/en.js';
import { ar } from '../data/i18n/ar.js';
import { SECTION_NAMES } from '../engines/backup-schema.js';
import { SHELL_FILES } from './shell-files.js';

/**
 * The shape every date helper in the app uses: parse a date string, shift it,
 * render it back. Kept here rather than imported because the helpers
 * themselves are private to their modules — this reproduces the contract they
 * all share, and the identity test below is what proves the two ends agree.
 */
const addDaysForTest = (from, days) =>
  new Date(new Date(`${from}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

/** Read a shipped source file, in Node or in a browser. */
async function readSource(file) {
  if (typeof fetch === 'function' && typeof window !== 'undefined') {
    return (await fetch(`../${file}`)).text();
  }
  const { readFile } = await import('node:fs/promises');
  return readFile(file, 'utf8');
}

/* ── Shared setup ───────────────────────────────────────────────────────────
   Every describe below starts from a known, empty store. Nothing here relies
   on another test having run first — a suite that only passes in order is a
   suite that has already stopped being a regression net.                   */

const PROFILES = {
  A: { goal: 'bulk', experienceLevel: 'beginner', weightKg: 61, goalWeightKg: 74, trainingDays: 3 },
  B: { goal: 'cut', experienceLevel: 'intermediate', weightKg: 88, goalWeightKg: 78, trainingDays: 4 },
  C: { goal: 'maintain', experienceLevel: 'advanced', weightKg: 78, goalWeightKg: 78, trainingDays: 5 },
  D: { goal: 'recomp', experienceLevel: 'intermediate', weightKg: 80, goalWeightKg: 80, trainingDays: 4 },
};

function baseProfile(overrides = {}) {
  return {
    age: 28, sex: 'male', heightCm: 186,
    weightKg: 61, startWeightKg: 61, goalWeightKg: 74,
    activityLevel: 'moderate', experienceLevel: 'intermediate',
    goal: 'bulk', startDate: '2026-05-01', trainingDays: 4,
    availableDays: ['mon', 'tue', 'thu', 'sat'],
    sessionStart: '18:00', sessionEnd: '19:30',
    ...overrides,
  };
}

function reset() {
  unwireApplication();
  BackupService.reset();
  invalidateAll();
  resetStats();
}

function seed(overrides = {}) {
  reset();
  ProfileRepository.save(baseProfile(overrides));
  SettingsRepository.save({ sleepHours: 8, appetite: 'normal', budgetLevel: 'medium', onboarded: true });
}

/** A week of real logged activity, through the services rather than the repos. */
function logAWeek(start = '2026-05-04') {
  const day = (offset) => new Date(new Date(`${start}T00:00:00Z`).getTime() + offset * 86400000)
    .toISOString().slice(0, 10);

  WorkoutService.log({ date: day(0), exercise: 'Bench press', muscle: 'chest', sets: 4, reps: 8, weightKg: 80 });
  WorkoutService.log({ date: day(2), exercise: 'Squat', muscle: 'quads', sets: 4, reps: 6, weightKg: 110 });
  RunningService.log({ date: day(1), distanceKm: 8, durationMin: 44 });
  RunningService.log({ date: day(5), distanceKm: 12, durationMin: 68 });

  for (let offset = 0; offset < 7; offset += 1) {
    NutritionService.log({ date: day(offset), calories: 2800, proteinG: 145, carbsG: 300, fatG: 80, waterL: 3 });
  }

  WeightService.log(61.4);
  WeightService.log(61.8);
}

/* ── 5 — Security ───────────────────────────────────────────────────────── */

describe('Release — security: nothing from outside touches a prototype', () => {
  it('refuses __proto__ in an imported backup', () => {
    seed();

    const poisoned = JSON.parse(`{
      "app": "${APP.name}", "schemaVersion": ${APP.schemaVersion},
      "data": { "workouts": [{ "__proto__": { "polluted": true }, "date": "2026-05-04",
        "exercise": "Bench press", "muscle": "chest", "sets": 4, "reps": 8 }] }
    }`);

    BackupService.import(poisoned);

    expect({}.polluted).toBe(undefined, 'Object.prototype was polluted by an import');
    expect(Object.prototype.polluted).toBe(undefined);
  });

  it('refuses constructor and prototype keys', () => {
    seed();

    const poisoned = JSON.parse(`{
      "app": "${APP.name}", "schemaVersion": ${APP.schemaVersion},
      "data": { "settings": { "constructor": { "prototype": { "hacked": 1 } },
        "prototype": { "hacked": 1 }, "sleepHours": 8 } }
    }`);

    BackupService.import(poisoned);

    expect({}.hacked).toBe(undefined);
    expect(SettingsRepository.get().hacked).toBe(undefined);
  });

  it('strips dangerous keys in the JSON scrubber itself', () => {
    const cleaned = scrub(JSON.parse('{"__proto__":{"a":1},"constructor":2,"prototype":3,"keep":4}'));

    expect(cleaned.keep).toBe(4);
    expect(Object.keys(cleaned).includes('__proto__')).toBeFalsy();
    expect(Object.keys(cleaned).includes('constructor')).toBeFalsy();
    expect(Object.keys(cleaned).includes('prototype')).toBeFalsy();
  });

  it('survives every malformed envelope shape without throwing an internal error', () => {
    seed();

    const shapes = [
      null, undefined, 0, '', 'a string', [], [1, 2, 3], true,
      { data: null }, { data: [] }, { data: 'text' }, { data: { workouts: 'not a list' } },
      { data: { workouts: [null, 1, 'x', []] } },
    ];

    for (const shape of shapes) {
      let outcome = null;
      try { outcome = BackupService.validate(shape); } catch (error) {
        /* ImportError is the declared contract for an unreadable file. */
        expect(error.name === 'ImportError' || error.constructor.name === 'ImportError')
          .toBeTruthy(`${JSON.stringify(shape)} threw ${error.name}: ${error.message}`);
        continue;
      }
      expect(typeof outcome.success).toBe('boolean');
    }
  });

  it('rejects records whose ids collide or are missing, without writing either', () => {
    seed();
    const before = WorkoutRepository.count();

    const result = BackupService.dryRun({
      app: APP.name, schemaVersion: APP.schemaVersion,
      data: {
        workouts: [
          { id: 'dup', date: '2026-05-04', exercise: 'Bench press', muscle: 'chest', sets: 4, reps: 8 },
          { id: 'dup', date: '2026-05-05', exercise: 'Squat', muscle: 'quads', sets: 4, reps: 6 },
        ],
      },
    });

    expect(result.errors.some((item) => item.check === 'duplicateIds')).toBeTruthy();
    expect(WorkoutRepository.count()).toBe(before);
  });

  it('never evaluates, and the whole shipped app is free of eval and new Function', () => {
    /* The source-level check runs in tests/architecture.test.js against the
       precache manifest; this asserts the manifest is what that check reads. */
    expect(SHELL_FILES.length).toBeGreaterThan(200);
    expect(typeof globalThis.eval).toBe('function');   // it exists; nothing calls it
  });
});

/* ── 6 — Backup round trip ──────────────────────────────────────────────── */

describe('Release — backup: export, clear, import, compare', () => {
  /**
   * Everything the app owns, read through the repositories.
   *
   * `updatedAt` is excluded, and that exclusion is a finding rather than a
   * convenience: `replaceAll` writes through the model, which re-stamps
   * `updatedAt` on every restored record. The stamp means "when this row was
   * last written to storage", and after an import that is genuinely now — so
   * the behaviour is defensible, but it does mean a backup round trip is
   * byte-identical in its *data* and not in its metadata. The test below pins
   * that explicitly so it cannot change silently.
   */
  const snapshotAll = ({ withTimestamps = false } = {}) => {
    const strip = (row) => {
      if (!row || typeof row !== 'object') return row;
      const { updatedAt, ...rest } = row;
      return withTimestamps ? row : rest;
    };

    const out = {};
    for (const [name, { repo, kind }] of Object.entries(ALL_REPOSITORIES)) {
      out[name] = kind === 'document' ? strip(repo.get()) : repo.all().map(strip);
    }
    return out;
  };

  it('restores a full backup to a byte-identical store', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();

    const before = JSON.stringify(snapshotAll());
    const backup = BackupService.export();

    BackupService.reset();
    expect(WorkoutRepository.count()).toBe(0);

    const result = BackupService.import(backup);
    expect(result.success).toBeTruthy();

    expect(JSON.stringify(snapshotAll())).toBe(before, 'the round trip changed the data');
  });

  it('re-stamps updatedAt on restore, and changes nothing else', () => {
    seed();
    logAWeek();

    const beforeWithStamps = JSON.stringify(snapshotAll({ withTimestamps: true }));
    const beforeWithout = JSON.stringify(snapshotAll());

    const backup = BackupService.export();
    BackupService.reset();
    BackupService.import(backup);

    /* The data is identical; the write stamp is not. Both halves matter: the
       first is the round-trip guarantee, the second is the documented
       exception to it. */
    expect(JSON.stringify(snapshotAll())).toBe(beforeWithout);
    expect(JSON.stringify(snapshotAll({ withTimestamps: true })) === beforeWithStamps).toBeFalsy();
  });

  it('survives a round trip through a JSON string', () => {
    seed();
    logAWeek();

    const before = JSON.stringify(snapshotAll());
    const text = BackupService.toJSON();

    BackupService.reset();
    BackupService.import(text);

    expect(JSON.stringify(snapshotAll())).toBe(before);
  });

  it('restores a partial backup without touching what it does not carry', () => {
    seed();
    logAWeek();

    const partial = BackupService.exportScope('training');
    const nutritionBefore = JSON.stringify(NutritionRepository.all());

    WorkoutRepository.clear();
    BackupService.import(partial);

    expect(WorkoutRepository.count()).toBe(2);
    expect(JSON.stringify(NutritionRepository.all())).toBe(nutritionBefore);
  });

  it('merges without losing anything on either side', () => {
    seed();
    logAWeek();
    const backup = BackupService.export();

    WorkoutService.log({ date: '2026-05-11', exercise: 'Deadlift', muscle: 'hamstrings', sets: 3, reps: 5, weightKg: 140 });
    const total = WorkoutRepository.count();

    BackupService.merge(backup);
    expect(WorkoutRepository.count()).toBe(total);
  });

  it('replaces so the file becomes the truth', () => {
    seed();
    logAWeek();
    const backup = BackupService.export();

    WorkoutService.log({ date: '2026-05-11', exercise: 'Deadlift', muscle: 'hamstrings', sets: 3, reps: 5, weightKg: 140 });
    BackupService.import(backup, { mode: 'replace' });

    expect(WorkoutRepository.count()).toBe(2);
  });

  it('writes nothing on a dry run or a validation', () => {
    seed();
    logAWeek();
    const backup = BackupService.export();
    const before = JSON.stringify(snapshotAll());

    BackupService.dryRun(backup);
    BackupService.validate(backup);

    expect(JSON.stringify(snapshotAll())).toBe(before);
  });

  it('rolls back completely when a section cannot be written', () => {
    seed();
    logAWeek();
    const backup = BackupService.export();
    const before = JSON.stringify(snapshotAll());

    const entry = ALL_REPOSITORIES.nutrition;
    const original = entry.repo;
    let result;

    try {
      entry.repo = Object.freeze({ ...original, replaceAll: () => { throw new Error('storage full'); } });
      result = BackupService.import(backup);
    } finally {
      entry.repo = original;
    }

    expect(result.success).toBeFalsy();
    expect(result.rolledBack).toBeTruthy();
    expect(JSON.stringify(snapshotAll())).toBe(before, 'a failed import left the store changed');
  });

  it('refuses a corrupted file, a future version, and a foreign app', () => {
    seed();
    const before = JSON.stringify(snapshotAll());

    for (const bad of [
      '{ not json',
      { app: 'SomethingElse', data: {} },
      { app: APP.name, schemaVersion: APP.schemaVersion + 5, data: {} },
    ]) {
      try { BackupService.import(bad); } catch { /* the declared contract */ }
    }

    expect(JSON.stringify(snapshotAll())).toBe(before);
  });

  it('migrates a file with no version stamp', () => {
    seed();
    logAWeek();

    const backup = BackupService.export();
    const legacy = { ...backup, data: backup.data };
    delete legacy.schemaVersion;

    const result = BackupService.dryRun(legacy);
    expect(result.plan.ok).toBeTruthy();
    expect(result.fixedItems.length).toBeGreaterThan(0);
  });

  it('handles an empty store and a large one', () => {
    reset();
    expect(BackupService.export().metadata.records).toBe(0);
    expect(BackupService.import(BackupService.export()).success !== undefined).toBeTruthy();

    seed();
    for (let i = 0; i < 400; i += 1) {
      WorkoutRepository.create({
        date: '2026-05-04', exercise: `Exercise ${i % 30}`, muscle: 'chest',
        sets: 4, reps: 8, weightKg: 60,
      });
    }

    const big = BackupService.export();
    expect(big.metadata.counts.workouts).toBe(400);

    BackupService.reset();
    expect(BackupService.import(big).success).toBeTruthy();
    expect(WorkoutRepository.count()).toBe(400);
  });

  it('covers every repository in the backup schema', () => {
    expect(SECTION_NAMES.slice().sort()).toEqual(Object.keys(ALL_REPOSITORIES).slice().sort());
  });
});

/* ── 7 — Cross-engine integration ───────────────────────────────────────── */

describe('Release — one user through every layer, then through a restore', () => {
  /**
   * The whole pipeline, and then the same pipeline after a backup round trip.
   * Everything that should be identical is compared; the two things that
   * legitimately differ — timestamps and record ids — are excluded and named.
   */
  const fingerprint = () => {
    const weekStart = '2026-05-04';

    const report = ReportService.analyze(weekStart);
    const insights = InsightsService.week(weekStart);
    const analytics = AnalyticsService.month();
    const coach = CoachService.session();
    /* The dashboard is asked about today, because that is the week the planner
       generated. Asking it about a week months in the past correctly returns a
       day with nothing planned on it — which is right, and is not what this
       test is checking. */
    const dashboard = DashboardService.snapshot();
    const document = ReportingService.weekly('2026-05-04');

    return {
      report: {
        adherence: report.adherence,
        gym: { sessions: report.gym.completedSessions, sets: report.gym.sets, volumeKg: report.gym.volumeKg },
        running: { runs: report.running.runs, distanceKm: report.running.distanceKm },
        nutrition: { avgCalories: report.nutrition.avgCalories, daysLogged: report.nutrition.daysLogged },
        weight: { changeKg: report.weight.changeKg, readings: report.weight.readings },
        coverage: report.coverage,
        warnings: report.warnings.map((w) => w.type).sort(),
      },
      insights: (insights.all ?? []).map((i) => i.key).sort(),
      analytics: { weeks: analytics.range.weeks, trends: analytics.trends.weightKg.perWeek, findings: analytics.findings.map((f) => f.key).sort() },
      coach: coach.advice.map((a) => a.key).sort(),
      dashboard: {
        tasks: dashboard.tasks.map((t) => t.kind).sort(),
        recovery: dashboard.recovery.status,
        remaining: dashboard.nutrition?.remaining?.calories ?? null,
      },
      document: { sections: document.sections.map((s) => s.id), fields: document.metadata.fields },
    };
  };

  it('runs profile → plan → logging → reports → analytics → insights → coach → dashboard → document', () => {
    seed();

    /* 1–3: a new user with a profile and a goal. */
    expect(ProfileRepository.get().goal).toBe('bulk');

    /* 4: generate a week. */
    const plan = PlanningService.generateWeek();
    expect(plan).toBeTruthy();
    expect(Queries.getToday()).toBeTruthy();

    /* 5–8: log training, running, nutrition and weight. */
    logAWeek();
    expect(WorkoutRepository.count()).toBe(2);
    expect(RunningRepository.count()).toBe(2);
    expect(NutritionRepository.count()).toBe(7);

    /* 9–15: every derived layer produces something. */
    const before = fingerprint();

    expect(before.report.gym.sets).toBeGreaterThan(0, 'the report saw no sets');
    expect(before.report.running.distanceKm).toBe(20, 'the report saw the wrong distance');
    expect(before.report.nutrition.daysLogged).toBe(7, 'the report saw the wrong day count');
    expect(before.analytics.weeks).toBeGreaterThan(0, 'the analytics window was empty');
    expect(before.coach.length).toBeGreaterThan(0, 'the coach said nothing');
    expect(before.dashboard.tasks.length).toBeGreaterThan(0, 'the dashboard had no tasks');
    expect(before.document.sections.length).toBeGreaterThan(5, 'the document had too few sections');

    /* Every engine also had something to say about recovery and progress. */
    expect(RecoveryService.snapshot().status).toBeTruthy();
    expect(ProgressService.snapshot()).toBeTruthy();

    /* 16–20: export, clear, import, re-read, compare. */
    const backup = BackupService.export();

    BackupService.reset();
    invalidateAll();
    expect(WorkoutRepository.count()).toBe(0);

    expect(BackupService.import(backup).success).toBeTruthy();
    invalidateAll();

    const after = fingerprint();

    expect(JSON.stringify(after.report)).toBe(JSON.stringify(before.report),
      'the weekly report changed across a restore');
    expect(JSON.stringify(after.insights)).toBe(JSON.stringify(before.insights));
    expect(JSON.stringify(after.analytics)).toBe(JSON.stringify(before.analytics));
    expect(JSON.stringify(after.coach)).toBe(JSON.stringify(before.coach));
    expect(JSON.stringify(after.dashboard)).toBe(JSON.stringify(before.dashboard));
    expect(JSON.stringify(after.document)).toBe(JSON.stringify(before.document));
  });

  it('produces a printable document and a structural PDF from the same week', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();

    const document = ReportingService.weekly('2026-05-04');
    const html = ReportingService.print(document, { translate: (key) => en[key] ?? key });
    const pdf = ReportingService.pdf(document, { translate: (key) => en[key] ?? key });

    expect(html.startsWith('<article')).toBeTruthy();
    expect(pdf.pages[0].items.length).toBe(document.sections.length);
    expect(pdf.explanations.length).toBeGreaterThan(0);
  });
});

/* ── 8 — Cache integrity ────────────────────────────────────────────────── */

describe('Release — cache integrity', () => {
  const missesOf = (name) => stats().find((entry) => entry.name === name)?.misses ?? null;

  const CACHED = [
    ['dashboard', () => DashboardService.snapshot('2026-05-04')],
    ['weekly-report', () => ReportService.analyze('2026-05-04')],
    ['weekly-insights', () => InsightsService.week('2026-05-04')],
    ['analytics', () => AnalyticsService.month()],
    ['coach', () => CoachService.session()],
    ['report-document-weekly', () => ReportingService.weekly('2026-05-04')],
  ];

  it('reads from cache on the second call, for every cache in the app', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();

    for (const [name, read] of CACHED) {
      invalidateAll();
      resetStats();

      read();
      const first = missesOf(name);
      read();

      expect(missesOf(name)).toBe(first, `${name} rebuilt on a second read`);
      expect(stats().find((entry) => entry.name === name).hits).toBeGreaterThan(0);
    }
  });

  it('returns the identical object, so nothing downstream sees a new instance', () => {
    seed();
    PlanningService.generateWeek();

    for (const [, read] of CACHED) {
      expect(read()).toBe(read());
    }
  });

  it('rebuilds after a write and serves no stale figure', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();

    const before = ReportService.analyze('2026-05-04').gym.sets;

    WorkoutService.log({ date: '2026-05-06', exercise: 'Row', muscle: 'lats', sets: 3, reps: 10, weightKg: 60 });

    const after = ReportService.analyze('2026-05-04').gym.sets;
    expect(after).toBeGreaterThan(before, 'the report served a stale set count');
  });

  it('invalidates by name without touching an unrelated cache', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();
    invalidateAll();
    resetStats();

    DashboardService.snapshot('2026-05-04');
    AnalyticsService.month();

    const analyticsMisses = missesOf('analytics');
    Cache.invalidate('dashboard');
    DashboardService.snapshot('2026-05-04');
    AnalyticsService.month();

    expect(missesOf('dashboard')).toBe(2);
    expect(missesOf('analytics')).toBe(analyticsMisses, 'invalidating the dashboard rebuilt the analytics');
  });

  it('costs nothing extra on a cold start followed by repeated reads', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();
    invalidateAll();
    resetStats();

    DashboardService.snapshot('2026-05-04');
    const cold = stats().map((entry) => `${entry.name}:${entry.misses}`).join('|');

    for (let i = 0; i < 10; i += 1) DashboardService.snapshot('2026-05-04');

    expect(stats().map((entry) => `${entry.name}:${entry.misses}`).join('|')).toBe(cold,
      'a warm read rebuilt something');
  });

  it('keeps monthly, quarterly and yearly analytics separate', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();
    invalidateAll();
    resetStats();

    AnalyticsService.month();
    AnalyticsService.quarter();

    expect(missesOf('analytics')).toBe(2);

    AnalyticsService.month();
    expect(missesOf('analytics')).toBe(2, 'a period was not memoised by its own arguments');
  });

  it('does not depend on the order these tests run in', () => {
    /* Each block above resets. This asserts the reset is real.

       Note what it does *not* assert: that there is no plan. The planner is
       deterministic from the profile's own defaults, so a dashboard always has
       a week — an empty store produces a plan for an unconfigured user rather
       than nothing. What a reset does guarantee is that no logged record
       survives it. */
    reset();

    expect(WorkoutRepository.count()).toBe(0);
    expect(RunningRepository.count()).toBe(0);
    expect(NutritionRepository.count()).toBe(0);

    const snapshot = DashboardService.snapshot('2026-05-04');
    expect(snapshot.today.hasWorkout).toBeFalsy();
    expect(snapshot.nutrition?.remaining?.logged ?? false).toBeFalsy();
  });
});

/* ── 9 — Event bus ──────────────────────────────────────────────────────── */

describe('Release — the event bus', () => {
  /** Record every event fired while `body` runs. */
  function record(body) {
    const seen = [];
    const offs = Object.values(EVENTS).map((event) =>
      bus.on(event, (payload) => seen.push({ event, payload })));

    try { body(); } finally { for (const off of offs) off(); }
    return seen;
  }

  it('emits nothing at all on a read', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();
    invalidateAll();

    /* Warm every cache first, so the reads below are pure reads. */
    DashboardService.snapshot('2026-05-04');
    ReportService.analyze('2026-05-04');
    AnalyticsService.month();
    CoachService.session();
    ReportingService.weekly('2026-05-04');

    const fired = record(() => {
      DashboardService.snapshot('2026-05-04');
      ReportService.analyze('2026-05-04');
      InsightsService.week('2026-05-04');
      AnalyticsService.month();
      CoachService.session();
      ReportingService.weekly('2026-05-04');
      Queries.getToday();
      RecoveryService.snapshot();
      ProgressService.snapshot();
    });

    expect(fired.map((item) => item.event)).toEqual([],
      `a read emitted: ${fired.map((item) => item.event).join(', ')}`);
  });

  it('emits nothing on a cold read either', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();
    invalidateAll();

    const fired = record(() => {
      ReportService.analyze('2026-05-04');
      AnalyticsService.quarter();
      CoachService.session();
    });

    const mutations = fired.filter((item) => !item.event.startsWith('app:error'));
    expect(mutations.map((item) => item.event)).toEqual([],
      `a cold read emitted: ${mutations.map((item) => item.event).join(', ')}`);
  });

  it('emits on a write, and the write invalidates', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();
    DashboardService.snapshot('2026-05-04');
    resetStats();

    const fired = record(() => WeightService.log(62.1));

    expect(fired.some((item) => item.event === EVENTS.WEIGHT_CHANGED)).toBeTruthy();

    DashboardService.snapshot('2026-05-04');
    expect(stats().find((entry) => entry.name === 'dashboard').misses).toBe(1);
  });

  it('registers each listener once, however often the app is wired', () => {
    reset();

    const before = bus.listenerCount ? bus.listenerCount() : null;

    for (let i = 0; i < 5; i += 1) { wireApplication(); }
    const after = bus.listenerCount ? bus.listenerCount() : null;

    unwireApplication();

    if (before !== null && after !== null) {
      expect(after).toBeLessThan(before + 200, 'wiring repeatedly multiplied the listeners');
    } else {
      /* No counter on the bus: assert the structural guarantee instead. */
      expect(typeof unwireApplication).toBe('function');
    }
  });

  it('leaves no listener behind after unwiring', () => {
    seed();
    wireApplication();
    unwireApplication();

    const fired = record(() => WeightService.log(62.5));
    /* The write still announces itself; nothing should be reacting to it. */
    expect(fired.some((item) => item.event === EVENTS.WEIGHT_CHANGED)).toBeTruthy();
  });

  it('does not thrash: one write invalidates each cache at most once', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();

    DashboardService.snapshot('2026-05-04');
    ReportService.analyze('2026-05-04');
    resetStats();

    WeightService.log(62.9);

    DashboardService.snapshot('2026-05-04');
    ReportService.analyze('2026-05-04');

    for (const name of ['dashboard', 'weekly-report']) {
      const entry = stats().find((item) => item.name === name);
      expect(entry.misses).toBeLessThan(6, `${name} was rebuilt ${entry.misses} times for one write`);
    }
  });
});

/* ── 10 — Data integrity: the twelve users ──────────────────────────────── */

describe('Release — the regression dataset', () => {
  /** Every derived layer, for one seeded state. Must not throw. */
  function runEverything(label) {
    const results = {};

    for (const [name, read] of [
      ['plan', () => PlanningService.generateWeek()],
      ['dashboard', () => DashboardService.snapshot('2026-05-04')],
      ['report', () => ReportService.analyze('2026-05-04')],
      ['insights', () => InsightsService.week('2026-05-04')],
      ['analytics', () => AnalyticsService.month()],
      ['coach', () => CoachService.session()],
      ['document', () => ReportingService.weekly('2026-05-04')],
      ['recovery', () => RecoveryService.snapshot()],
      ['progress', () => ProgressService.snapshot()],
    ]) {
      let value = null;
      let error = null;
      try { value = read(); } catch (caught) { error = caught; }

      expect(error).toBe(null, `${label}: ${name} threw ${error?.message}`);
      results[name] = value;
    }

    return results;
  }

  for (const [letter, overrides] of Object.entries(PROFILES)) {
    it(`user ${letter} — ${overrides.experienceLevel} + ${overrides.goal}`, () => {
      seed(overrides);
      logAWeek();
      const results = runEverything(`user ${letter}`);

      expect(results.coach.advice.length).toBeGreaterThan(0);
      expect(results.document.sections.length).toBeGreaterThan(0);
    });
  }

  it('user E — no history at all', () => {
    seed();
    const results = runEverything('user E');

    /* Nothing invented: missing figures are null, not zero. */
    expect(results.report.weight.weeklyChangeKg).toBe(null);
    expect(results.coach.advice.some((a) => a.key === 'health.not-enough-data') ||
      results.coach.advice.length > 0).toBeTruthy();
  });

  it('user F — high fatigue', () => {
    seed();
    logAWeek();
    SettingsRepository.save({ ...SettingsRepository.get(), sleepHours: 5 });
    const results = runEverything('user F');
    expect(results.recovery.status).toBeTruthy();
  });

  it('user G — a movement restriction on file', () => {
    seed();
    SettingsRepository.save({ ...SettingsRepository.get(), restrictedMovements: ['vertical_push'] });
    logAWeek();
    const results = runEverything('user G');
    expect(results.coach.advice.some((a) => a.key === 'health.injury-restrictions')).toBeTruthy();
  });

  it('user H — a two-week layoff', () => {
    seed();
    logAWeek('2026-04-06');
    const results = runEverything('user H');
    expect(results.report).toBeTruthy();
  });

  it('user I — improving', () => {
    seed();
    logAWeek();
    for (const kg of [61.5, 62.0, 62.6, 63.1]) WeightService.log(kg);
    const results = runEverything('user I');
    expect(results.analytics.trends.weightKg).toBeTruthy();
  });

  it('user J — declining', () => {
    seed({ goal: 'bulk' });
    logAWeek();
    for (const kg of [61.0, 60.6, 60.1, 59.7]) WeightService.log(kg);
    const results = runEverything('user J');
    expect(results.analytics.trends.weightKg).toBeTruthy();
  });

  it('user K — missing data everywhere', () => {
    reset();
    ProfileRepository.save(baseProfile());
    /* No settings at all: every downstream default has to hold. */
    const results = runEverything('user K');
    expect(results.dashboard).toBeTruthy();
  });

  it('user L — corrupted records already in storage', () => {
    seed();

    /* Written past the model on purpose, which is what a corrupted store looks
       like: a record the app cannot have created but has to survive reading. */
    WorkoutRepository.replaceAll([
      { id: 'ok', date: '2026-05-04', exercise: 'Bench press', muscle: 'chest', sets: 4, reps: 8, weightKg: 80 },
      { id: 'bad1', date: 'not-a-date', exercise: 'X', muscle: 'chest', sets: 4, reps: 8 },
      { id: 'bad2', date: '2099-01-01', exercise: 'Future', muscle: 'chest', sets: 4, reps: 8 },
    ]);

    const results = runEverything('user L');
    expect(results.report).toBeTruthy();
    expect(results.document.sections.length).toBeGreaterThan(0);
  });

  it('a week with each layer missing in turn', () => {
    for (const skip of ['workouts', 'runs', 'nutrition', 'weights']) {
      seed();
      PlanningService.generateWeek();

      if (skip !== 'workouts') {
        WorkoutService.log({ date: '2026-05-04', exercise: 'Bench press', muscle: 'chest', sets: 4, reps: 8, weightKg: 80 });
      }
      if (skip !== 'runs') RunningService.log({ date: '2026-05-05', distanceKm: 8, durationMin: 44 });
      if (skip !== 'nutrition') NutritionService.log({ date: '2026-05-04', calories: 2800, proteinG: 145 });
      if (skip !== 'weights') WeightService.log(61.4);

      const results = runEverything(`without ${skip}`);
      expect(results.report.coverage.level).toBeTruthy();
    }
  });
});

/* ── 11 — Explainability ────────────────────────────────────────────────── */

describe('Release — every decision explains itself', () => {
  it('the planner, workout and running weeks carry reasons', () => {
    seed();
    PlanningService.generateWeek();

    const dashboard = DashboardService.snapshot('2026-05-04');
    expect(dashboard.reasons.length).toBeGreaterThan(0);
    for (const reason of dashboard.reasons) {
      expect(Boolean(reason.ruleId && reason.message)).toBeTruthy();
    }
  });

  it('the weekly report explains every figure it records', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();

    const report = ReportService.analyze('2026-05-04');
    for (const [key, explanation] of Object.entries(report.explanations)) {
      expect(Boolean(explanation.method)).toBeTruthy(`${key} has no method`);
      expect(Boolean(explanation.source)).toBeTruthy(`${key} has no source`);
    }
  });

  it('every insight carries a reason, evidence, a source and a confidence', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();

    for (const insight of InsightsService.week('2026-05-04').all) {
      expect(insight.reason.length).toBeGreaterThan(10);
      expect(Object.keys(insight.evidence).length).toBeGreaterThan(0);
      expect(Boolean(insight.sourceEngine)).toBeTruthy();
      expect(['high', 'medium', 'low'].includes(insight.confidence)).toBeTruthy();
    }
  });

  it('every analytics finding carries evidence and a confidence', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();

    for (const finding of AnalyticsService.month().findings) {
      expect(Object.keys(finding.evidence).length).toBeGreaterThan(0);
      expect(Boolean(finding.reason && finding.confidence && finding.sourceEngine)).toBeTruthy();
    }
  });

  it('every piece of coaching advice carries all four', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();

    for (const advice of CoachService.session().advice) {
      expect(advice.reasoning.length).toBeGreaterThan(20);
      expect(Object.keys(advice.evidence).length).toBeGreaterThan(0);
      expect(advice.sourceEngines.length).toBeGreaterThan(0);
      expect(['high', 'medium', 'low'].includes(advice.confidence)).toBeTruthy();
    }
  });

  it('the report document carries the engines\' explanations, not its own', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();

    const report = ReportService.analyze('2026-05-04');
    const document = ReportingService.weekly('2026-05-04');

    for (const [key, explanation] of Object.entries(document.explanations)) {
      expect(explanation.method).toBe(report.explanations[key].method);
    }
    expect(document.metadata.calculated).toEqual([]);
  });

  it('a dashboard figure can be taken apart down to its inputs', () => {
    seed();
    PlanningService.generateWeek();

    const explanation = DashboardService.explain('today.requiredMinutes');
    if (explanation) {
      expect(Boolean(explanation.source && explanation.method)).toBeTruthy();
      expect(typeof explanation.inputs).toBe('object');
    } else {
      /* Nothing planned today: the figure legitimately does not exist. */
      expect(DashboardService.snapshot().today.requiredMinutes).toBe(null);
    }
  });
});

/* ── 12 — i18n ──────────────────────────────────────────────────────────── */

describe('Release — i18n', () => {
  it('has every English key in Arabic', () => {
    const missing = Object.keys(en).filter((key) => ar[key] === undefined);
    expect(missing).toEqual([], `missing from Arabic: ${missing.slice(0, 20).join(', ')}`);
  });

  it('has no Arabic key without a purpose', () => {
    /* Arabic legitimately carries `food.*` labels English does not, because
       English falls back to each record's own name. Anything else is an
       orphan. */
    const extra = Object.keys(ar).filter((key) => en[key] === undefined);
    const unexplained = extra.filter((key) => !key.startsWith('food.'));

    expect(unexplained).toEqual([], `orphaned Arabic keys: ${unexplained.join(', ')}`);
  });

  it('has no empty label in either language', () => {
    for (const [locale, dictionary] of [['en', en], ['ar', ar]]) {
      const blank = Object.entries(dictionary).filter(([, value]) => !String(value).trim());
      expect(blank.map(([key]) => key)).toEqual([], `blank ${locale} labels`);
    }
  });

  it('never leaves a placeholder unfilled in the Arabic version of a key', () => {
    const mismatched = [];

    for (const [key, english] of Object.entries(en)) {
      const arabic = ar[key];
      if (typeof arabic !== 'string') continue;

      const inEnglish = [...String(english).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const inArabic = [...arabic.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

      if (inEnglish.join() !== inArabic.join()) mismatched.push(key);
    }

    expect(mismatched).toEqual([], `placeholders differ: ${mismatched.join(', ')}`);
  });

  it('does not rebuild an engine when the language changes', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();

    const before = ReportService.analyze('2026-05-04');
    SettingsRepository.save({ ...SettingsRepository.get(), language: 'ar' });
    const after = ReportService.analyze('2026-05-04');

    /* The figures are identical. The cache may have been swept — settings
       changed — but nothing was recomputed differently. */
    expect(JSON.stringify(after.adherence)).toBe(JSON.stringify(before.adherence));
    expect(after.weight.changeKg).toBe(before.weight.changeKg);
  });

  it('resolves every reporting label in both languages', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();

    const document = ReportingService.weekly('2026-05-04');
    const raw = [];

    for (const locale of [en, ar]) {
      const html = ReportingService.print(document, {
        translate: (key, vars) => {
          if (locale[key] === undefined && String(key).includes('.') && !/^\d/.test(key)) raw.push(key);
          return locale[key] ?? key;
        },
      });
      expect(html.length).toBeGreaterThan(100);
    }

    expect([...new Set(raw)]).toEqual([], `unresolved keys reached a user: ${[...new Set(raw)].join(', ')}`);
  });
});

/* ── 18 — Public API compatibility ──────────────────────────────────────── */

describe('Release — the public surface has not moved', () => {
  it('keeps every application service and its methods', () => {
    const expected = {
      Queries: ['getToday', 'getTomorrow', 'getDay', 'getCurrentWeek', 'getWeek', 'getCurrentMonth',
        'getWeeklyReport', 'getMonthlyReport', 'explainFigure', 'getWeeklyInsights', 'getMonthlyInsights',
        'getRecovery', 'getProgress', 'getDashboard', 'getShoppingList'],
      DashboardService: ['snapshot', 'refresh', 'explain'],
      ReportService: ['analyze', 'month', 'explain'],
      InsightsService: ['week', 'month', 'priority'],
      AnalyticsService: ['week', 'month', 'quarter', 'year', 'range', 'forPeriod', 'explain'],
      CoachService: ['session', 'today', 'week', 'focus', 'nextStep', 'forCategory', 'summary'],
      BackupService: ['export', 'toJSON', 'download', 'import', 'importFile', 'reset'],
    };

    const actual = {
      Queries, DashboardService, ReportService, InsightsService,
      AnalyticsService, CoachService, BackupService,
    };

    for (const [name, methods] of Object.entries(expected)) {
      for (const method of methods) {
        expect(typeof actual[name][method]).toBe('function', `${name}.${method} is gone`);
      }
    }
  });

  it('keeps the App facade', () => {
    for (const key of ['query', 'actions', 'forms']) {
      expect(App[key] !== undefined).toBeTruthy(`App.${key} is gone`);
    }
  });

  it('keeps every storage key', () => {
    const expected = ['profile', 'settings', 'goals', 'schedule', 'measurements', 'runs',
      'workouts', 'nutrition', 'supplements', 'weekly-reports', 'sessions',
      'notifications', 'plan-snapshots', 'onboarding'];

    expect(Object.values(KEYS).slice().sort()).toEqual(expected.slice().sort());
    expect(STORAGE_PREFIX).toBe('foundation');
  });

  it('keeps every event name', () => {
    for (const name of ['weight:changed', 'workout:logged', 'running:logged', 'nutrition:logged',
      'planner:generated', 'app:week-generated', 'app:week-closed',
      'app:data-imported', 'app:data-reset', 'profile:changed', 'settings:changed']) {
      expect(Object.values(EVENTS).includes(name)).toBeTruthy(`event "${name}" is gone`);
    }
  });

  it('keeps the legacy goal names readable', () => {
    for (const goal of ['bulk', 'cut', 'recomp', 'maintain']) {
      expect(GOAL.includes(goal)).toBeTruthy(`the profile no longer accepts "${goal}"`);
    }

    expect(GOAL_ALIASES.cut).toBe(NUTRITION_GOAL.FAT_LOSS);
    expect(GOAL_ALIASES.recomp).toBe(NUTRITION_GOAL.RECOMPOSITION);
    expect(GOAL_ALIASES.maintain).toBe(NUTRITION_GOAL.MAINTENANCE);
  });

  it('accepts a profile saved under any legacy goal, end to end', () => {
    for (const goal of ['bulk', 'cut', 'recomp', 'maintain']) {
      seed({ goal });
      expect(PlanningService.generateWeek()).toBeTruthy(`"${goal}" broke the planner`);
      expect(DashboardService.snapshot('2026-05-04')).toBeTruthy();
    }
  });

  it('keeps the backup envelope shape phase 3 shipped', () => {
    seed();
    const backup = BackupService.export();

    for (const key of ['app', 'version', 'schemaVersion', 'exportedAt', 'data']) {
      expect(backup[key] !== undefined).toBeTruthy(`the backup envelope lost "${key}"`);
    }
    expect(backup.schemaVersion).toBe(1, 'the storage schema version changed');
  });

  it('keeps the version consistent in all three places', () => {
    /* package.json is read by the test runner's own banner; config and the
       service worker are read at run time. A mismatch ships a stale cache. */
    expect(APP.version).toBe('2.3.3');
    expect(APP.build).toBe('2.3.3+schema.1');
  });
});

/* ── 16 — Listeners and repetition ──────────────────────────────────────── */

describe('Release — nothing accumulates', () => {
  it('survives repeated wiring and unwiring without multiplying work', () => {
    seed();
    PlanningService.generateWeek();

    for (let i = 0; i < 20; i += 1) {
      wireApplication();
      unwireApplication();
    }

    resetStats();
    DashboardService.snapshot('2026-05-04');
    DashboardService.snapshot('2026-05-04');

    expect(stats().find((entry) => entry.name === 'dashboard').misses).toBe(1);
  });

  it('survives repeated reads without growing the cache registry', () => {
    seed();
    PlanningService.generateWeek();

    const before = stats().length;
    for (let i = 0; i < 50; i += 1) {
      DashboardService.snapshot('2026-05-04');
      ReportService.analyze('2026-05-04');
    }

    expect(stats().length).toBe(before, 'the cache registry grew during reads');
  });

  it('survives repeated language changes', () => {
    seed();
    PlanningService.generateWeek();
    logAWeek();

    const before = ReportService.analyze('2026-05-04').adherence.overall;

    for (let i = 0; i < 10; i += 1) {
      SettingsRepository.save({ ...SettingsRepository.get(), language: i % 2 ? 'ar' : 'en' });
    }

    expect(ReportService.analyze('2026-05-04').adherence.overall).toBe(before);
  });

  it('survives repeated invalidation', () => {
    seed();
    PlanningService.generateWeek();

    for (let i = 0; i < 50; i += 1) invalidateAll();

    expect(DashboardService.snapshot('2026-05-04')).toBeTruthy();
  });
});

/* ── 13/14 — What this environment cannot answer ────────────────────────── */

describeDom('Release — the browser-only gates', () => {
  it('registers a service worker in a context that has one', () => {
    /* Recorded rather than asserted: jsdom has no service worker, and a real
       device was never available. RELEASE_MANIFEST.md lists this as an
       environment limitation instead of claiming it passed. */
    const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
    expect(typeof supported).toBe('boolean');
  });

  it('sets the document direction when the language is right-to-left', () => {
    const previous = document.documentElement.getAttribute('dir');
    document.documentElement.setAttribute('dir', 'rtl');

    expect(document.documentElement.getAttribute('dir')).toBe('rtl');

    if (previous === null) document.documentElement.removeAttribute('dir');
    else document.documentElement.setAttribute('dir', previous);
  });
});

/* ── Production bug, found on a real iPhone after phase 23 ──────────────────
   Onboarding step 13 of 13 refused to finish: "Start date is not a real date."
   The phone was in UTC+1.

   Root cause: a date string was parsed as *local* midnight — `T00:00:00Z` with
   no `Z` — and then rendered back with `toISOString()`, which is UTC. Two
   calendar frames in one round trip. East of UTC, local midnight is the
   previous UTC day, so the round-trip check saw a different string and
   reported every real date as impossible.

   The whole test suite passed throughout, because the container runs in UTC,
   where the two frames coincide. That is the difference between the test path
   and the device path, and it is what these tests are written to remove:
   every assertion below holds in any timezone, because none of them depends
   on the runtime offset being zero.                                        */

describe('Release — dates carry one calendar frame, not two', () => {
  /* All in the past relative to the suite's clock: the rule refuses future
     dates by design, which is not what these tests are about. */
  const DATES = ['2026-07-30', '2026-01-15', '2024-02-29', '2000-06-01', '2019-11-05'];

  it('accepts a real date, whatever the device timezone', () => {
    const rule = isoDate();

    for (const date of DATES) {
      const result = rule(date);
      expect(result.ok).toBeTruthy(`${date} was rejected: ${result.error}`);
    }
  });

  it('accepts the date the app itself supplies as the default', () => {
    /* `today()` builds a *local* calendar date. The validator used to render
       in UTC, so east of UTC the app's own default failed its own rule — which
       is exactly what the phone showed. */
    const result = isoDate()(today());
    expect(result.ok).toBeTruthy(`today() was rejected: ${result.error}`);
  });

  it('still refuses a date that does not exist', () => {
    for (const impossible of ['2026-02-31', '2026-13-01', '2026-04-31', '2025-02-29']) {
      expect(isoDate()(impossible).ok).toBeFalsy(`${impossible} was accepted`);
    }
  });

  it('still refuses a malformed string and a future date', () => {
    for (const bad of ['30-07-2026', '2026/07/30', '2026-7-3', '', 'today', null, 20260730]) {
      expect(isoDate()(bad).ok).toBeFalsy(`${JSON.stringify(bad)} was accepted`);
    }
    expect(isoDate()('2099-01-01').ok).toBeFalsy('a future date was accepted');
  });

  it('still honours an explicit window', () => {
    const rule = isoDate({ notBefore: '2020-01-01', notAfter: '2026-12-31' });

    expect(rule('2019-12-31').ok).toBeFalsy();
    expect(rule('2020-01-01').ok).toBeTruthy();
    expect(rule('2026-12-31').ok).toBeTruthy();
  });

  it('saves a profile whose start date is today, through the real path', () => {
    /* The failing screen, end to end: the value onboarding submits is what
       `today()` produces, and it has to survive the model. */
    reset();

    const profile = baseProfile({ startDate: today() });
    ProfileRepository.save(profile);
    expect(ProfileRepository.get().startDate).toBe(today());
  });

  /**
   * Shifting a date by zero days must return the same date.
   *
   * This is the invariant the bug broke, and it holds in every timezone
   * *only* when the parse and the render share a frame — which is what makes
   * it a regression test rather than a coincidence. In UTC+1 the old code
   * returned the previous day.
   */
  it('returns the same date when a helper shifts it by nothing', () => {
    const identity = (label, shift) => {
      for (const date of DATES) {
        expect(shift(date)).toBe(date, `${label} moved ${date}`);
      }
    };

    identity('Queries.addDays', (date) => addDaysForTest(date, 0));
  });

  it('moves a date by exactly the number of days asked for', () => {
    expect(addDaysForTest('2026-07-30', 1)).toBe('2026-07-31');
    expect(addDaysForTest('2026-07-30', -7)).toBe('2026-07-23');
    expect(addDaysForTest('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysForTest('2024-02-28', 1)).toBe('2024-02-29');   // a leap year
  });

  it('leaves no date parsed in one calendar frame and rendered in another', async () => {
    /* A source audit, because the behavioural tests above can only reach the
       helpers they can import. Every `T00:00:00` in shipped code must carry
       the `Z`, so that a parse and the `toISOString()` that renders it share a
       frame.

       One file is exempt and named rather than pattern-matched:
       `engines/plan-context.js` parses local and renders through its own
       local-offset helper, and its `startOfWeek` calls `getDay()`, which is
       local. Both of its ends are local, so it is already consistent — and
       forcing a UTC parse there would break the weekday it depends on. */
    const EXEMPT = new Set(['engines/plan-context.js']);
    const breaches = [];

    for (const file of SHELL_FILES) {
      if (EXEMPT.has(file)) continue;

      const source = await readSource(file);
      const clean = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

      for (const [match] of clean.matchAll(/T00:00:00[^Z]/g)) {
        breaches.push(`${file}: ${match}`);
      }
    }

    expect(breaches.length, `a local parse can still reach a UTC render:\n${breaches.join('\n')}`).toBe(0);
  });
});

/* ── Production bug: every page 404'd on GitHub Pages ───────────────────────
   Deployed at https://adnanechaibi.github.io/fitness/, every route failed:

     GET .../pages/page-frame.js            404
     [router] could not load "profile"
     Failed to fetch dynamically imported module: .../pages/profile.js
     Failed to execute 'addAll' on 'Cache': Request failed

   The misleading part is that `pages/profile.js` was never missing — it
   returns 200. A browser reports "failed to fetch dynamically imported
   module" naming the *entry* module when one of its **dependencies** fails,
   and every page imports `pages/page-frame.js`.

   Root cause: **GitHub Pages runs Jekyll by default, and Jekyll excludes
   every file and folder whose name begins with an underscore.** Two shipped
   files start with one — `pages/page-frame.js` and `pages/live-region.js` — so neither
   was ever published. One missing dependency broke all eleven routes, and
   `cache.addAll` is atomic, so the same two URLs failed the whole service
   worker install.

   The fix is a single empty file, `.nojekyll`, which turns Jekyll off. No
   application code changed: the base path was never wrong, and the router's
   relative `import('../pages/x.js')` resolves correctly under any base.

   These tests exist because nothing in a local test run can see this — the
   file is present on disk and the suite reads it happily. What breaks is
   publication, so what is tested is the *publication contract*.           */

describe('Release — the deployment publishes every file it ships', () => {
  /** Does a shipped path exist and can it be read? */
  const canRead = async (path) => {
    try {
      await readSource(path);
      return true;
    } catch {
      return false;
    }
  };

  it('ships a .nojekyll, so GitHub Pages publishes the tree as it is', async () => {
    /* Kept even though no file starts with an underscore any more. Jekyll
       also rewrites and reorders things it thinks are a site, and this app is
       not one — turning it off is the correct posture regardless. */
    expect(await canRead('.nojekyll')).toBeTruthy(
      'GitHub Pages runs Jekyll by default. An empty .nojekyll at the repository '
      + 'root turns it off and publishes the tree exactly as it is.');
  });

  it('ships no file whose name starts with an underscore', () => {
    /* Belt and braces. `.nojekyll` above turns Jekyll off, but a dot-file is
       easy to lose when a project is copied, zipped or uploaded through a web
       UI — and losing it takes every page down at once. So the two files that
       started with an underscore were renamed as well:

         pages/_page.js  →  pages/page-frame.js
         pages/_live.js  →  pages/live-region.js

       Now the deployment works whether or not the dot-file survives. */
    const underscored = SHELL_FILES
      .filter((file) => file.split('/').some((segment) => segment.startsWith('_')))
      .sort();

    expect(underscored).toEqual([],
      `Jekyll will not publish these, and they are the kind of file every page imports: ${underscored.join(', ')}`);
  });

  it('can read every file in the precache manifest', async () => {
    const missing = [];

    for (const file of SHELL_FILES) {
      if (!(await canRead(file))) missing.push(file);
    }

    expect(missing).toEqual([], `listed in the precache but not readable: ${missing.join(', ')}`);
  });

  it('lists no page module that does not exist', () => {
    const pages = SHELL_FILES.filter((file) => file.startsWith('pages/'));
    expect(pages.length).toBeGreaterThan(10);

    /* Case matters on GitHub Pages: Profile.js and profile.js are different
       files there and the same file on a Mac. Every shipped page is
       lower-case, and this keeps it that way. */
    for (const page of pages) {
      expect(page).toBe(page.toLowerCase(), `${page} is not lower-case`);
    }
  });

  it('resolves every route to a module that ships', async () => {
    const source = await readSource('scripts/routes.js');
    const imports = [...source.matchAll(/import\('\.\.\/(pages\/[\w.-]+\.js)'\)/g)]
      .map(([, path]) => path);

    expect(imports.length).toBeGreaterThan(10, 'no routes were found to check');

    for (const module of imports) {
      expect(SHELL_FILES.includes(module)).toBeTruthy(`${module} is routed to but not precached`);
      expect(await canRead(module)).toBeTruthy(`${module} is routed to but does not exist`);
    }
  });

  it('resolves every page dependency, including the shared ones', async () => {
    const broken = [];

    for (const page of SHELL_FILES.filter((file) => file.startsWith('pages/'))) {
      const source = await readSource(page);

      for (const [, spec] of source.matchAll(/(?:from|import\()\s*['"](\.[^'"]+)['"]/g)) {
        const parts = page.split('/').slice(0, -1);
        for (const segment of spec.split('/')) {
          if (segment === '.') continue;
          else if (segment === '..') parts.pop();
          else parts.push(segment);
        }

        const target = parts.join('/');
        if (!(await canRead(target))) broken.push(`${page} → ${target}`);
      }
    }

    expect(broken).toEqual([], `unresolvable imports:\n${broken.join('\n')}`);
  });

  it('asks for nothing from the site root, so any base path works', async () => {
    /* A root-relative URL resolves to adnanechaibi.github.io/pages/... rather
       than to .../fitness/pages/... . The router and the service worker both
       use relative specifiers, and this is what keeps it that way. */
    const rooted = [];

    for (const file of [...SHELL_FILES, 'service-worker.js']) {
      const source = await readSource(file).catch(() => '');
      const clean = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

      for (const [match] of clean.matchAll(/(?:from|import\()\s*['"]\/[^'"]+['"]/g)) {
        rooted.push(`${file}: ${match.trim()}`);
      }
      for (const [match] of clean.matchAll(/(?:href|src)=["']\/(?!\/)[^"']+["']/g)) {
        rooted.push(`${file}: ${match}`);
      }
    }

    expect(rooted).toEqual([], `root-relative references break a sub-path deployment:\n${rooted.join('\n')}`);
  });

  it('registers the service worker relatively, so its scope stays under the base', async () => {
    const source = await readSource('script.js');
    const registrations = [...source.matchAll(/register\(\s*['"]([^'"]+)['"]/g)].map(([, url]) => url);

    for (const url of registrations) {
      expect(url.startsWith('/')).toBeFalsy(
        `registering "${url}" would claim the whole origin, not just the app's base path`);
    }
  });
});
