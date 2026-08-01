/** Tests for the exercise database and its query surface. */

import { describe, it, expect } from './runner.js';
import { ExerciseDB } from '../data/exercises/index.js';
import { EXERCISE_TYPE, MOVEMENT, EQUIPMENT, MUSCLE } from '../data/taxonomy.js';

describe('ExerciseDB — integrity', () => {
  it('holds records', () => {
    expect(ExerciseDB.count()).toBeGreaterThan(50);
  });

  it('validates every record against the schema', () => {
    const result = ExerciseDB.validateAll();
    expect(result.valid, `invalid records: ${JSON.stringify(result.errors)}`).toBeTruthy();
  });

  it('has no duplicate ids', () => {
    const ids = ExerciseDB.all().map((record) => record.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no alternative pointing at a record that does not exist', () => {
    const broken = ExerciseDB.brokenLinks();
    expect(broken.length, `broken: ${JSON.stringify(broken)}`).toBe(0);
  });

  it('never lists an exercise as its own alternative', () => {
    const selfRef = ExerciseDB.all().filter((r) => r.alternatives.includes(r.id));
    expect(selfRef.length).toBe(0);
  });

  it('gives every record at least one primary muscle, except pure protocols', () => {
    const missing = ExerciseDB.all().filter(
      (r) => r.muscles.primary.length === 0 && r.id !== 'ramp-up-sets'
    );
    expect(missing.length, `missing: ${missing.map((r) => r.id)}`).toBe(0);
  });

  it('gives every record execution steps and at least one common mistake', () => {
    const thin = ExerciseDB.all().filter(
      (r) => r.execution.length === 0 || r.commonMistakes.length === 0
    );
    expect(thin.length, `thin: ${thin.map((r) => r.id)}`).toBe(0);
  });

  it('points media at local assets, never at a third-party URL', () => {
    const external = ExerciseDB.all().filter((r) =>
      [r.media.image, r.media.gif, r.media.video]
        .filter(Boolean)
        .some((path) => path.startsWith('http'))
    );
    expect(external.length).toBe(0);
  });
});

describe('ExerciseDB — query by pattern', () => {
  it('answers the question a workout engine would ask', () => {
    const results = ExerciseDB.query({
      movement: MOVEMENT.HORIZONTAL_PUSH,
      category: 'compound',
      equipment: [EQUIPMENT.BARBELL, EQUIPMENT.BENCH],
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.id === 'barbell-bench-press')).toBeTruthy();
  });

  it('respects required equipment', () => {
    // A dumbbell press needs dumbbells; a bench alone is not enough.
    const withBenchOnly = ExerciseDB.query({ equipment: [EQUIPMENT.BENCH] });
    expect(withBenchOnly.some((r) => r.id === 'dumbbell-bench-press')).toBeFalsy();

    const withBoth = ExerciseDB.query({ equipment: [EQUIPMENT.BENCH, EQUIPMENT.DUMBBELL] });
    expect(withBoth.some((r) => r.id === 'dumbbell-bench-press')).toBeTruthy();
  });

  it('treats interchangeable equipment as one-of', () => {
    // A goblet squat takes a dumbbell OR a kettlebell.
    const dumbbellOnly = ExerciseDB.query({ equipment: [EQUIPMENT.DUMBBELL] });
    const kettlebellOnly = ExerciseDB.query({ equipment: [EQUIPMENT.KETTLEBELL] });
    expect(dumbbellOnly.some((r) => r.id === 'goblet-squat')).toBeTruthy();
    expect(kettlebellOnly.some((r) => r.id === 'goblet-squat')).toBeTruthy();
  });

  it('always returns something for someone with no equipment at all', () => {
    const bodyweight = ExerciseDB.query({ equipment: [], type: EXERCISE_TYPE.STRENGTH });
    expect(bodyweight.length).toBeGreaterThan(2);
    expect(bodyweight.every((r) => r.equipment.length === 0 || r.equipment.includes('none') ||
      r.equipmentAny.includes('none'))).toBeTruthy();
  });

  it('filters by muscle, primary or secondary', () => {
    const anyChest = ExerciseDB.query({ muscles: MUSCLE.CHEST });
    const primaryChest = ExerciseDB.query({ primaryMuscles: MUSCLE.CHEST });
    expect(anyChest.length).toBeGreaterThan(primaryChest.length - 1);
    expect(primaryChest.every((r) => r.muscles.primary.includes(MUSCLE.CHEST))).toBeTruthy();
  });

  it('caps difficulty', () => {
    const easy = ExerciseDB.query({ maxDifficulty: 'beginner' });
    expect(easy.every((r) => r.difficulty === 'beginner')).toBeTruthy();
    expect(easy.some((r) => r.id === 'deadlift')).toBeFalsy();
  });

  it('excludes ids on request', () => {
    const without = ExerciseDB.query({ movement: MOVEMENT.SQUAT, exclude: ['back-squat'] });
    expect(without.some((r) => r.id === 'back-squat')).toBeFalsy();
  });

  it('returns an empty list rather than throwing on an impossible query', () => {
    expect(ExerciseDB.query({ movement: 'nonsense' })).toEqual([]);
    expect(ExerciseDB.query({ type: 'running', equipment: [EQUIPMENT.BARBELL] })).toEqual([]);
  });

  it('covers every movement pattern it declares', () => {
    const patterns = ExerciseDB.facets().movement;
    for (const movement of patterns) {
      expect(ExerciseDB.query({ movement }).length).toBeGreaterThan(0);
    }
  });
});

describe('ExerciseDB — alternatives', () => {
  it('suggests swaps for an exercise', () => {
    const alts = ExerciseDB.alternativesFor('barbell-bench-press');
    expect(alts.length).toBeGreaterThan(1);
    expect(alts.some((r) => r.id === 'barbell-bench-press')).toBeFalsy();
  });

  it('limits swaps to the equipment on hand', () => {
    const alts = ExerciseDB.alternativesFor('barbell-bench-press', { equipment: [] });
    expect(alts.every((r) => ExerciseDB.canPerform(r, []))).toBeTruthy();
    expect(alts.some((r) => r.id === 'push-up')).toBeTruthy();
  });

  it('falls back to the same pattern when a record lists none', () => {
    const record = ExerciseDB.all().find((r) => r.alternatives.length === 0);
    if (record) {
      const alts = ExerciseDB.alternativesFor(record.id);
      expect(alts.every((r) => r.id !== record.id)).toBeTruthy();
    }
  });

  it('returns an empty list for an unknown id', () => {
    expect(ExerciseDB.alternativesFor('does-not-exist')).toEqual([]);
    expect(ExerciseDB.byId('does-not-exist')).toBeNull();
  });
});

describe('ExerciseDB — deterministic picking', () => {
  it('returns the same choice for the same seed', () => {
    const criteria = { movement: MOVEMENT.SQUAT };
    const first = ExerciseDB.pick(criteria, { seed: 'week-5' });
    const second = ExerciseDB.pick(criteria, { seed: 'week-5' });
    expect(first[0].id).toBe(second[0].id);
  });

  it('can return a different choice for a different seed', () => {
    const criteria = { type: EXERCISE_TYPE.STRENGTH };
    const a = ExerciseDB.pick(criteria, { seed: 'a' })[0].id;
    const b = ExerciseDB.pick(criteria, { seed: 'zzz' })[0].id;
    expect(a === b).toBeFalsy();
  });

  it('never returns more than exist', () => {
    expect(ExerciseDB.pick({ movement: MOVEMENT.CARRY }, { count: 99 }).length)
      .toBeLessThan(ExerciseDB.query({ movement: MOVEMENT.CARRY }).length + 1);
  });

  it('returns nothing when nothing matches', () => {
    expect(ExerciseDB.pick({ movement: 'nonsense' })).toEqual([]);
  });
});

describe('ExerciseDB — coverage a programme would need', () => {
  const needed = [
    ['a push', { movement: MOVEMENT.HORIZONTAL_PUSH }],
    ['a pull', { movement: MOVEMENT.HORIZONTAL_PULL }],
    ['a squat', { movement: MOVEMENT.SQUAT }],
    ['a hinge', { movement: MOVEMENT.HINGE }],
    ['a warm-up', { type: EXERCISE_TYPE.WARMUP }],
    ['a cool-down', { type: EXERCISE_TYPE.COOLDOWN }],
    ['running work', { type: EXERCISE_TYPE.RUNNING }],
    ['mobility', { type: EXERCISE_TYPE.MOBILITY }],
    ['corrective work', { type: EXERCISE_TYPE.CORRECTIVE }],
  ];

  for (const [name, criteria] of needed) {
    it(`can supply ${name}`, () => {
      expect(ExerciseDB.query(criteria).length).toBeGreaterThan(0);
    });
  }

  it('covers rounded shoulders, which is a stated goal', () => {
    expect(ExerciseDB.query({ tags: ['rounded-shoulders'] }).length).toBeGreaterThan(4);
  });
});
