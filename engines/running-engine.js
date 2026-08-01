/**
 * running-engine.js — pace, speed and the energy cost of a run.
 */

import { defineFormula, createSlot } from './formula.js';
import { round, divide, sum } from './calculation-engine.js';
import { RUNNING, UNITS, PRECISION } from './constants.js';

/* ── Formulas ───────────────────────────────────────────────────────────── */

export const PACE_FORMULA = defineFormula({
  id: 'pace',
  name: 'Average pace',
  source: 'Definition: elapsed time divided by distance.',
  accuracy: 'exact',
  useWhen: 'Always. There is nothing to estimate.',

  /** @returns {number|null} seconds per km */
  compute({ distanceKm, durationMin }) {
    if (typeof distanceKm !== 'number' || typeof durationMin !== 'number') return null;
    if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMin)) return null;
    if (distanceKm <= 0 || durationMin <= 0) return null;

    return divide(durationMin * UNITS.SECONDS_PER_MINUTE, distanceKm);
  },
});

export const MET_ENERGY = defineFormula({
  id: 'met-running-energy',
  name: 'MET energy expenditure',
  source: 'Ainsworth BE, et al. 2011 Compendium of Physical Activities. Med Sci Sports Exerc. 2011;43(8):1575-1581.',
  accuracy: 'estimate',
  useWhen: 'Estimating the energy cost of a run when no heart-rate or power data is available.',
  caveat: 'Ignores terrain, wind, temperature and running economy, and treats everyone of the same weight as identical. Expect ±20% against indirect calorimetry.',

  /** @returns {number|null} kcal */
  compute({ distanceKm, durationMin, weightKg }) {
    const values = [distanceKm, durationMin, weightKg];
    if (!values.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) return null;

    const hours = durationMin / UNITS.MINUTES_PER_HOUR;
    const speedKmh = distanceKm / hours;
    const band = RUNNING.MET_BY_SPEED_KMH.find((entry) => speedKmh <= entry.upTo);

    return round(
      band.met * RUNNING.MET_KCAL_PER_KG_PER_HOUR * weightKg * hours,
      PRECISION.KCAL
    );
  },
});

/* ── Replaceable slots ──────────────────────────────────────────────────── */

export const paceFormula = createSlot('pace', PACE_FORMULA);
export const runEnergyFormula = createSlot('run-energy', MET_ENERGY);

/* ── Engine ─────────────────────────────────────────────────────────────── */

export const RunningEngine = Object.freeze({
  /** @returns {number|null} seconds per km */
  paceSecPerKm(run) { return paceFormula.current.compute(run ?? {}); },

  /** Seconds per km as "m:ss". Always returns a string. */
  formatPace(secondsPerKm) {
    if (typeof secondsPerKm !== 'number' || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
      return '—';
    }
    const minutes = Math.floor(secondsPerKm / UNITS.SECONDS_PER_MINUTE);
    const seconds = Math.round(secondsPerKm % UNITS.SECONDS_PER_MINUTE);
    // 5:60 is not a pace — carry it.
    return seconds === UNITS.SECONDS_PER_MINUTE
      ? `${minutes + 1}:00`
      : `${minutes}:${String(seconds).padStart(2, '0')}`;
  },

  /** @returns {number|null} km/h */
  speedKmh({ distanceKm, durationMin }) {
    if (typeof distanceKm !== 'number' || typeof durationMin !== 'number') return null;
    if (distanceKm <= 0 || durationMin <= 0) return null;
    return round(divide(distanceKm, durationMin / UNITS.MINUTES_PER_HOUR), PRECISION.KM);
  },

  /** @returns {number|null} kcal */
  energyKcal(run) { return runEnergyFormula.current.compute(run ?? {}); },

  /**
   * Totals for a set of runs.
   * @returns {{runs, distanceKm, durationMin, avgPaceSecPerKm, avgPace}}
   */
  totals(runs) {
    const list = Array.isArray(runs) ? runs : [];
    const distanceKm = round(sum(list.map((run) => run.distanceKm)), PRECISION.KM);
    const durationMin = round(sum(list.map((run) => run.durationMin)), 1);

    const avgPaceSecPerKm = this.paceSecPerKm({ distanceKm, durationMin });

    return {
      runs: list.length,
      distanceKm,
      durationMin,
      avgPaceSecPerKm,
      avgPace: this.formatPace(avgPaceSecPerKm),
    };
  },

  formulas() {
    return {
      pace: paceFormula.current.describe(),
      energy: runEnergyFormula.current.describe(),
    };
  },
});
