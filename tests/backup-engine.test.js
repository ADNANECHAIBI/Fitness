/**
 * backup-engine.test.js — phase 20.
 *
 * A backup is the one feature where being wrong is unrecoverable: everything
 * else in this app can be recalculated, and a botched import cannot. So these
 * tests are almost entirely about refusal and reversal —
 *
 *   • a file that fails its checks writes nothing at all, not "most of it",
 *   • a failure partway through puts back exactly what was there,
 *   • a dry run leaves storage and every cache untouched,
 *   • a partial backup never wipes the sections it does not carry,
 *   • the section list and the repository registry cannot drift apart.
 *
 * The last one is a test rather than a comment because the two lists live in
 * different layers by design — the engine may not import repositories — and a
 * repository added without a matching section would otherwise vanish from
 * every backup silently.
 */

import { describe, it, expect } from './runner.js';
import { BackupEngine, IMPORT_INTENT } from '../engines/backup-engine.js';
import {
  SECTIONS, SECTION_NAMES, BACKUP_SCOPE, IMPORT_MODE, sectionsFor, fieldsOf,
} from '../engines/backup-schema.js';
import {
  checkEnvelope, checkSection, checkIntegrity, SEVERITY, CHECKS,
} from '../engines/backup-validation.js';
import { migrate, canMigrate, MIGRATIONS } from '../engines/backup-migration.js';

import { BackupService } from '../services/backup-service.js';
import { PlanningService } from '../app/planning-service.js';
import { Cache, invalidateAll, stats, resetStats } from '../app/cache.js';
import { DashboardService } from '../app/dashboard-service.js';
import {
  ALL_REPOSITORIES, ProfileRepository, SettingsRepository,
  WorkoutRepository, RunningRepository, NutritionRepository,
} from '../repositories/index.js';
import { unwireApplication } from '../app/wiring.js';
import { ImportError } from '../validators/index.js';
import { APP } from '../scripts/config.js';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const APP_IDENTITY = {
  name: APP.name, version: APP.version, build: APP.build, schemaVersion: APP.schemaVersion,
};

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

  WorkoutRepository.create({ date: '2026-05-04', exercise: 'Bench press', muscle: 'chest', sets: 4, reps: 8, weightKg: 80 });
  WorkoutRepository.create({ date: '2026-05-06', exercise: 'Squat', muscle: 'quads', sets: 4, reps: 6, weightKg: 110 });
  RunningRepository.create({ date: '2026-05-05', distanceKm: 8, durationMin: 44 });
  NutritionRepository.create({ date: '2026-05-04', calories: 2800, proteinG: 140 });
}

function resetCaches() {
  unwireApplication();
  invalidateAll();
  resetStats();
}

/**
 * Run something with one repository's `replaceAll` replaced.
 *
 * A repository is frozen, so it cannot be patched in place. The registry
 * entry that holds it is not, so the whole repository is swapped for a copy
 * and put back afterwards — which is how a storage failure partway through an
 * import can be reached deliberately rather than waited for.
 */
function withFailing(section, replaceAll, body) {
  const entry = ALL_REPOSITORIES[section];
  const original = entry.repo;

  try {
    entry.repo = Object.freeze({ ...original, replaceAll });
    return body();
  } finally {
    entry.repo = original;
  }
}

/** A backup built by hand, for feeding the engine directly. */
const fileWith = (data, overrides = {}) => ({
  app: APP.name,
  version: APP.version,
  build: APP.build,
  schemaVersion: APP.schemaVersion,
  createdAt: '2026-07-01T00:00:00.000Z',
  data,
  ...overrides,
});

const planFor = (backup, options = {}) => BackupEngine.plan({
  backup, app: APP_IDENTITY, ...options,
});

const errorChecks = (plan) => plan.errors.map((item) => item.check);
const warningChecks = (plan) => plan.warnings.map((item) => item.check);

/* ── The two lists must agree ───────────────────────────────────────────── */

