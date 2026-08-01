/**
 * trend.js — fitting a line through a series of weekly reports.
 *
 * This was three private helpers inside `reports-engine.js` until phase 19,
 * when the analytics engine needed exactly the same three. Copying them would
 * have produced two definitions of "what a trend is" that could drift apart —
 * a monthly report saying one thing and a quarterly analysis saying another
 * about the same weeks. They live here instead and both engines import them.
 *
 * The reports engine's behaviour is unchanged: these are the same functions,
 * moved rather than rewritten.
 *
 * A trend is deliberately dull. x is the report's position in the series, so
 * the slope is per week; the fit is least-squares, from the calculation
 * engine; and a series carrying fewer than `REPORTS.MIN_WEEKS_FOR_TREND`
 * readings of the figure is refused rather than fitted. Three points is not a
 * generous floor, but two points are a line by definition and would let any
 * pair of weeks claim a direction.
 *
 * Pure. No storage, no events, no domain knowledge — a reader function is
 * passed in, so nothing here knows what a weight or a tonnage is.
 */

import { round, mean, sum, linearTrend, toNumber } from './calculation-engine.js';
import { REPORTS, PRECISION } from './constants.js';

/** Sum one field across weekly reports, ignoring the weeks that lack it. */
export const totalOf = (weeks, read) =>
  round(sum(weeks.map(read).filter((n) => toNumber(n) !== null)), 2);

/** Mean of one field across weekly reports, or null when nothing carries it. */
export function meanOf(weeks, read, decimals = PRECISION.PERCENT) {
  const values = weeks.map(read).map(toNumber).filter((n) => n !== null);
  return values.length ? round(mean(values), decimals) : null;
}

/**
 * Fit a line through one weekly figure.
 *
 * @param {object[]} weeks   weekly reports, oldest first
 * @param {Function} read    pulls the figure out of one report
 * @param {{unit?: string, decimals?: number}} [options]
 * @returns {{perWeek: number|null, unit: string, weeks: number,
 *            first?: number, last?: number, note?: string}}
 */
export function trendOf(weeks, read, { unit, decimals = 2 } = {}) {
  const points = weeks
    .map((week, index) => ({ x: index, y: toNumber(read(week)) }))
    .filter((point) => point.y !== null);

  if (points.length < REPORTS.MIN_WEEKS_FOR_TREND) {
    return {
      perWeek: null, unit, weeks: points.length,
      note: `A trend needs at least ${REPORTS.MIN_WEEKS_FOR_TREND} weeks carrying the figure; ${points.length} had it.`,
    };
  }

  const fit = linearTrend(points);
  return fit
    ? { perWeek: round(fit.slope, decimals), unit, weeks: points.length, first: points[0].y, last: points.at(-1).y }
    : { perWeek: null, unit, weeks: points.length, note: 'The readings were identical, so no slope could be fitted.' };
}

/** The values one reader pulls out of a series, nulls removed. */
export function seriesOf(weeks, read) {
  return weeks.map(read).map(toNumber).filter((value) => value !== null);
}
