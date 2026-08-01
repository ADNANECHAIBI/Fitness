/**
 * running-progress-engine.js — what the running history says.
 *
 * Read-only. It measures; it decides nothing and changes nothing. Pace and
 * totals come from running-engine.js, trend fitting from the calculation
 * engine — nothing is recomputed here that another engine owns.
 */

import { round, mean, sum, linearTrend, percentOf } from './calculation-engine.js';
import { RunningEngine } from './running-engine.js';
import { sessionLoad } from './running-context.js';
import { RUNNING_LOAD, UNITS } from './constants.js';

const MS_PER_DAY = 86400000;

const cutoff = (isoDate, days) =>
  new Date(new Date(`${isoDate}T00:00:00Z`).getTime() - days * MS_PER_DAY)
    .toISOString().slice(0, 10);

export const RunningProgressEngine = Object.freeze({
  /**
   * Every progress metric, from a run history.
   *
   * @param {object[]} runs
   * @param {{asOf?: string}} [options] ISO date to measure from, for tests
   * @returns {object}
   */
  summary(runs = [], { asOf = new Date().toISOString().slice(0, 10) } = {}) {
    // A truthy date is not a usable one: an unparseable string would poison
    // the trend fit and the consistency window.
    const history = [...runs]
      .filter((run) =>
        run?.date &&
        Number.isFinite(new Date(`${run.date}T00:00:00Z`).getTime()) &&
        run.distanceKm > 0 && run.durationMin > 0)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    if (!history.length) {
      return emptySummary(asOf);
    }

    const paces = history.map((run) => RunningEngine.paceSecPerKm(run)).filter(Boolean);

    const bestPaceSec = paces.length ? Math.min(...paces) : null;
    const averagePaceSec = paces.length ? round(mean(paces), 0) : null;

    const inLast = (days) => history.filter((run) => run.date >= cutoff(asOf, days));

    const week = inLast(UNITS.DAYS_PER_WEEK);
    const month = inLast(30);

    const acute = round(sum(inLast(RUNNING_LOAD.ACUTE_DAYS).map(sessionLoad)), 0);
    const chronicTotal = round(sum(inLast(RUNNING_LOAD.CHRONIC_DAYS).map(sessionLoad)), 0);
    const chronic = round(chronicTotal / (RUNNING_LOAD.CHRONIC_DAYS / RUNNING_LOAD.ACUTE_DAYS), 0);

    return {
      asOf,
      totalRuns: history.length,
      firstRun: history[0].date,
      lastRun: history.at(-1).date,

      averagePaceSecPerKm: averagePaceSec,
      averagePace: RunningEngine.formatPace(averagePaceSec),
      bestPaceSecPerKm: bestPaceSec,
      bestPace: RunningEngine.formatPace(bestPaceSec),

      weeklyDistanceKm: round(sum(week.map((run) => run.distanceKm)), 2),
      monthlyDistanceKm: round(sum(month.map((run) => run.distanceKm)), 2),
      totalDistanceKm: round(sum(history.map((run) => run.distanceKm)), 2),
      longestRunKm: round(Math.max(...history.map((run) => run.distanceKm)), 2),

      consistency: consistency(history, asOf),
      trainingLoad: {
        acute,
        chronic,
        ratio: chronic > 0 ? round(acute / chronic, 2) : null,
        safeBand: RUNNING_LOAD.SAFE_RATIO,
        verdict: loadVerdict(chronic > 0 ? acute / chronic : null),
      },
      paceTrend: paceTrend(history),
    };
  },
});

/** Share of the last twelve weeks that contained at least one run. */
function consistency(history, asOf) {
  const weeks = 12;
  const start = new Date(`${asOf}T00:00:00Z`).getTime() - weeks * 7 * MS_PER_DAY;

  const active = new Set(
    history
      .map((run) => new Date(`${run.date}T00:00:00Z`).getTime())
      .filter((time) => time >= start)
      .map((time) => Math.floor((time - start) / (7 * MS_PER_DAY)))
  );

  return {
    weeksConsidered: weeks,
    weeksWithRuns: active.size,
    percent: percentOf(active.size, weeks),
    runsPerWeek: round(mean([...Array(weeks)].map((_, index) =>
      history.filter((run) => {
        const time = new Date(`${run.date}T00:00:00Z`).getTime();
        return time >= start + index * 7 * MS_PER_DAY && time < start + (index + 1) * 7 * MS_PER_DAY;
      }).length)), 1),
  };
}

/** Seconds per km gained or lost per week, from a line through the paces. */
function paceTrend(history) {
  if (history.length < 4) return { secPerKmPerWeek: null, direction: 'unknown', runs: history.length };

  const originTime = new Date(`${history[0].date}T00:00:00Z`).getTime();
  const points = history
    .map((run) => ({
      x: (new Date(`${run.date}T00:00:00Z`).getTime() - originTime) / MS_PER_DAY,
      y: RunningEngine.paceSecPerKm(run),
    }))
    .filter((point) => Number.isFinite(point.x) && point.y !== null);

  const trend = linearTrend(points);
  if (!trend) return { secPerKmPerWeek: null, direction: 'unknown', runs: history.length };

  const perWeek = round(trend.slope * UNITS.DAYS_PER_WEEK, 1);

  return {
    secPerKmPerWeek: perWeek,
    // A negative slope means the pace number is falling, which is faster.
    direction: perWeek <= -2 ? 'improving' : perWeek >= 2 ? 'declining' : 'steady',
    runs: points.length,
  };
}

function loadVerdict(ratio) {
  if (ratio === null) return 'unknown';
  const [low, high] = RUNNING_LOAD.SAFE_RATIO;
  if (ratio > high) return 'spiking';
  if (ratio < low) return 'detraining';
  return 'steady';
}

function emptySummary(asOf) {
  return {
    asOf,
    totalRuns: 0,
    firstRun: null,
    lastRun: null,
    averagePaceSecPerKm: null,
    averagePace: '—',
    bestPaceSecPerKm: null,
    bestPace: '—',
    weeklyDistanceKm: 0,
    monthlyDistanceKm: 0,
    totalDistanceKm: 0,
    longestRunKm: 0,
    consistency: { weeksConsidered: 12, weeksWithRuns: 0, percent: 0, runsPerWeek: 0 },
    trainingLoad: { acute: 0, chronic: 0, ratio: null, safeBand: RUNNING_LOAD.SAFE_RATIO, verdict: 'unknown' },
    paceTrend: { secPerKmPerWeek: null, direction: 'unknown', runs: 0 },
  };
}
