/** Tests for volume and one-rep-max estimation. */

import { describe, it, expect } from './runner.js';
import { StrengthEngine, oneRepMaxFormula } from '../engines/strength-engine.js';
import { ONE_REP_MAX } from '../engines/constants.js';

describe('StrengthEngine — volume', () => {
  it('multiplies sets, reps and load', () => {
    expect(StrengthEngine.volume({ sets: 4, reps: 6, weightKg: 60 })).toBe(1440);
  });

  it('counts bodyweight work as zero tonnage', () => {
    expect(StrengthEngine.volume({ sets: 3, reps: 12, weightKg: 0 })).toBe(0);
  });

  it('rejects negative input', () => {
    expect(StrengthEngine.volume({ sets: -1, reps: 6, weightKg: 60 })).toBeNull();
  });

  it('returns null when a field is missing', () => {
    expect(StrengthEngine.volume({ sets: 4, reps: 6 })).toBeNull();
    expect(StrengthEngine.volume({})).toBeNull();
  });

  it('sums a session and groups it by muscle', () => {
    const sets = [
      { sets: 4, reps: 6, weightKg: 60, muscle: 'quads' },
      { sets: 3, reps: 10, weightKg: 40, muscle: 'quads' },
      { sets: 3, reps: 8, weightKg: 20, muscle: 'chest' },
    ];
    expect(StrengthEngine.totalVolume(sets)).toBe(3120);
    expect(StrengthEngine.volumeByMuscle(sets)).toEqual({ quads: 2640, chest: 480 });
  });

  it('survives a broken entry inside a list', () => {
    expect(StrengthEngine.totalVolume([{ sets: 4, reps: 6, weightKg: 60 }, { sets: 'x' }])).toBe(1440);
    expect(StrengthEngine.totalVolume(null)).toBe(0);
  });
});

describe('StrengthEngine — one-rep max', () => {
  it('returns the load itself for a single rep', () => {
    expect(StrengthEngine.oneRepMax({ weightKg: 100, reps: 1 }).value).toBe(100);
  });

  it('matches Epley at five reps', () => {
    // 100 × (1 + 5/30) = 116.67
    expect(StrengthEngine.oneRepMax({ weightKg: 100, reps: 5 }).value).toBeCloseTo(116.67, 2);
  });

  it('flags a rep count too high to trust', () => {
    expect(StrengthEngine.oneRepMax({ weightKg: 60, reps: ONE_REP_MAX.MAX_RELIABLE_REPS }).reliable)
      .toBeTruthy();
    expect(StrengthEngine.oneRepMax({ weightKg: 60, reps: ONE_REP_MAX.MAX_RELIABLE_REPS + 1 }).reliable)
      .toBeFalsy();
  });

  it('rejects zero reps and zero load', () => {
    expect(StrengthEngine.oneRepMax({ weightKg: 100, reps: 0 }).value).toBeNull();
    expect(StrengthEngine.oneRepMax({ weightKg: 0, reps: 5 }).value).toBeNull();
  });

  it('carries the formula metadata with the number', () => {
    const result = StrengthEngine.oneRepMax({ weightKg: 100, reps: 5 });
    expect(result.formula.accuracy).toBe('estimate');
    expect(result.formula.source).toContain('Epley');
  });

  it('switches to Brzycki, which reads lower below ten reps', () => {
    const epley = StrengthEngine.oneRepMax({ weightKg: 100, reps: 5 }).value;
    oneRepMaxFormula.use('brzycki');
    const brzycki = StrengthEngine.oneRepMax({ weightKg: 100, reps: 5 }).value;
    oneRepMaxFormula.reset();

    expect(brzycki).toBeLessThan(epley);
    expect(brzycki).toBeCloseTo(112.5, 2);    // 100 × 36 / (37 − 5)
  });

  it('agrees with Epley at exactly ten reps, where the two curves cross', () => {
    const epley = StrengthEngine.oneRepMax({ weightKg: 100, reps: 10 }).value;
    oneRepMaxFormula.use('brzycki');
    const brzycki = StrengthEngine.oneRepMax({ weightKg: 100, reps: 10 }).value;
    oneRepMaxFormula.reset();

    expect(brzycki).toBe(epley);              // both give 133.33
  });

  it('reads higher than Epley above ten reps', () => {
    const epley = StrengthEngine.oneRepMax({ weightKg: 100, reps: 15 }).value;
    oneRepMaxFormula.use('brzycki');
    const brzycki = StrengthEngine.oneRepMax({ weightKg: 100, reps: 15 }).value;
    oneRepMaxFormula.reset();

    expect(brzycki).toBeGreaterThan(epley);
  });

  it('returns null where Brzycki breaks down', () => {
    oneRepMaxFormula.use('brzycki');
    expect(StrengthEngine.oneRepMax({ weightKg: 100, reps: ONE_REP_MAX.BRZYCKI_OFFSET }).value).toBeNull();
    oneRepMaxFormula.reset();
  });
});

describe('StrengthEngine — intensity', () => {
  it('reports the working load as a share of the estimated max', () => {
    expect(StrengthEngine.intensityPercent({ weightKg: 100, reps: 1 })).toBe(100);
    expect(StrengthEngine.intensityPercent({ weightKg: 100, reps: 5 })).toBeLessThan(100);
  });

  it('returns null when the max cannot be estimated', () => {
    expect(StrengthEngine.intensityPercent({ weightKg: 0, reps: 5 })).toBeNull();
  });
});
