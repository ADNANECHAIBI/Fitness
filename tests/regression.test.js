/**
 * regression.test.js — guards Phase 1–3 behaviour against Phase 4 changes.
 *
 * These lock in the numbers and error shapes the earlier phases produced. If
 * refactoring the maths into engines had changed any of them, this file fails.
 */

import { describe, it, expect } from './runner.js';
import { CaloriesService, RunningService, WorkoutService, formatPace } from '../services/index.js';
import { Profile, Running, Gym } from '../models/index.js';
import { ValidationError } from '../validators/index.js';

const SUBJECT = {
  weightKg: 61, heightCm: 186, age: 28, sex: 'male',
  activityLevel: 'moderate', goal: 'bulk',
};

describe('Regression — energy numbers are unchanged since Phase 3', () => {
  it('keeps the same BMR, TDEE and target', () => {
    expect(CaloriesService.bmr(SUBJECT)).toBe(1638);
    expect(CaloriesService.tdee(SUBJECT)).toBe(2539);

    const target = CaloriesService.target(SUBJECT);
    expect(target.calories).toBe(2844);
    expect(target.proteinG).toBe(116);
  });

  it('still returns null on an incomplete profile', () => {
    expect(CaloriesService.target({ weightKg: 61 })).toBeNull();
  });
});

describe('Regression — running and strength services', () => {
  it('keeps the same pace for the benchmark run', () => {
    const pace = RunningService.paceSecPerKm({ distanceKm: 4.59, durationMin: 25.18 });
    expect(formatPace(pace)).toBe('5:29');
  });

  it('keeps the same volume arithmetic', () => {
    expect(WorkoutService.volume({ sets: 4, reps: 6, weightKg: 60 })).toBe(1440);
  });

  it('still returns zero volume for an unusable entry rather than NaN', () => {
    expect(WorkoutService.volume({})).toBe(0);
  });
});

describe('Regression — validation still rejects the impossible', () => {
  it('rejects a negative weight', () => {
    expect(() => Profile.create({ ...SUBJECT, weightKg: -5 })).toThrow('ValidationError');
  });

  it('rejects a 500 cm height', () => {
    expect(() => Profile.create({ ...SUBJECT, heightCm: 500 })).toThrow('ValidationError');
  });

  it('rejects an age of two', () => {
    expect(() => Profile.create({ ...SUBJECT, age: 2 })).toThrow('ValidationError');
  });

  it('rejects a 35-hour session', () => {
    const error = expect(() => Running.create({ distanceKm: 5, durationMin: 35 * 60 }))
      .toThrow('ValidationError');
    expect(error instanceof ValidationError).toBeTruthy();
    expect(error.has('Time')).toBeTruthy();
  });

  it('still fills a required field from its declared default', () => {
    const set = Gym.create({ exercise: 'Squat', muscle: 'quads', sets: 4, reps: 6, weightKg: 60 });
    expect(typeof set.date).toBe('string');
    expect(set.restSec).toBe(90);
  });

  it('still reports every bad field at once, not just the first', () => {
    const error = expect(() => Profile.create({ ...SUBJECT, weightKg: -5, age: 2 }))
      .toThrow('ValidationError');
    expect(Object.keys(error.fields).length).toBe(2);
  });
});
