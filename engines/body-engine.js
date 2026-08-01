/**
 * body-engine.js — body composition and weight trend.
 */

import { defineFormula, createSlot } from './formula.js';
import { round, clamp, divide, linearTrend, progressBetween } from './calculation-engine.js';
import { NAVY_BODY_FAT, UNITS, PRECISION, ADJUSTMENT } from './constants.js';

/* ── Formulas ───────────────────────────────────────────────────────────── */

export const BMI_FORMULA = defineFormula({
  id: 'bmi',
  name: 'Body Mass Index',
  source: 'Quetelet A. Sur l\'homme et le développement de ses facultés. 1835. Adopted as BMI by Keys A et al., J Chronic Dis. 1972;25(6):329-343.',
  accuracy: 'exact',
  useWhen: 'A quick population-level screen. The arithmetic is exact; the interpretation is where it goes wrong.',
  caveat: 'BMI cannot tell muscle from fat. A lean, muscular person is routinely classified "overweight" by it. Never use it alone to judge an individual.',

  /** @returns {number|null} kg/m² */
  compute({ weightKg, heightCm }) {
    if (typeof weightKg !== 'number' || typeof heightCm !== 'number') return null;
    if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || heightCm <= 0) return null;

    const metres = heightCm / UNITS.CM_PER_METRE;
    return round(divide(weightKg, metres * metres), 1);
  },
});

export const NAVY_BODY_FAT_FORMULA = defineFormula({
  id: 'navy-body-fat',
  name: 'US Navy circumference method',
  source: 'Hodgdon JA, Beckett MB. Prediction of percent body fat for U.S. Navy men and women from body circumferences and height. Naval Health Research Center, Report No. 84-11; 1984.',
  accuracy: 'estimate',
  useWhen: 'Estimating body fat from a tape measure, when calipers or a DEXA scan are not available.',
  caveat: 'Roughly ±3–4 percentage points against DEXA, and worse at the extremes. Its value is in the direction it moves over months, not in any single reading.',

  /**
   * @param {{sex, heightCm, waistCm, neckCm, hipCm?}} input  hip required for females
   * @returns {number|null} body fat percentage
   */
  compute({ sex, heightCm, waistCm, neckCm, hipCm }) {
    const numbers = [heightCm, waistCm, neckCm];
    if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) return null;

    if (sex === 'male') {
      const { A, B, C, D, E } = NAVY_BODY_FAT.MALE;
      const inner = waistCm - neckCm;
      if (inner <= 0) return null;                       // log10 of ≤0 is undefined
      const percent = A / (B - C * Math.log10(inner) + D * Math.log10(heightCm)) - E;
      return round(clamp(percent, NAVY_BODY_FAT.MIN_PERCENT, NAVY_BODY_FAT.MAX_PERCENT), 1);
    }

    if (sex === 'female') {
      if (typeof hipCm !== 'number' || !Number.isFinite(hipCm) || hipCm <= 0) return null;
      const { A, B, C, D, E } = NAVY_BODY_FAT.FEMALE;
      const inner = waistCm + hipCm - neckCm;
      if (inner <= 0) return null;
      const percent = A / (B - C * Math.log10(inner) + D * Math.log10(heightCm)) - E;
      return round(clamp(percent, NAVY_BODY_FAT.MIN_PERCENT, NAVY_BODY_FAT.MAX_PERCENT), 1);
    }

    return null;
  },
});

export const WEIGHT_TREND_FORMULA = defineFormula({
  id: 'weight-trend-ols',
  name: 'Least-squares weight trend',
  source: 'Ordinary least squares regression. Applied to body weight as in Hall KD et al., Lancet. 2011;378(9793):826-837, where daily fluctuation is treated as noise around a slower trend.',
  accuracy: 'estimate',
  useWhen: 'Judging whether weight is actually moving. Always prefer this to comparing two individual weigh-ins.',
  caveat: 'Needs several readings spread over time. Day-to-day weight swings by 1–2 kg from water, food volume and salt, so two readings tell you almost nothing.',

  /**
   * @param {{date: string, kg: number}[]} readings
   * @returns {{ratePerWeek, readings, spanDays, first, last}|null}
   */
  compute(readings) {
    const points = (Array.isArray(readings) ? readings : [])
      .filter((row) => row && typeof row.kg === 'number' && Number.isFinite(row.kg) && row.date)
      .map((row) => ({ ...row, time: new Date(`${row.date}T00:00:00Z`).getTime() }))
      .filter((row) => Number.isFinite(row.time))
      .sort((a, b) => a.time - b.time);

    if (points.length < 2) return null;

    const MS_PER_DAY = 86400000;
    const originTime = points[0].time;

    const trend = linearTrend(
      points.map((row) => ({ x: (row.time - originTime) / MS_PER_DAY, y: row.kg }))
    );
    if (!trend) return null;

    const spanDays = (points.at(-1).time - originTime) / MS_PER_DAY;

    return {
      ratePerWeek: round(trend.slope * UNITS.DAYS_PER_WEEK, PRECISION.RATE_KG_PER_WEEK),
      readings: points.length,
      spanDays: round(spanDays, 1),
      first: points[0],
      last: points.at(-1),
    };
  },
});

/* ── Replaceable slots ──────────────────────────────────────────────────── */

export const bmiFormula = createSlot('bmi', BMI_FORMULA);
export const bodyFatFormula = createSlot('body-fat', NAVY_BODY_FAT_FORMULA);
export const trendFormula = createSlot('weight-trend', WEIGHT_TREND_FORMULA);

/* ── Engine ─────────────────────────────────────────────────────────────── */

export const BodyEngine = Object.freeze({
  /** @returns {number|null} kg/m² */
  bmi(input) { return bmiFormula.current.compute(input ?? {}); },

  /** @returns {number|null} body fat percentage */
  bodyFat(input) { return bodyFatFormula.current.compute(input ?? {}); },

  /** @returns {number|null} kg of lean mass */
  leanMass({ weightKg, bodyFatPercent }) {
    if (typeof weightKg !== 'number' || typeof bodyFatPercent !== 'number') return null;
    if (bodyFatPercent < 0 || bodyFatPercent >= 100) return null;
    return round(weightKg * (1 - bodyFatPercent / 100), PRECISION.KG);
  },

  /**
   * Rate of weight change from a series of weigh-ins.
   * @returns {{ratePerWeek, readings, spanDays}|null}
   */
  trend(readings) { return trendFormula.current.compute(readings); },

  /**
   * Trend limited to the most recent window.
   * @param {{date: string, kg: number}[]} readings
   * @param {number} [days]
   */
  recentTrend(readings, days = ADJUSTMENT.WINDOW_DAYS) {
    if (!Array.isArray(readings) || !readings.length) return null;

    const sorted = [...readings].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const lastTime = new Date(`${sorted.at(-1).date}T00:00:00Z`).getTime();
    if (!Number.isFinite(lastTime)) return null;

    const cutoff = lastTime - days * 86400000;
    return this.trend(sorted.filter((row) => new Date(`${row.date}T00:00:00Z`).getTime() >= cutoff));
  },

  /**
   * Progress from a starting weight toward a goal weight, 0–100.
   * @returns {number|null}
   */
  progressToGoal({ startKg, currentKg, goalKg }) {
    return progressBetween(startKg, goalKg, currentKg);
  },

  formulas() {
    return {
      bmi: bmiFormula.current.describe(),
      bodyFat: bodyFatFormula.current.describe(),
      trend: trendFormula.current.describe(),
    };
  },
});