describe('Backup schema — one list of sections, in two layers', () => {
  it('names exactly the repositories the app has', () => {
    expect(SECTION_NAMES.slice().sort()).toEqual(Object.keys(ALL_REPOSITORIES).slice().sort());
  });

  it('agrees with each repository about document versus collection', () => {
    for (const [name, definition] of Object.entries(SECTIONS)) {
      expect(definition.kind).toBe(ALL_REPOSITORIES[name].kind, `${name} disagrees`);
    }
  });

  it('gives every section a model and a label', () => {
    for (const [name, definition] of Object.entries(SECTIONS)) {
      expect(Boolean(definition.model?.schema)).toBeTruthy(`${name} has no model`);
      expect(Boolean(definition.label)).toBeTruthy(`${name} has no label`);
    }
  });

  it('counts id and the timestamps as known fields', () => {
    const fields = fieldsOf('workouts');
    expect(fields.includes('id')).toBeTruthy();
    expect(fields.includes('createdAt')).toBeTruthy();
    expect(fields.includes('exercise')).toBeTruthy();
  });
});

/* ── Export ─────────────────────────────────────────────────────────────── */

describe('Backup export — everything', () => {
  it('carries the envelope a reader needs', () => {
    seed(); resetCaches();
    const backup = BackupService.export();

    expect(backup.app).toBe(APP.name);
    expect(backup.version).toBe(APP.version);
    expect(backup.build).toBe(APP.build);
    expect(backup.schemaVersion).toBe(APP.schemaVersion);
    expect(Boolean(backup.createdAt)).toBeTruthy();
  });

  it('keeps the shape phase 3 shipped', () => {
    seed();
    const backup = BackupService.export();

    expect(Boolean(backup.exportedAt)).toBeTruthy();
    expect(typeof backup.data).toBe('object');
    expect(Array.isArray(backup.data.workouts)).toBeTruthy();
  });

  it('counts what it carried', () => {
    seed();
    const backup = BackupService.export();

    expect(backup.metadata.counts.workouts).toBe(2);
    expect(backup.metadata.records).toBeGreaterThan(3);
    expect(backup.metadata.sections.includes('profile')).toBeTruthy();
  });

  it('survives a round trip through JSON', () => {
    seed();
    const text = BackupService.toJSON();
    const parsed = JSON.parse(text);

    expect(parsed.data.workouts.length).toBe(2);
    expect(parsed.app).toBe(APP.name);
  });

  it('marks derived analysis as present but not restorable', () => {
    seed();
    const backup = BackupService.exportScope(BACKUP_SCOPE.FULL, { analytics: { period: 'monthly' } });

    expect(backup.derived.analytics).toBeTruthy();
    expect(backup.metadata.derivedRestorable).toBeFalsy();
    expect(backup.metadata.derivedIncluded.includes('analytics')).toBeTruthy();
  });
});

describe('Backup export — part of it', () => {
  it('a profile export carries the profile and not the training', () => {
    seed();
    const backup = BackupService.exportScope(BACKUP_SCOPE.PROFILE);

    expect(backup.data.profile).toBeTruthy();
    expect(backup.data.workouts).toBe(undefined);
    expect(backup.scope).toEqual([BACKUP_SCOPE.PROFILE]);
  });

  it('a training export carries the sets and the runs', () => {
    seed();
    const backup = BackupService.exportScope(BACKUP_SCOPE.TRAINING);

    expect(backup.data.workouts.length).toBe(2);
    expect(backup.data.runs.length).toBe(1);
    expect(backup.data.nutrition).toBe(undefined);
  });

  it('a nutrition export carries the food and not the lifting', () => {
    seed();
    const backup = BackupService.exportScope(BACKUP_SCOPE.NUTRITION);

    expect(backup.data.nutrition.length).toBe(1);
    expect(backup.data.workouts).toBe(undefined);
  });

  it('a settings export carries the settings', () => {
    seed();
    expect(BackupService.exportScope(BACKUP_SCOPE.SETTINGS).data.settings).toBeTruthy();
  });

  it('a section can be named directly', () => {
    expect(sectionsFor('runs')).toEqual(['runs']);
    expect(sectionsFor(BACKUP_SCOPE.FULL).length).toBe(SECTION_NAMES.length);
  });

  it('says in the metadata what it left out', () => {
    seed();
    const backup = BackupService.exportScope(BACKUP_SCOPE.PROFILE);
    expect(backup.metadata.omitted.includes('workouts')).toBeTruthy();
    expect(backup.metadata.reason.includes('partial')).toBeTruthy();
  });
});

