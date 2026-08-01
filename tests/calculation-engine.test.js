/** Tests for the domain-free arithmetic engine. */

import { describe, it, expect } from './runner.js';
import * as calc from '../engines/calculation-engine.js';

describe('CalculationEngine — round', () => {
  it('rounds to the requested precision', () => {
    expect(calc.round(2.345, 2)).toBe(2.35);
    expect(calc.round(1637.5, 0)).toBe(1638);
  });

  it('handles the float-error boundary', () => {
    expect(calc.round(1.005, 2)).toBe(1.01);
    expect(calc.round(-1.005, 2)).toBe(-1);
  });

  it('returns null for values that are not numbers', () => {
    expect(calc.round(undefined)).toBeNull();
    expect(calc.round('abc')).toBeNull();
    expect(calc.round(NaN)).toBeNull();
    expect(calc.round(Infinity)).toBeNull();
  });

  it('accepts numeric strings', () => {
    expect(calc.round('2.5', 0)).toBe(3);
  });
});

describe('CalculationEngine — divide', () => {
  it('divides normally', () => {
    expect(calc.divide(10, 4)).toBe(2.5);
  });

  it('returns null instead of Infinity when dividing by zero', () => {
    expect(calc.divide(10, 0)).toBeNull();
  });

  it('returns null for invalid operands', () => {
    expect(calc.divide('x', 2)).toBeNull();
    expect(calc.divide(2, null)).toBeNull();
  });
});

describe('CalculationEngine — clamp and range', () => {
  it('constrains to the range', () => {
    expect(calc.clamp(15, 0, 10)).toBe(10);
    expect(calc.clamp(-5, 0, 10)).toBe(0);
    expect(calc.clamp(5, 0, 10)).toBe(5);
  });

  it('treats the bounds as inclusive', () => {
    expect(calc.inRange(0, 0, 10)).toBeTruthy();
    expect(calc.inRange(10, 0, 10)).toBeTruthy();
    expect(calc.inRange(10.0001, 0, 10)).toBeFalsy();
  });
});

describe('CalculationEngine — progressBetween', () => {
  it('reports the position between two points', () => {
    expect(calc.progressBetween(61, 74, 62.5)).toBe(11.5);
  });

  it('clamps outside the span', () => {
    expect(calc.progressBetween(61, 74, 80)).toBe(100);
    expect(calc.progressBetween(61, 74, 55)).toBe(0);
  });

  it('treats a zero-length span as complete', () => {
    expect(calc.progressBetween(70, 70, 70)).toBe(100);
  });

  it('returns null when an input is missing', () => {
    expect(calc.progressBetween(null, 74, 62)).toBeNull();
  });
});

describe('CalculationEngine — aggregates', () => {
  it('ignores invalid entries rather than producing NaN', () => {
    expect(calc.sum([1, 'x', 2, null, 3])).toBe(6);
    expect(calc.mean([1, 'x', 3])).toBe(2);
  });

  it('returns null for an empty series', () => {
    expect(calc.mean([])).toBeNull();
    expect(calc.median([])).toBeNull();
    expect(calc.min([])).toBeNull();
  });

  it('takes the midpoint of an even-length median', () => {
    expect(calc.median([1, 2, 3, 4])).toBe(2.5);
  });

  it('survives input that is not an array', () => {
    expect(calc.sum(null)).toBe(0);
    expect(calc.cleanSeries('nope')).toEqual([]);
  });
});

describe('CalculationEngine — movingAverage', () => {
  it('holds null until the window fills', () => {
    expect(calc.movingAverage([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3]);
  });

  it('returns an empty array for a window below one', () => {
    expect(calc.movingAverage([1, 2, 3], 0)).toEqual([]);
  });
});

describe('CalculationEngine — linearTrend', () => {
  it('finds the slope of a straight line', () => {
    const trend = calc.linearTrend([{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }]);
    expect(trend.slope).toBeCloseTo(2, 6);
    expect(trend.points).toBe(3);
  });

  it('finds a negative slope', () => {
    const trend = calc.linearTrend([{ x: 0, y: 10 }, { x: 2, y: 6 }]);
    expect(trend.slope).toBeCloseTo(-2, 6);
  });

  it('needs at least two points', () => {
    expect(calc.linearTrend([{ x: 1, y: 1 }])).toBeNull();
    expect(calc.linearTrend([])).toBeNull();
    expect(calc.linearTrend(null)).toBeNull();
  });

  it('returns null when every x is identical', () => {
    expect(calc.linearTrend([{ x: 1, y: 1 }, { x: 1, y: 5 }])).toBeNull();
  });
});

describe('CalculationEngine — memoize', () => {
  it('computes once per distinct argument', () => {
    let calls = 0;
    const double = calc.memoize((n) => { calls += 1; return n * 2; });

    expect(double(4)).toBe(8);
    expect(double(4)).toBe(8);
    expect(calls).toBe(1);

    double(5);
    expect(calls).toBe(2);
  });

  it('clears on invalidate', () => {
    let calls = 0;
    const fn = calc.memoize(() => { calls += 1; return calls; });
    fn(); fn.invalidate(); fn();
    expect(calls).toBe(2);
  });

  it('stays bounded', () => {
    const fn = calc.memoize((n) => n);
    for (let i = 0; i < 100; i += 1) fn(i);
    expect(fn.size()).toBeLessThan(64);
  });
});
