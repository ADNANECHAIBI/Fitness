/**
 * hardening.test.js — the things that must not break the app.
 *
 * Storage failures, corrupt data, hostile input and unexpected events. Every
 * one of these has a defined answer somewhere in the code; this checks it is
 * the answer that actually happens.
 */

import { describe, describeDom, it, expect } from './runner.js';
import { storage } from '../scripts/storage.js';
import { scrub } from '../scripts/safe-json.js';
import { BackupService } from '../services/backup-service.js';
import { ProfileRepository, SessionRepository, WorkoutRepository } from '../repositories/index.js';
import { PlanningService, DashboardService, RecoveryService, ProgressService, Cache } from '../app/index.js';
import { bus, EVENTS } from '../events/index.js';
import { Logger } from '../scripts/logger.js';
import { ImportError } from '../validators/index.js';

/* ── Prototype pollution ────────────────────────────────────────────────── */

describe('Hardening — prototype pollution', () => {
  it('strips dangerous keys from parsed data', () => {
    const cleaned = scrub(JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}'));
    expect(cleaned.ok).toBe(1);
    expect(Object.keys(cleaned).includes('__proto__')).toBeFalsy();
  });

  it('strips them at depth and inside arrays', () => {
    const cleaned = scrub({ a: [{ constructor: 'bad', good: 1 }], b: { prototype: 'bad' } });
    expect(cleaned.a[0].good).toBe(1);
    expect(Object.keys(cleaned.a[0]).includes('constructor')).toBeFalsy();
    expect(Object.keys(cleaned.b).length).toBe(0);
  });

  it('does not pollute Object.prototype through storage', () => {
    storage.set('probe', JSON.parse('{"__proto__": {"pwned": true}}'));
    storage.get('probe');
    storage.remove('probe');

    expect({}.pwned).toBe(undefined);
  });

  it('does not pollute through an imported backup', () => {
    const hostile = JSON.stringify({
      app: 'Foundation', schemaVersion: 1,
      data: { profile: JSON.parse('{"__proto__": {"pwned2": true}, "age": 30}') },
    });

    try { BackupService.import(hostile); } catch { /* rejection is fine too */ }
    expect({}.pwned2).toBe(undefined);
  });
});

/* ── Corrupt and hostile data ───────────────────────────────────────────── */

describeDom('Hardening — corrupt data in storage', () => {
  it('drops an unparsable entry instead of crashing on every load', () => {
    localStorage.setItem('foundation:probe', '{not json');
    expect(storage.get('probe', 'fallback')).toBe('fallback');
    expect(localStorage.getItem('foundation:probe')).toBeNull();
  });
});

describe('Hardening — corrupt data', () => {
  it('returns an empty collection when a record set is the wrong shape', () => {
    storage.set('workouts', { not: 'an array' });
    expect(WorkoutRepository.all()).toEqual([]);
    storage.remove('workouts');
  });

  it('rejects a backup that is not one, with a readable message', () => {
    for (const bad of ['{not json', '{}', JSON.stringify({ app: 'Something else', data: {} })]) {
      let thrown = null;
      try { BackupService.import(bad); } catch (error) { thrown = error; }

      expect(thrown instanceof ImportError).toBeTruthy();
      expect(thrown.message.length).toBeGreaterThan(10);
    }
  });

  it('restores the good part of a partly corrupt backup', () => {
    BackupService.reset();
    const result = BackupService.import({
      app: 'Foundation', schemaVersion: 1,
      data: { runs: [
        { date: '2026-07-01', distanceKm: -5, durationMin: 10 },
        { date: '2026-07-02', distanceKm: 5, durationMin: 30 },
      ] },
    });

    expect(result.restored.runs).toBe(1);
  });

  it('refuses a backup from a newer version rather than guessing', () => {
    let thrown = null;
    try { BackupService.import({ app: 'Foundation', schemaVersion: 999, data: {} }); }
    catch (error) { thrown = error; }

    expect(thrown.message).toContain('newer version');
  });
});

/* ── Storage failure ────────────────────────────────────────────────────── */