/* ── Import ─────────────────────────────────────────────────────────────── */

describe('Backup import — a whole file', () => {
  it('restores everything and says what it wrote', () => {
    seed();
    const backup = BackupService.export();

    BackupService.reset();
    expect(WorkoutRepository.count()).toBe(0);

    const result = BackupService.import(backup);

    expect(result.success).toBeTruthy();
    expect(WorkoutRepository.count()).toBe(2);
    expect(result.importedItems.workouts).toBe(2);
    expect(ProfileRepository.get().goal).toBe('bulk');
  });

  it('keeps the return keys phase 3 shipped', () => {
    seed();
    const backup = BackupService.export();
    const result = BackupService.import(backup);

    expect(typeof result.restored).toBe('object');
    expect(Array.isArray(result.skipped)).toBeTruthy();
  });

  it('accepts a JSON string as readily as an object', () => {
    seed();
    const text = BackupService.toJSON();
    BackupService.reset();

    expect(BackupService.import(text).success).toBeTruthy();
    expect(WorkoutRepository.count()).toBe(2);
  });

  it('leaves a section the file never carried alone', () => {
    seed();
    const partial = BackupService.exportScope(BACKUP_SCOPE.PROFILE);

    const before = WorkoutRepository.count();
    BackupService.import(partial);

    expect(WorkoutRepository.count()).toBe(before,
      'a profile-only backup wiped the training history');
  });
});

describe('Backup import — replace and merge', () => {
  it('replace makes the file the truth', () => {
    seed();
    const backup = BackupService.export();

    WorkoutRepository.create({ date: '2026-05-08', exercise: 'Deadlift', muscle: 'quads', sets: 3, reps: 5, weightKg: 140 });
    expect(WorkoutRepository.count()).toBe(3);

    BackupService.import(backup, { mode: IMPORT_MODE.REPLACE });
    expect(WorkoutRepository.count()).toBe(2);
  });

  it('merge keeps what the file does not mention', () => {
    seed();
    const backup = BackupService.export();

    WorkoutRepository.create({ date: '2026-05-08', exercise: 'Deadlift', muscle: 'quads', sets: 3, reps: 5, weightKg: 140 });

    BackupService.merge(backup);
    expect(WorkoutRepository.count()).toBe(3,
      'merge dropped a record that was only in storage');
  });

  it('merge lets the incoming record win on a shared id', () => {
    const existing = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
    const incoming = [{ id: 'b', v: 2 }, { id: 'c', v: 1 }];
    const merged = BackupEngine.mergeRecords(existing, incoming);

    expect(merged.rows.length).toBe(3);
    expect(merged.rows.find((row) => row.id === 'b').v).toBe(2);
    expect(merged.replaced).toBe(1);
    expect(merged.added).toBe(1);
  });
});

describe('Backup import — dry run and validation only', () => {
  it('a dry run writes nothing', () => {
    seed();
    const backup = BackupService.export();
    BackupService.reset();

    const result = BackupService.dryRun(backup);

    expect(result.plan.ok).toBeTruthy();
    expect(result.plan.willWrite).toBeFalsy();
    expect(WorkoutRepository.count()).toBe(0, 'a dry run wrote to storage');
  });

  it('a dry run still says exactly what it would have done', () => {
    seed();
    const backup = BackupService.export();
    const result = BackupService.dryRun(backup);

    expect(result.plan.sections.workouts.accepted).toBe(2);
    expect(result.plan.totals.accepted).toBeGreaterThan(3);
    expect(result.intent).toBe(IMPORT_INTENT.DRY_RUN);
  });

  it('validation only runs every check and writes nothing', () => {
    seed();
    const backup = BackupService.export();
    BackupService.reset();

    const result = BackupService.validate(backup);

    expect(result.intent).toBe(IMPORT_INTENT.VALIDATE_ONLY);
    expect(result.checksRun.length).toBe(CHECKS.length);
    expect(WorkoutRepository.count()).toBe(0);
  });
});

