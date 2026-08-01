/**
 * Tests for the only engine that decides anything.
 * Every path must return a reason the user could read (rule 7).
 */

import { describe, it, expect } from './runner.js';
import { AdjustmentEngine, ACTION } from '../engines/adjustment-engine.js';
import { ADJUSTMENT } from '../engines/constants.js';

/** Weigh-ins over two weeks at a chosen weekly rate. */
function readings(startKg, ratePerWeek, count = 5, stepDays = 3) {
  const start = new Date('2026-07-01T00:00:00').getTime();
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(start + i * stepDays * 86400000).toISOString().slice(0, 10),
    kg: Number((startKg + (ratePerWeek / 7) * i * stepDays).toFixed(2)),
  }));
}

const BASE = {
  currentWeightKg: 61,
  goal: 'bulk',
  currentTargetKcal: 2844,
  maintenanceKcal: 2539,
};

describe('AdjustmentEngine — insufficient data', () => {
  it('refuses to decide below the minimum number of readings', () => {
    const result = AdjustmentEngine.evaluate({ ...BASE, readings: readings(61, 0.2, 2) });
    expect(result.action).toBe(ACTION.INSUFFICIENT_DATA);
    expect(result.deltaKcal).toBe(0);
    expect(result.reason).toContain('Not enough weigh-ins');
  });

  it('refuses on an empty or missing history', () => {
    expect(AdjustmentEngine.evaluate({ ...BASE, readings: [] }).action).toBe(ACTION.INSUFFICIENT_DATA);
    expect(AdjustmentEngine.evaluate({ ...BASE, readings: null }).action).toBe(ACTION.INSUFFICIENT_DATA);
  });

  it('refuses on an incomplete profile', () => {
    const result = AdjustmentEngine.evaluate({ readings: readings(61, 0.2), goal: 'bulk' });
    expect(result.action).toBe(ACTION.INSUFFICIENT_DATA);
    expect(result.reason).toContain('profile is incomplete');
  });

  it('never throws, whatever it is handed', () => {
    expect(AdjustmentEngine.evaluate().action).toBe(ACTION.INSUFFICIENT_DATA);
    expect(AdjustmentEngine.evaluate({ readings: 'nonsense' }).action).toBe(ACTION.INSUFFICIENT_DATA);
  });
});

describe('AdjustmentEngine — holding', () => {
  it('holds when the observed rate is on target', () => {
    // bulk target: 0.0035 × 61 kg ≈ 0.214 kg/week
    const result = AdjustmentEngine.evaluate({ ...BASE, readings: readings(61, 0.213) });
    expect(result.action).toBe(ACTION.HOLD);
    expect(result.deltaKcal).toBe(0);
    expect(result.newTargetKcal).toBe(BASE.currentTargetKcal);
    expect(result.reason).toContain('Holding');
  });

  it('holds inside the tolerance band rather than chasing noise', () => {
    const target = ADJUSTMENT.TARGET_RATE_FRACTION.bulk * 61;
    const justInside = target * (1 - ADJUSTMENT.TOLERANCE_FRACTION * 0.9);
    expect(AdjustmentEngine.evaluate({ ...BASE, readings: readings(61, justInside) }).action)
      .toBe(ACTION.HOLD);
  });
});