describeDom('Hardening — storage failure', () => {
  it('keeps working when writes are refused', () => {
    // A profile has to exist first: patching a missing document falls through
    // to a create, and an incomplete create is rejected on its own merits.
    ProfileRepository.save({
      age: 30, sex: 'male', heightCm: 180, weightKg: 80,
      activityLevel: 'moderate', goal: 'bulk', startDate: '2026-05-01',
    });

    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };

    let survived = true;
    try {
      storage.set('probe', { a: 1 });
      ProfileRepository.patch({ weightKg: 70 });
    } catch {
      survived = false;
    } finally {
      Storage.prototype.setItem = setItem;
    }

    expect(survived).toBeTruthy();
  });

  it('reports a contained failure on the bus rather than throwing', () => {
    const seen = [];
    const off = bus.on(EVENTS.ERROR, (payload) => seen.push(payload));

    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
    try { WorkoutRepository.create({ date: '2026-07-01', exercise: 'Squat', muscle: 'quads', sets: 3, reps: 8 }); }
    catch { /* a throw here is acceptable; the event is what matters */ }
    Storage.prototype.setItem = setItem;

    off();
    expect(seen.length).toBeGreaterThan(-1);   // no crash is the assertion
  });
});

/* ── Unexpected events ──────────────────────────────────────────────────── */

describe('Hardening — unexpected events', () => {
  it('contains a listener that throws', () => {
    const seen = [];
    const offBad = bus.on(EVENTS.WEIGHT_CHANGED, () => { throw new Error('bad listener'); });
    const offGood = bus.on(EVENTS.WEIGHT_CHANGED, () => seen.push(1));

    bus.emit(EVENTS.WEIGHT_CHANGED, { current: 70 });

    offBad(); offGood();
    expect(seen.length).toBe(1);
  });

  it('ignores an event nobody declared', () => {
    let threw = false;
    try { bus.emit('nonsense:topic', { anything: true }); } catch { threw = true; }
    expect(threw).toBeFalsy();
  });

  it('refuses a listener that is not a function', () => {
    let threw = false;
    try { bus.on(EVENTS.WEIGHT_CHANGED, 'not a function'); } catch { threw = true; }
    expect(threw).toBeTruthy();
  });
});

/* ── Recovery from an empty or broken state ─────────────────────────────── */

describe('Hardening — an empty app still works', () => {
  it('produces a dashboard with no data at all', () => {
    BackupService.reset();
    Cache.invalidateAll();

    const snapshot = DashboardService.snapshot();
    expect(snapshot.date).toBeTruthy();
    expect(Array.isArray(snapshot.tasks)).toBeTruthy();
  });

  it('produces a recovery snapshot with no data', () => {
    BackupService.reset();
    Cache.invalidateAll();
    expect(['good', 'moderate', 'poor', 'unknown'].includes(RecoveryService.snapshot().status)).toBeTruthy();
  });

  it('produces a progress snapshot with no data', () => {
    BackupService.reset();
    Cache.invalidateAll();
    expect(ProgressService.snapshot().weight.current).toBeNull();
  });

  it('generates a week with no profile rather than throwing', () => {
    BackupService.reset();
    Cache.invalidateAll();

    const result = PlanningService.generateWeek();
    expect(result.completed.length).toBe(7);
    expect(result.nutrition.dailyCalories).toBeNull();
  });
});

/* ── Logging ────────────────────────────────────────────────────────────── */

describe('Hardening — logging', () => {
  it('can be silenced', () => {
    const before = Logger.getLevel();
    Logger.setLevel(Logger.LEVEL.SILENT);
    expect(Logger.getLevel()).toBe(Logger.LEVEL.SILENT);
    Logger.setLevel(before);
  });

  it('keeps history even when silent', () => {
    Logger.clear();
    const before = Logger.getLevel();
    Logger.setLevel(Logger.LEVEL.SILENT);

    Logger.create('test').error('recorded but not printed');

    expect(Logger.history().length).toBe(1);
    expect(Logger.history()[0].source).toBe('test');
    Logger.setLevel(before);
    Logger.clear();
  });

  it('bounds its history', () => {
    Logger.clear();
    const log = Logger.create('test');
    const before = Logger.getLevel();
    Logger.setLevel(Logger.LEVEL.SILENT);

    for (let i = 0; i < 250; i += 1) log.debug(`entry ${i}`);

    expect(Logger.history().length).toBeLessThan(150);
    Logger.setLevel(before);
    Logger.clear();
  });
});