/* ── Files that should be refused ───────────────────────────────────────── */

describe('Backup import — files that are not backups', () => {
  it('rejects text that is not JSON', () => {
    let thrown = null;
    try { BackupService.import('{ not json'); } catch (error) { thrown = error; }

    expect(thrown instanceof ImportError).toBeTruthy();
  });

  it('rejects a file from another app', () => {
    let thrown = null;
    try { BackupService.import(fileWith({}, { app: 'SomethingElse' })); } catch (error) { thrown = error; }

    expect(thrown instanceof ImportError).toBeTruthy();
  });

  it('rejects a file with no data at all', () => {
    const plan = planFor({ app: APP.name, schemaVersion: 1 });

    expect(plan.ok).toBeFalsy();
    expect(errorChecks(plan).includes('schema')).toBeTruthy();
  });

  it('rejects a file that is not an object', () => {
    expect(planFor(null).ok).toBeFalsy();
    expect(planFor([1, 2, 3]).ok).toBeFalsy();
  });

  it('says why, in words, without being asked', () => {
    const plan = planFor({ app: 'Elsewhere', data: {} });
    expect(plan.reasons[0].message.length).toBeGreaterThan(20);
  });
});

describe('Backup import — versions', () => {
  it('refuses a file from a newer schema rather than dropping what it added', () => {
    const plan = planFor(fileWith({}, { schemaVersion: APP.schemaVersion + 1 }));

    expect(plan.ok).toBeFalsy();
    expect(errorChecks(plan).includes('version')).toBeTruthy();
  });

  it('migrates a file with no version stamp forward', () => {
    const backup = fileWith({ workouts: [] });
    delete backup.schemaVersion;

    const plan = planFor(backup);

    expect(plan.ok).toBeTruthy();
    expect(plan.migration.from).toBe(0);
    expect(plan.migration.migrated).toBeTruthy();
    expect(plan.migration.applied[0].id).toBe('v0-to-v1.assume-first-schema');
  });

  it('warns that an unstamped file was assumed rather than read', () => {
    const backup = fileWith({ workouts: [] });
    delete backup.schemaVersion;

    expect(warningChecks(planFor(backup)).includes('version')).toBeTruthy();
  });

  it('does nothing to a file already at the current schema', () => {
    const plan = planFor(fileWith({ workouts: [] }));
    expect(plan.migration.migrated).toBeFalsy();
    expect(plan.migration.applied.length).toBe(0);
  });
});

/* ── Migration ──────────────────────────────────────────────────────────── */

describe('Backup migration — one step at a time', () => {
  it('declares every step with an id, a span and a sentence', () => {
    for (const step of MIGRATIONS) {
      expect(Boolean(step.id && step.describe)).toBeTruthy();
      expect(step.to).toBe(step.from + 1, `${step.id} spans more than one version`);
      expect(typeof step.apply).toBe('function');
    }
  });

  it('has a chain from the oldest supported version to the current one', () => {
    expect(canMigrate(0, APP.schemaVersion)).toBeTruthy();
  });

  it('never runs backwards', () => {
    const result = migrate({ a: 1 }, 5, 1);
    expect(result.migrated).toBeFalsy();
    expect(result.reason.includes('backwards')).toBeTruthy();
  });

  it('stops rather than guessing when a step is missing', () => {
    const result = migrate({ a: 1 }, 0, 99);
    expect(result.reason.includes('No migration exists')).toBeTruthy();
    expect(result.data).toEqual({ a: 1 });
  });

  it('is pure — the same data in, the same data out', () => {
    const data = { workouts: [{ id: 'x' }] };
    expect(migrate(data, 0, 1).data.workouts[0].id).toBe('x');
    expect(data.workouts.length).toBe(1);
  });
});

/* ── Records that should be refused ─────────────────────────────────────── */

