/**
 * energy-engine.js — resting metabolism, maintenance and intake targets.
 *
 * Builds on the calculation engine; holds no storage, no events, no DOM.
 * Every equation is a Formula with a citation, so the app can always tell the
 * user where a number came from and how much to trust it.
 */

import { defineFormula, createSlot } from './formula.js';
import { round, clamp, divide } from './calculation-engine.js';
import {
  MIFFLIN, KATCH_MCARDLE, ACTIVITY_FACTOR, DEFAULT_ACTIVITY_FACTOR,
  GOAL_ADJUSTMENT, MACRO_PER_KG, UNITS, PRECISION,
} from './constants.js';

/* ── Formulas ───────────────────────────────────────────────────────────── */

export const MIFFLIN_ST_JEOR = defineFormula({
  id: 'mifflin-st-jeor',
  name: 'Mifflin-St Jeor',
  source: 'Mifflin MD, St Jeor ST, et al. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr. 1990;51(2):241-247.',
  accuracy: 'estimate',
  useWhen: 'Default for anyone whose body-fat percentage is unknown. It is the equation most commonly recommended for healthy adults.',
  caveat: 'Fitted to a population, so an individual can sit roughly 10% either side of the prediction. It over-estimates for very lean, muscular people and under-estimates at high body-fat percentages. Treat it as a starting point and correct it against real weight change.',

  /**
   * @param {{weightKg: number, heightCm: number, age: number, sex: 'male'|'female'}} input
   * @returns {number|null} kcal per day
   */
  compute({ weightKg, heightCm, age, sex }) {
    if (![weightKg, heightCm, age].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    if (sex !== 'male' && sex !== 'female') return null;

    const base =
      MIFFLIN.WEIGHT_COEFFICIENT * weightKg +
      MIFFLIN.HEIGHT_COEFFICIENT * heightCm +
      MIFFLIN.AGE_COEFFICIENT * age;

    const constant = sex === 'male' ? MIFFLIN.MALE_CONSTANT : MIFFLIN.FEMALE_CONSTANT;
    return round(base + constant, PRECISION.KCAL);
  },

  explain({ weightKg, heightCm, age, sex }) {
    return `Mifflin-St Jeor from ${weightKg} kg, ${heightCm} cm, age ${age}, ${sex}.`;
  },
});

export const KATCH_MCARDLE_BMR = defineFormula({
  id: 'katch-mcardle',
  name: 'Katch-McArdle',
  source: 'Katch FI, McArdle WD. Nutrition, Weight Control and Exercise. 2nd ed. Lea & Febiger; 1983.',
  accuracy: 'estimate',
  useWhen: 'Better than Mifflin-St Jeor once body-fat percentage is measured, because it works from lean mass rather than total weight.',
  caveat: 'Only as good as the body-fat measurement behind it. A guessed body-fat percentage makes this worse than Mifflin-St Jeor, not better.',

  /**
   * @param {{weightKg: number, bodyFatPercent: number}} input
   * @returns {number|null} kcal per day
   */
  compute({ weightKg, bodyFatPercent }) {
    if (typeof weightKg !== 'number' || typeof bodyFatPercent !== 'number') return null;
    if (!Number.isFinite(weightKg) || !Number.isFinite(bodyFatPercent)) return null;
    if (bodyFatPercent < 0 || bodyFatPercent >= 100) return null;

    const leanMassKg = weightKg * (1 - bodyFatPercent / 100);
    return round(KATCH_MCARDLE.BASE + KATCH_MCARDLE.LEAN_MASS_COEFFICIENT * leanMassKg, PRECISION.KCAL);
  },

  explain({ bodyFatPercent }) {
    return `Katch-McArdle from lean mass at ${bodyFatPercent}% body fat.`;
  },
});

export const HARRIS_BENEDICT_ACTIVITY = defineFormula({
  id: 'activity-multiplier',
  name: 'Activity multiplier',
  source: 'Harris JA, Benedict FG. A Biometric Study of Human Basal Metabolism. PNAS. 1918;4(12):370-373 — multiplier convention as popularised in later dietetics practice.',
  accuracy: 'estimate',
  useWhen: 'Converting resting metabolism into total daily expenditure when no activity tracker data is available.',
  caveat: 'The bands are coarse. Two people who both call themselves "moderately active" can differ by several hundred kcal a day.',

  /**
   * @param {{bmr: number, activityLevel: string}} input
   * @returns {number|null} kcal per day
   */
  compute({ bmr, activityLevel }) {
    if (typeof bmr !== 'number' || !Number.isFinite(bmr)) return null;
    const factor = ACTIVITY_FACTOR[activityLevel] ?? DEFAULT_ACTIVITY_FACTOR;
    return round(bmr * factor, PRECISION.KCAL);
  },
});

/* ── Replaceable slots (rule 5) ─────────────────────────────────────────── */

/** Swap with `bmrFormula.use('katch-mcardle')` — nothing else changes. */
export const bmrFormula = createSlot('bmr', MIFFLIN_ST_JEOR, [KATCH_MCARDLE_BMR]);
export const tdeeFormula = createSlot('tdee', HARRIS_BENEDICT_ACTIVITY);

/* ── Engine ─────────────────────────────────────────────────────────────── */

export const EnergyEngine = Object.freeze({
  /**
   * Resting metabolic rate.
   * @param {object} input  fields depend on the active formula
   * @returns {number|null} kcal per day
   */
  bmr(input) {
    return bmrFormula.current.compute(input ?? {});
  },

  /**
   * Total daily energy expenditure.
   * @returns {number|null} kcal per day
   */
  tdee(input) {
    const bmr = this.bmr(input);
    if (bmr === null) return null;
    return tdeeFormula.current.compute({ bmr, activityLevel: input?.activityLevel });
  },

  /**
   * Daily intake target and macro split for a goal.
   *
   * @param {object} input  weightKg, heightCm, age, sex, activityLevel, goal
   * @returns {{calories, proteinG, carbsG, fatG, tdee, bmr, adjustment}|null}
   */
  target(input) {
    const bmr = this.bmr(input);
    const tdee = this.tdee(input);
    if (bmr === null || tdee === null) return null;

    const goal = input?.goal;
    const adjustment = GOAL_ADJUSTMENT[goal] ?? 0;
    const calories = round(tdee * (1 + adjustment), PRECISION.KCAL);

    const proteinPerKg = goal === 'cut' ? MACRO_PER_KG.PROTEIN_CUT : MACRO_PER_KG.PROTEIN_DEFAULT;
    const proteinG = round(input.weightKg * proteinPerKg, PRECISION.GRAMS);
    const fatG = round(input.weightKg * MACRO_PER_KG.FAT_DEFAULT, PRECISION.GRAMS);

    // Carbohydrate takes whatever energy is left once protein and fat are set.
    const remaining =
      calories - proteinG * UNITS.KCAL_PER_G_PROTEIN - fatG * UNITS.KCAL_PER_G_FAT;
    const carbsG = Math.max(0, round(divide(remaining, UNITS.KCAL_PER_G_CARB) ?? 0, PRECISION.GRAMS));

    return { calories, proteinG, carbsG, fatG, tdee, bmr, adjustment };
  },

  /** Energy in a macro breakdown. @returns {number|null} kcal */
  caloriesFromMacros({ proteinG = 0, carbsG = 0, fatG = 0 } = {}) {
    const values = [proteinG, carbsG, fatG];
    if (!values.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null;

    return round(
      proteinG * UNITS.KCAL_PER_G_PROTEIN +
      carbsG * UNITS.KCAL_PER_G_CARB +
      fatG * UNITS.KCAL_PER_G_FAT,
      PRECISION.KCAL
    );
  },

  /** Metadata for whatever is currently in the slots. */
  formulas() {
    return { bmr: bmrFormula.current.describe(), tdee: tdeeFormula.current.describe() };
  },
});
