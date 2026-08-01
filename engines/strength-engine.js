/**
 * strength-engine.js — training volume and intensity.
 */

import { defineFormula, createSlot } from './formula.js';
import { round, sum, divide, percentOf } from './calculation-engine.js';
import { ONE_REP_MAX, PRECISION } from './constants.js';

/* ── Formulas ───────────────────────────────────────────────────────────── */

export const VOLUME_LOAD = defineFormula({
  id: 'volume-load',
  name: 'Volume load (tonnage)',
  source: 'Standard tonnage measure; see Haff GG, Triplett NT (eds). Essentials of Strength Training and Conditioning. 4th ed. NSCA/Human Kinetics; 2016.',
  accuracy: 'exact',
  useWhen: 'Comparing how much work a session or a week contained. It is a definition, not a model, so it is exact by construction.',
  caveat: 'Exact as arithmetic, but blind to how hard the work was. 100 kg of easy volume and 100 kg taken to failure score the same.',

  /** @returns {number|null} kg */
  compute({ sets, reps, weightKg }) {
    const values = [sets, reps, weightKg];
    if (!values.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null;
    return round(sets * reps * weightKg, 1);
  },
});

export const EPLEY = defineFormula({
  id: 'epley',
  name: 'Epley one-rep max',
  source: 'Epley B. Poundage Chart. Boyd Epley Workout. University of Nebraska; 1985.',
  accuracy: 'estimate',
  useWhen: 'Estimating a one-rep max from a set taken close to failure at up to about 10 reps.',
  caveat: `Drifts upward past ${ONE_REP_MAX.MAX_RELIABLE_REPS} reps, and assumes the set was genuinely near failure. A set with reps left in reserve gives a number that is too low.`,

  /** @returns {number|null} kg */
  compute({ weightKg, reps }) {
    if (typeof weightKg !== 'number' || typeof reps !== 'number') return null;
    if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null;
    if (weightKg <= 0 || reps < 1) return null;
    if (reps === 1) return round(weightKg, PRECISION.KG);

    return round(weightKg * (1 + reps * ONE_REP_MAX.EPLEY_COEFFICIENT), PRECISION.KG);
  },
});

export const BRZYCKI = defineFormula({
  id: 'brzycki',
  name: 'Brzycki one-rep max',
  source: 'Brzycki M. Strength testing: predicting a one-rep max from reps to fatigue. JOPERD. 1993;64(1):88-90.',
  accuracy: 'estimate',
  useWhen: 'An alternative to Epley. Below ten reps it reads lower, which many lifters find closer to reality for heavy sets. The two formulas cross at exactly ten reps and Brzycki reads higher above that.',
  caveat: `Undefined at ${ONE_REP_MAX.BRZYCKI_OFFSET} reps and nonsensical beyond it, because the denominator collapses.`,

  /** @returns {number|null} kg */
  compute({ weightKg, reps }) {
    if (typeof weightKg !== 'number' || typeof reps !== 'number') return null;
    if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null;
    if (weightKg <= 0 || reps < 1) return null;
    if (reps >= ONE_REP_MAX.BRZYCKI_OFFSET) return null;

    const denominator = ONE_REP_MAX.BRZYCKI_OFFSET - reps;
    return round(divide(weightKg * ONE_REP_MAX.BRZYCKI_NUMERATOR, denominator), PRECISION.KG);
  },
});

/* ── Replaceable slots ──────────────────────────────────────────────────── */

export const volumeFormula = createSlot('volume', VOLUME_LOAD);
export const oneRepMaxFormula = createSlot('one-rep-max', EPLEY, [BRZYCKI]);

/* ── Engine ─────────────────────────────────────────────────────────────── */

export const StrengthEngine = Object.freeze({
  /** Tonnage for one entry. @returns {number|null} kg */
  volume(entry) { return volumeFormula.current.compute(entry ?? {}); },

  /** Tonnage across many entries. @returns {number} kg */
  totalVolume(entries) {
    if (!Array.isArray(entries)) return 0;
    return round(sum(entries.map((entry) => this.volume(entry) ?? 0)), 1);
  },

  /**
   * Estimated one-rep max.
   * @returns {{value: number|null, reliable: boolean, formula: object}}
   */
  oneRepMax({ weightKg, reps }) {
    const value = oneRepMaxFormula.current.compute({ weightKg, reps });
    return {
      value,
      reliable: value !== null && reps <= ONE_REP_MAX.MAX_RELIABLE_REPS,
      formula: oneRepMaxFormula.current.describe(),
    };
  },

  /** Working weight as a percentage of an estimated max. @returns {number|null} */
  intensityPercent({ weightKg, reps }) {
    const max = oneRepMaxFormula.current.compute({ weightKg, reps });
    return max === null ? null : percentOf(weightKg, max);
  },

  /** Volume grouped by muscle. @returns {Record<string, number>} */
  volumeByMuscle(entries) {
    const totals = {};
    for (const entry of Array.isArray(entries) ? entries : []) {
      const volume = this.volume(entry);
      if (volume === null || !entry.muscle) continue;
      totals[entry.muscle] = round((totals[entry.muscle] ?? 0) + volume, 1);
    }
    return totals;
  },

  formulas() {
    return {
      volume: volumeFormula.current.describe(),
      oneRepMax: oneRepMaxFormula.current.describe(),
    };
  },
});