describe('Backup validation — bad records', () => {
  it('rejects two records sharing an id, and keeps the first', () => {
    const plan = planFor(fileWith({
      workouts: [
        { id: 'dup', date: '2026-05-04', exercise: 'Bench press', muscle: 'chest', sets: 4, reps: 8 },
        { id: 'dup', date: '2026-05-05', exercise: 'Squat', muscle: 'quads', sets: 4, reps: 6 },
      ],
    }));

    expect(errorChecks(plan).includes('duplicateIds')).toBeTruthy();
    expect(plan.sections.workouts.accepted).toBe(1);
    expect(plan.sections.workouts.rejected).toBe(1);
  });

  it('rejects a record that fails its own model, and keeps the rest', () => {
    const plan = planFor(fileWith({
      workouts: [
        { date: '2026-05-04', exercise: 'Bench press', muscle: 'chest', sets: 4, reps: 8 },
        { date: '2026-05-05', exercise: 'X', muscle: 'not-a-muscle', sets: 900, reps: 8 },
      ],
    }));

    expect(errorChecks(plan).includes('invalidTypes')).toBeTruthy();
    expect(plan.sections.workouts.accepted).toBe(1);
  });

  it('rejects a date that is not a date', () => {
    const plan = planFor(fileWith({
      workouts: [{ date: '2026-13-45', exercise: 'Bench press', muscle: 'chest', sets: 4, reps: 8 }],
    }));

    expect(errorChecks(plan).includes('invalidDates')).toBeTruthy();
    expect(plan.sections.workouts.accepted).toBe(0);
  });

  it('rejects a record that is not an object', () => {
    const plan = planFor(fileWith({ workouts: [null, 'a string', 42] }));
    expect(errorChecks(plan).includes('corruptedObjects')).toBeTruthy();
    expect(plan.sections.workouts.accepted).toBe(0);
  });

  it('rejects a collection that is not a list', () => {
    const plan = planFor(fileWith({ workouts: { not: 'a list' } }));
    expect(errorChecks(plan).includes('corruptedObjects')).toBeTruthy();
  });

  it('rejects a goal the app does not know', () => {
    const plan = planFor(fileWith({
      profile: { age: 28, sex: 'male', heightCm: 186, weightKg: 70, goal: 'become_a_bird' },
    }));

    expect(errorChecks(plan).includes('invalidGoals')).toBeTruthy();
    expect(plan.sections.profile.skipped).toBeTruthy();
  });

  it('accepts a goal in either vocabulary', () => {
    for (const goal of ['cut', 'fat_loss', 'lean_bulk', 'maintain']) {
      const plan = planFor(fileWith({
        profile: { age: 28, sex: 'male', heightCm: 186, weightKg: 70, goal },
      }));
      expect(errorChecks(plan).includes('invalidGoals')).toBeFalsy(`${goal} was refused`);
    }
  });
});

describe('Backup validation — things worth saying but not refusing', () => {
  it('warns about a field the schema never declared, and keeps the record', () => {
    const plan = planFor(fileWith({
      workouts: [{
        date: '2026-05-04', exercise: 'Bench press', muscle: 'chest',
        sets: 4, reps: 8, inventedField: 'something',
      }],
    }));

    expect(warningChecks(plan).includes('unknownFields')).toBeTruthy();
    expect(plan.sections.workouts.accepted).toBe(1);
  });

  it('warns about an exercise id that is not in this build, and keeps the session', () => {
    const plan = planFor(fileWith({
      sessions: [{
        date: '2026-05-04', state: 'completed',
        exercises: [{ exerciseId: 'no-such-exercise', name: 'Ghost' }],
      }],
    }));

    expect(warningChecks(plan).includes('brokenReferences')).toBeTruthy();
    expect(plan.sections.sessions.accepted).toBe(1,
      'a session was thrown away to protect a foreign key');
  });

  it('warns about a food id that is not in this build', () => {
    const plan = planFor(fileWith({
      settings: { sleepHours: 8, excludedFoods: ['not-a-food'] },
    }));

    expect(warningChecks(plan).includes('brokenReferences')).toBeTruthy();
  });

  it('warns about an empty section, because replacing with it clears things', () => {
    const plan = planFor(fileWith({ workouts: [] }));
    expect(warningChecks(plan).includes('emptyCollections')).toBeTruthy();
  });

  it('warns about a set naming a session that is not in the file', () => {
    const findings = checkIntegrity({
      workouts: [{ id: 'a', date: '2026-05-04', sessionId: 'gone' }],
      sessions: [],
    });

    expect(findings.some((item) => item.check === 'brokenRelations')).toBeTruthy();
    expect(findings[0].severity).toBe(SEVERITY.WARNING);
  });

  it('ignores a section this build has no model for', () => {
    const result = checkSection('somethingNew', [{ a: 1 }]);
    expect(result.findings[0].severity).toBe(SEVERITY.WARNING);
    expect(result.valid.length).toBe(0);
  });
});