describe('AdjustmentEngine — increasing', () => {
  const result = AdjustmentEngine.evaluate({ ...BASE, readings: readings(61, 0.02) });

  it('raises intake when weight is gaining too slowly', () => {
    expect(result.action).toBe(ACTION.INCREASE);
    expect(result.deltaKcal).toBe(ADJUSTMENT.STEP_KCAL);
    expect(result.newTargetKcal).toBe(BASE.currentTargetKcal + ADJUSTMENT.STEP_KCAL);
  });

  it('explains itself in a sentence a person could read', () => {
    expect(result.reason).toContain('Raising');
    expect(result.reason).toContain(String(ADJUSTMENT.STEP_KCAL));
    expect(result.reason).toContain('weigh-ins');
  });

  it('shows the evidence behind the decision', () => {
    expect(result.evidence.observedRateKgPerWeek).toBeLessThan(result.evidence.targetRateKgPerWeek);
    expect(result.evidence.readings).toBeGreaterThan(ADJUSTMENT.MIN_READINGS - 1);
    expect(result.evidence.windowDays).toBe(ADJUSTMENT.WINDOW_DAYS);
  });

  it('names the formula and its accuracy', () => {
    expect(result.formula.accuracy).toBe('estimate');
    expect(result.formula.source.length).toBeGreaterThan(10);
  });
});

describe('AdjustmentEngine — decreasing', () => {
  it('lowers intake when weight is climbing too fast', () => {
    const result = AdjustmentEngine.evaluate({ ...BASE, readings: readings(61, 1.2) });
    expect(result.action).toBe(ACTION.DECREASE);
    expect(result.deltaKcal).toBe(-ADJUSTMENT.STEP_KCAL);
    expect(result.reason).toContain('Lowering');
  });

  it('reads a negative target correctly while cutting', () => {
    // Cutting but barely losing: intake should come down.
    const result = AdjustmentEngine.evaluate({
      ...BASE, goal: 'cut', currentTargetKcal: 2082, readings: readings(61, -0.05),
    });
    expect(result.action).toBe(ACTION.DECREASE);
  });

  it('raises intake while cutting when weight is falling dangerously fast', () => {
    const result = AdjustmentEngine.evaluate({
      ...BASE, goal: 'cut', currentTargetKcal: 2082, readings: readings(61, -1.5),
    });
    expect(result.action).toBe(ACTION.INCREASE);
  });
});

describe('AdjustmentEngine — safety cap', () => {
  it('will not push the target beyond the deviation limit', () => {
    const ceiling = Math.round(BASE.maintenanceKcal * (1 + ADJUSTMENT.MAX_DEVIATION_FRACTION));
    const result = AdjustmentEngine.evaluate({
      ...BASE, currentTargetKcal: ceiling, readings: readings(61, 0.0),
    });

    expect(result.action).toBe(ACTION.HOLD);
    expect(result.newTargetKcal).toBe(ceiling);
    expect(result.evidence.capped).toBeTruthy();
    expect(result.reason).toContain('safe limit');
  });

  it('will not drop below the deficit limit', () => {
    const floor = Math.round(BASE.maintenanceKcal * (1 - ADJUSTMENT.MAX_DEVIATION_FRACTION));
    const result = AdjustmentEngine.evaluate({
      ...BASE, goal: 'cut', currentTargetKcal: floor, readings: readings(61, 0.3),
    });
    expect(result.action).toBe(ACTION.HOLD);
    expect(result.evidence.capped).toBeTruthy();
  });
});

describe('AdjustmentEngine — every result is explainable', () => {
  const cases = [
    { name: 'no data', input: { ...BASE, readings: [] } },
    { name: 'holding', input: { ...BASE, readings: readings(61, 0.213) } },
    { name: 'increase', input: { ...BASE, readings: readings(61, 0.02) } },
    { name: 'decrease', input: { ...BASE, readings: readings(61, 1.2) } },
  ];

  for (const testCase of cases) {
    it(`returns a reason and a timestamp when ${testCase.name}`, () => {
      const result = AdjustmentEngine.evaluate(testCase.input);
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(20);
      expect(typeof result.decidedAt).toBe('string');
      expect(result.evidence).toBeTruthy();
    });
  }

  it('never reports a change without a delta, or a delta without a change', () => {
    for (const testCase of cases) {
      const result = AdjustmentEngine.evaluate(testCase.input);
      const isChange = AdjustmentEngine.isChange(result);
      expect(isChange === (result.deltaKcal !== 0)).toBeTruthy();
    }
  });
});
