/** Tests for BMI, body fat and weight trend. */

import { describe, it, expect } from './runner.js';
import { BodyEngine } from '../engines/body-engine.js';

describe('BodyEngine — BMI', () => {
  it('computes weight over height squared', () => {
    expect(BodyEngine.bmi({ weightKg: 61, heightCm: 186 })).toBe(17.6);
  });

  it('rejects a height of zero rather than dividing by it', () => {
    expect(BodyEngine.bmi({ weightKg: 61, heightCm: 0 })).toBeNull();
  });

  it('returns null on missing input', () => {
    expect(BodyEngine.bmi({ weightKg: 61 })).toBeNull();
    expect(BodyEngine.bmi({})).toBeNull();
  });
});

describe('BodyEngine — body fat (US Navy)', () => {
  it('estimates for a male from waist, neck and height', () => {
    const percent = BodyEngine.bodyFat({
      sex: 'male', heightCm: 186, waistCm: 80, neckCm: 38,
    });
    expect(percent).toBeGreaterThan(5);
    expect(percent).toBeLessThan(20);
  });

  it('needs the hip measurement for a female', () => {
    expect(BodyEngine.bodyFat({ sex: 'female', heightCm: 165, waistCm: 70, neckCm: 32 })).toBeNull();
    expect(BodyEngine.bodyFat({ sex: 'female', heightCm: 165, waistCm: 70, neckCm: 32, hipCm: 95 }))
      .toBeGreaterThan(0);
  });

  it('rejects a waist no larger than the neck, where the logarithm is undefined', () => {
    expect(BodyEngine.bodyFat({ sex: 'male', heightCm: 186, waistCm: 38, neckCm: 38 })).toBeNull();
    expect(BodyEngine.bodyFat({ sex: 'male', heightCm: 186, waistCm: 30, neckCm: 38 })).toBeNull();
  });

  it('rejects an unknown sex and non-positive measurements', () => {
    expect(BodyEngine.bodyFat({ sex: 'other', heightCm: 186, waistCm: 80, neckCm: 38 })).toBeNull();
    expect(BodyEngine.bodyFat({ sex: 'male', heightCm: -186, waistCm: 80, neckCm: 38 })).toBeNull();
  });
});

describe('BodyEngine — lean mass', () => {
  it('removes the fat fraction', () => {
    expect(BodyEngine.leanMass({ weightKg: 80, bodyFatPercent: 25 })).toBe(60);
  });

  it('handles the zero-fat boundary', () => {
    expect(BodyEngine.leanMass({ weightKg: 80, bodyFatPercent: 0 })).toBe(80);
  });

  it('rejects impossible percentages', () => {
    expect(BodyEngine.leanMass({ weightKg: 80, bodyFatPercent: 100 })).toBeNull();
    expect(BodyEngine.leanMass({ weightKg: 80, bodyFatPercent: -5 })).toBeNull();
  });
});

describe('BodyEngine — weight trend', () => {
  const gaining = [
    { date: '2026-07-01', kg: 61.0 },
    { date: '2026-07-08', kg: 61.4 },
    { date: '2026-07-15', kg: 61.7 },
    { date: '2026-07-22', kg: 62.2 },
  ];

  it('reports a weekly rate from the line through the readings', () => {
    const trend = BodyEngine.trend(gaining);
    expect(trend.readings).toBe(4);
    expect(trend.spanDays).toBe(21);
    expect(trend.ratePerWeek).toBeCloseTo(0.39, 1);
  });

  it('reports a negative rate when weight falls', () => {
    const trend = BodyEngine.trend(gaining.map((row, i) => ({ ...row, kg: 70 - i })));
    expect(trend.ratePerWeek).toBeLessThan(0);
  });

  it('is not fooled by one noisy reading', () => {
    // A single 2 kg water spike must not flip a clear upward trend downward.
    const noisy = [...gaining];
    noisy[2] = { date: '2026-07-15', kg: 63.7 };
    expect(BodyEngine.trend(noisy).ratePerWeek).toBeGreaterThan(0);
  });

  it('needs at least two readings', () => {
    expect(BodyEngine.trend([{ date: '2026-07-01', kg: 61 }])).toBeNull();
    expect(BodyEngine.trend([])).toBeNull();
    expect(BodyEngine.trend(null)).toBeNull();
  });

  it('ignores rows with an unusable date or weight', () => {
    const dirty = [...gaining, { date: 'not-a-date', kg: 99 }, { date: '2026-07-29', kg: 'x' }];
    expect(BodyEngine.trend(dirty).readings).toBe(4);
  });

  it('returns null when every reading is on the same day', () => {
    expect(BodyEngine.trend([
      { date: '2026-07-01', kg: 61 },
      { date: '2026-07-01', kg: 62 },
    ])).toBeNull();
  });

  it('limits recentTrend to the requested window', () => {
    const long = [{ date: '2026-01-01', kg: 55 }, ...gaining];
    expect(BodyEngine.trend(long).readings).toBe(5);
    expect(BodyEngine.recentTrend(long, 14).readings).toBe(3);
  });
});

describe('BodyEngine — progress to goal', () => {
  it('reports the share of the distance covered', () => {
    expect(BodyEngine.progressToGoal({ startKg: 61, currentKg: 62.5, goalKg: 74 })).toBe(11.5);
  });

  it('treats an already-met goal as complete', () => {
    expect(BodyEngine.progressToGoal({ startKg: 74, currentKg: 74, goalKg: 74 })).toBe(100);
  });

  it('never reports below zero or above one hundred', () => {
    expect(BodyEngine.progressToGoal({ startKg: 61, currentKg: 60, goalKg: 74 })).toBe(0);
    expect(BodyEngine.progressToGoal({ startKg: 61, currentKg: 90, goalKg: 74 })).toBe(100);
  });
});