/* ── Nothing half-written ───────────────────────────────────────────────── */

describe('Backup import — all or nothing', () => {
  it('writes nothing when the envelope fails', () => {
    seed();
    const before = WorkoutRepository.count();

    try { BackupService.import(fileWith({ workouts: [] }, { schemaVersion: 99 })); } catch { /* expected */ }

    expect(WorkoutRepository.count()).toBe(before);
  });

  it('rolls back everything when a section cannot be written', () => {
    seed();
    const backup = BackupService.export();
    const before = {
      workouts: WorkoutRepository.count(),
      runs: RunningRepository.count(),
      goal: ProfileRepository.get().goal,
    };

    /* A section whose repository throws on write is the only way to reach a
       partial state, so it is simulated rather than waited for. The
       repositories themselves are frozen; the registry entries holding them
       are not, which is the seam. */
    const result = withFailing('nutrition', () => { throw new Error('storage is full'); },
      () => BackupService.import(backup));

    expect(result.success).toBeFalsy();
    expect(result.rolledBack).toBeTruthy();
    expect(WorkoutRepository.count()).toBe(before.workouts);
    expect(RunningRepository.count()).toBe(before.runs);
    expect(ProfileRepository.get().goal).toBe(before.goal);
  });

  it('names the section that failed and why', () => {
    seed();
    const backup = BackupService.export();

    const result = withFailing('nutrition', () => { throw new Error('storage is full'); },
      () => BackupService.import(backup));

    expect(result.failures[0].section).toBe('nutrition');
    expect(result.reason.includes('put back')).toBeTruthy();
  });

  it('treats a silent partial write as a failure', () => {
    seed();
    const backup = BackupService.export();

    /* replaceAll returns a count rather than throwing when storage refuses a
       row, so the count is what the service checks. */
    const result = withFailing('runs', () => 0, () => BackupService.import(backup));

    expect(result.success).toBeFalsy();
    expect(result.rolledBack).toBeTruthy();
  });
});

/* ── Size and emptiness ─────────────────────────────────────────────────── */

describe('Backup — the edges of size', () => {
  it('exports and re-imports an empty app', () => {
    BackupService.reset(); resetCaches();

    const backup = BackupService.export();
    expect(backup.metadata.records).toBe(0);

    const result = BackupService.import(backup);
    expect(result.success !== undefined).toBeTruthy();
    expect(WorkoutRepository.count()).toBe(0);
  });

  it('plans a large file without falling over', () => {
    const many = Array.from({ length: 2000 }, (_, index) => ({
      id: `set_${index}`,
      date: '2026-05-04',
      exercise: `Exercise ${index % 40}`,
      muscle: 'chest',
      sets: 4, reps: 8, weightKg: 60,
    }));

    const started = Date.now();
    const plan = planFor(fileWith({ workouts: many }));
    const elapsed = Date.now() - started;

    expect(plan.ok).toBeTruthy();
    expect(plan.sections.workouts.accepted).toBe(2000);
    expect(elapsed).toBeLessThan(10000);
  });

  it('finds one bad record among two thousand good ones', () => {
    const many = Array.from({ length: 2000 }, (_, index) => ({
      id: `set_${index}`, date: '2026-05-04', exercise: `Exercise ${index}`,
      muscle: 'chest', sets: 4, reps: 8,
    }));
    many[1500] = { ...many[1500], muscle: 'not-a-muscle' };

    const plan = planFor(fileWith({ workouts: many }));

    expect(plan.sections.workouts.accepted).toBe(1999);
    expect(plan.sections.workouts.rejected).toBe(1);
  });
});

