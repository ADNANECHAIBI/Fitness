/** Tests for the energy engine: normal, boundary and invalid inputs. */

import { describe, it, expect } from './runner.js';
import { EnergyEngine, bmrFormula } from '../engines/energy-engine.js';
import { ACTIVITY_FACTOR } from '../engines/constants.js';

const SUBJECT = {
  weightKg: 61, heightCm: 186, age: 28, sex: 'male',
  activityLevel: 'moderate', goal: 'bulk',
};

describe('EnergyEngine — BMR (Mifflin-St Jeor)', () => {
  it('matches the published equation for a male subject', () => {
    // 10(61) + 6.25(186) − 5(28) + 5 = 1637.5
    expect(EnergyEngine.bmr(SUBJECT)).toBe(1638);
  });

  it('applies the female constant', () => {
    // Same body, female: 1637.5 − 5 − 161 = 1471.5
    expect(EnergyEngine.bmr({ ...SUBJECT, sex: 'female' })).toBe(1472);
  });

  it('rejects an unknown sex rather than guessing', () => {
    expect(EnergyEngine.bmr({ ...SUBJECT, sex: 'other' })).toBeNull();
    expect(EnergyEngine.bmr({ ...SUBJECT, sex: undefined })).toBeNull();
  });

  it('returns null for missing or unusable numbers', () => {
    expect(EnergyEngine.bmr({})).toBeNull();
    expect(EnergyEngine.bmr({ ...SUBJECT, weightKg: null })).toBeNull();
    expect(EnergyEngine.bmr({ ...SUBJECT, age: NaN })).toBeNull();
    expect(EnergyEngine.bmr({ ...SUBJECT, heightCm: Infinity })).toBeNull();
    expect(EnergyEngine.bmr(null)).toBeNull();
  });
});

describe('EnergyEngine — TDEE', () => {
  it('multiplies BMR by the activity factor', () => {
    expect(EnergyEngine.tdee(SUBJECT)).toBe(Math.round(1638 * ACTIVITY_FACTOR.moderate));
  });

  it('falls back to the default factor for an unknown level', () => {
    expect(EnergyEngine.tdee({ ...SUBJECT, activityLevel: 'nonsense' }))
      .toBe(EnergyEngine.tdee({ ...SUBJECT, activityLevel: 'moderate' }));
  });

  it('rises monotonically across the activity bands', () => {
    const levels = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
    const values = levels.map((activityLevel) => EnergyEngine.tdee({ ...SUBJECT, activityLevel }));
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('returns null when BMR cannot be computed', () => {
    expect(EnergyEngine.tdee({ activityLevel: 'moderate' })).toBeNull();
  });
});

describe('EnergyEngine — target', () => {
  it('applies the bulk surplus and splits the macros', () => {
    const target = EnergyEngine.target(SUBJECT);
    expect(target.tdee).toBe(2539);
    expect(target.calories).toBe(2844);
    expect(target.proteinG).toBe(116);
    expect(target.fatG).toBe(55);
    expect(target.carbsG).toBe(471);
  });

  it('raises protein while cutting', () => {
    const cut = EnergyEngine.target({ ...SUBJECT, goal: 'cut' });
    const bulk = EnergyEngine.target(SUBJECT);
    expect(cut.proteinG).toBeGreaterThan(bulk.proteinG);
    expect(cut.calories).toBeLessThan(cut.tdee);
  });

  it('leaves maintenance untouched', () => {
    const target = EnergyEngine.target({ ...SUBJECT, goal: 'maintain' });
    expect(target.calories).toBe(target.tdee);
    expect(target.adjustment).toBe(0);
  });

  it('never returns negative carbohydrate', () => {
    // A heavy subject in a steep deficit: protein and fat alone can exceed the
    // target, and the remainder must floor at zero rather than go negative.
    const target = EnergyEngine.target({
      weightKg: 200, heightCm: 150, age: 80, sex: 'female',
      activityLevel: 'sedentary', goal: 'cut',
    });
    expect(target.carbsG).toBe(0);
  });

  it('returns null on an incomplete profile', () => {
    expect(EnergyEngine.target({ weightKg: 61 })).toBeNull();
    expect(EnergyEngine.target(null)).toBeNull();
  });
});

describe('EnergyEngine — caloriesFromMacros', () => {
  it('uses 4/4/9 kcal per gram', () => {
    expect(EnergyEngine.caloriesFromMacros({ proteinG: 100, carbsG: 100, fatG: 100 })).toBe(1700);
  });

  it('treats missing macros as zero', () => {
    expect(EnergyEngine.caloriesFromMacros({ proteinG: 10 })).toBe(40);
    expect(EnergyEngine.caloriesFromMacros({})).toBe(0);
  });

  it('rejects negative grams', () => {
    expect(EnergyEngine.caloriesFromMacros({ proteinG: -10 })).toBeNull();
  });
});

describe('EnergyEngine — formula slot is replaceable', () => {
  it('switches to Katch-McArdle and back without touching the engine', () => {
    const mifflin = EnergyEngine.bmr(SUBJECT);

    bmrFormula.use('katch-mcardle');
    // 370 + 21.6 × lean mass, at 15% body fat on 61 kg → 370 + 21.6(51.85)
    expect(EnergyEngine.bmr({ weightKg: 61, bodyFatPercent: 15 })).toBe(1490);
    expect(EnergyEngine.formulas().bmr.id).toBe('katch-mcardle');

    bmrFormula.reset();
    expect(EnergyEngine.bmr(SUBJECT)).toBe(mifflin);
  });

  it('refuses an unregistered formula id', () => {
    expect(() => bmrFormula.use('made-up')).toThrow();
  });

  it('publishes a source and an accuracy for every formula', () => {
    for (const meta of Object.values(EnergyEngine.formulas())) {
      expect(meta.source.length).toBeGreaterThan(10);
      expect(['exact', 'estimate'].includes(meta.accuracy)).toBeTruthy();
      expect(meta.useWhen.length).toBeGreaterThan(10);
    }
  });
});
