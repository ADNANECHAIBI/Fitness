/**
 * calculation-engine.js — arithmetic, and nothing else.
 *
 * This engine knows about numbers. It does not know what a rep is, what a
 * calorie is, or that people have weight. Every domain engine builds on it;
 * it builds on nothing (rule 8).
 *
 * Every function is pure and total: invalid input returns null rather than
 * throwing or producing NaN, so a bad number can never propagate silently
 * into something the user reads.
 */

import { PRECISION, CACHE } from './constants.js';

/* ── Guards ─────────────────────────────────────────────────────────────── */

/** True when the value is a usable, finite number. */
export function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Coerce to a finite number, or null. Accepts numeric strings. */
export function toNumber(value) {
  if (isNumber(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/* ── Rounding and ranges ────────────────────────────────────────────────── */

/**
 * Round to a number of decimal places.
 * @returns {number|null}
 */
export function round(value, decimals = 0) {
  const n = toNumber(value);
  if (n === null) return null;
  const factor = 10 ** decimals;
  // Adding Number.EPSILON keeps 1.005 from rounding down through float error.
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

/** Constrain a value to a range. @returns {number|null} */
export function clamp(value, min, max) {
  const n = toNumber(value);
  if (n === null) return null;
  return Math.min(Math.max(n, min), max);
}

/** True when the value sits inside the inclusive range. */
export function inRange(value, min, max) {
  const n = toNumber(value);
  return n !== null && n >= min && n <= max;
}

/** Division that returns null instead of Infinity or NaN. */
export function divide(numerator, denominator) {
  const a = toNumber(numerator);
  const b = toNumber(denominator);
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

/** `part` as a percentage of `whole`. @returns {number|null} */
export function percentOf(part, whole, decimals = PRECISION.PERCENT) {
  const ratio = divide(part, whole);
  return ratio === null ? null : round(ratio * 100, decimals);
}

/**
 * Where `value` sits between `from` and `to`, as 0–100.
 * A zero-length span counts as complete.
 */
export function progressBetween(from, to, value, decimals = PRECISION.PERCENT) {
  const start = toNumber(from);
  const end = toNumber(to);
  const now = toNumber(value);
  if (start === null || end === null || now === null) return null;
  if (start === end) return 100;
  return round(clamp(((now - start) / (end - start)) * 100, 0, 100), decimals);
}

/* ── Aggregates ─────────────────────────────────────────────────────────── */

/** Numbers only, invalid entries dropped. @returns {number[]} */
export function cleanSeries(values) {
  if (!Array.isArray(values)) return [];
  return values.map(toNumber).filter((n) => n !== null);
}

/** @returns {number} 0 for an empty series */
export function sum(values) {
  return cleanSeries(values).reduce((total, n) => total + n, 0);
}

/** @returns {number|null} null for an empty series */
export function mean(values, decimals = null) {
  const series = cleanSeries(values);
  if (!series.length) return null;
  const value = sum(series) / series.length;
  return decimals === null ? value : round(value, decimals);
}

/** @returns {number|null} */
export function median(values) {
  const series = cleanSeries(values).sort((a, b) => a - b);
  if (!series.length) return null;
  const middle = Math.floor(series.length / 2);
  return series.length % 2
    ? series[middle]
    : (series[middle - 1] + series[middle]) / 2;
}

/** Smallest / largest, ignoring invalid entries. @returns {number|null} */
export function min(values) {
  const series = cleanSeries(values);
  return series.length ? Math.min(...series) : null;
}
export function max(values) {
  const series = cleanSeries(values);
  return series.length ? Math.max(...series) : null;
}

/**
 * Trailing moving average.
 * @param {number[]} values
 * @param {number} window  how many points each average covers
 * @returns {(number|null)[]} same length as the input; null until the window fills
 */
export function movingAverage(values, window) {
  const series = cleanSeries(values);
  if (window < 1 || !series.length) return [];

  return series.map((_, i) =>
    i + 1 < window ? null : mean(series.slice(i + 1 - window, i + 1))
  );
}

/**
 * Least-squares slope through (x, y) points — the rate of change per unit x.
 *
 * Used for weight trend, where the honest answer is the line through several
 * readings rather than the difference between the first and the last.
 *
 * @param {{x: number, y: number}[]} points
 * @returns {{slope: number, intercept: number, points: number}|null}
 *          null when fewer than two usable points, or when every x is identical
 */
export function linearTrend(points) {
  const clean = (Array.isArray(points) ? points : [])
    .map((point) => ({ x: toNumber(point?.x), y: toNumber(point?.y) }))
    .filter((point) => point.x !== null && point.y !== null);

  if (clean.length < 2) return null;

  const meanX = mean(clean.map((p) => p.x));
  const meanY = mean(clean.map((p) => p.y));

  let numerator = 0;
  let denominator = 0;
  for (const point of clean) {
    numerator += (point.x - meanX) * (point.y - meanY);
    denominator += (point.x - meanX) ** 2;
  }

  if (denominator === 0) return null;      // every reading on the same day

  const slope = numerator / denominator;
  return { slope, intercept: meanY - slope * meanX, points: clean.length };
}

/* ── Memoisation (rule 9) ───────────────────────────────────────────────── */

/**
 * Cache a pure function's results.
 *
 * Bounded: the oldest entry is dropped past CACHE.MAX_ENTRIES, so a long
 * session cannot grow memory without limit. The returned function carries an
 * `invalidate()` so callers can clear it when their inputs change underneath.
 *
 * @param {Function} fn
 * @param {(...args: *) => string} [keyOf] how arguments become a cache key
 * @returns {Function & { invalidate: Function, size: Function }}
 */
export function memoize(fn, keyOf = (...args) => JSON.stringify(args)) {
  const cache = new Map();

  const wrapped = (...args) => {
    const key = keyOf(...args);

    if (cache.has(key)) {
      // Refresh recency so the hot entry is not the one evicted.
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      return value;
    }

    const value = fn(...args);
    cache.set(key, value);
    if (cache.size > CACHE.MAX_ENTRIES) {
      cache.delete(cache.keys().next().value);
    }
    return value;
  };

  wrapped.invalidate = () => cache.clear();
  wrapped.size = () => cache.size;
  return wrapped;
}

/**
 * A memoised value that clears itself when a fact changes.
 *
 * @param {Function} compute
 * @param {{bus: object, on: string[]}} invalidation  event bus and topics
 * @returns {Function & { invalidate: Function }}
 */
export function cached(compute, { bus, on = [] } = {}) {
  const wrapped = memoize(compute);
  for (const topic of on) bus?.on(topic, () => wrapped.invalidate());
  return wrapped;
}

/** Named export bundle, so an engine can import one object. */
export const CalculationEngine = Object.freeze({
  isNumber, toNumber, round, clamp, inRange, divide, percentOf, progressBetween,
  cleanSeries, sum, mean, median, min, max, movingAverage, linearTrend,
  memoize, cached,
});