/* ── Caches ─────────────────────────────────────────────────────────────── */

describe('Backup — caches', () => {
  it('a dry run invalidates nothing', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    DashboardService.snapshot();
    resetStats();

    BackupService.dryRun(BackupService.export());
    DashboardService.snapshot();

    const entry = stats().find((item) => item.name === 'dashboard');
    expect(entry.misses).toBe(0, 'a dry run cleared a cache it never wrote to');
    expect(entry.hits).toBe(1);
  });

  it('validation invalidates nothing either', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    DashboardService.snapshot();
    resetStats();

    BackupService.validate(BackupService.export());
    DashboardService.snapshot();

    expect(stats().find((item) => item.name === 'dashboard').misses).toBe(0);
  });

  it('a real import does invalidate', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    const backup = BackupService.export();
    DashboardService.snapshot();
    resetStats();

    BackupService.import(backup);
    DashboardService.snapshot();

    expect(stats().find((item) => item.name === 'dashboard').misses).toBe(1,
      'an import left a stale dashboard behind');
  });
});

/* ── Explainability ─────────────────────────────────────────────────────── */

describe('Backup — every decision says why', () => {
  it('gives an outcome the eight fields the phase asks for', () => {
    seed();
    const result = BackupService.dryRun(BackupService.export());

    for (const field of ['success', 'errors', 'warnings', 'fixedItems',
      'ignoredItems', 'importedItems', 'skippedItems', 'reason']) {
      expect(result[field] !== undefined).toBeTruthy(`${field} is missing`);
    }
    expect(typeof result.evidence).toBe('object');
  });

  it('gives every finding a check, a severity and a sentence', () => {
    const plan = planFor(fileWith({
      workouts: [{ date: 'not-a-date', exercise: 'X', muscle: 'chest', sets: 1, reps: 1 }],
    }));

    for (const item of [...plan.errors, ...plan.warnings]) {
      expect(CHECKS.includes(item.check) || item.check === 'brokenRelations' || item.check === 'duplicateRecords')
        .toBeTruthy(`${item.check} is not a declared check`);
      expect([SEVERITY.ERROR, SEVERITY.WARNING].includes(item.severity)).toBeTruthy();
      expect(item.message.length).toBeGreaterThan(20);
      expect(typeof item.evidence).toBe('object');
    }
  });

  it('explains each section it would touch', () => {
    seed();
    const plan = BackupService.dryRun(BackupService.export()).plan;

    for (const entry of Object.values(plan.sections)) {
      expect(entry.reason.length).toBeGreaterThan(20);
      expect(entry.incoming !== undefined).toBeTruthy();
    }
  });

  it('reports what it ignored rather than dropping it silently', () => {
    const result = BackupService.dryRun(fileWith({
      workouts: [{ date: '2026-05-04', exercise: 'Bench press', muscle: 'chest', sets: 4, reps: 8, ghost: 1 }],
    }));

    expect(result.ignoredItems.includes('ghost')).toBeTruthy();
  });

  it('reports a migration as a fixed item', () => {
    const backup = fileWith({ workouts: [] });
    delete backup.schemaVersion;

    expect(BackupService.dryRun(backup).fixedItems.length).toBe(1);
  });
});

/* ── The envelope check on its own ──────────────────────────────────────── */

describe('Backup validation — the envelope', () => {
  const app = { appName: APP.name, schemaVersion: APP.schemaVersion };

  it('passes a well-formed file', () => {
    expect(checkEnvelope(fileWith({}), app).filter((f) => f.severity === SEVERITY.ERROR).length).toBe(0);
  });

  it('refuses a string', () => {
    expect(checkEnvelope('a file', app)[0].severity).toBe(SEVERITY.ERROR);
  });

  it('accepts a file that does not name an app, since early exports did not', () => {
    const backup = fileWith({});
    delete backup.app;

    expect(checkEnvelope(backup, app).filter((f) => f.severity === SEVERITY.ERROR).length).toBe(0);
  });
});
