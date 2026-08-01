/**
 * adjustment-engine.js — the one engine that makes a decision.
 *
 * Everything else calculates. This weighs an observed weight trend against
 * the intended trend and says whether the intake target should move.
 *
 * Rule 7: it never returns a bare number. Every result carries the reason,
 * the evidence behind it, and the formula used, in a shape a page can render
 * directly. If the app cannot explain a decision, it does not make it.
 */

import { defineFormula, createSlot } from './formula.js';
import { round, clamp } from './calculation-engine.js';
import { BodyEngine } from './body-engine.js';
import { ADJUSTMENT, PRECISION } from './constants.js';

/** Actions this engine can return. */
export const ACTION = Object.freeze({
  INCREASE: 'increase',
  DECREASE: 'decrease',
  HOLD: 'hold',
  INSUFFICIENT_DATA: 'insufficient-data',
});

export const RATE_FEEDBACK = defineFormula({
  id: 'rate-feedback-adjustment',
  name: 'Weight-trend feedback adjustment',
  source: 'Closed-loop energy-balance correction, as described in Hall KD, et al. Quantification of the effect of energy imbalance on bodyweight. Lancet. 2011;378(9793):826-837. The step size and tolerance are practice conventions, not results from that paper.',
  accuracy: 'estimate',
  useWhen: 'After at least two weeks of consistent weigh-ins. It corrects the starting estimate using what the body actually did, which beats any prediction equation.',
  caveat: 'Only as good as the weigh-in data. Irregular weighing, or weighing under different conditions, produces a trend that is mostly noise — which is why this refuses to decide below a minimum number of readings.',

  /**
   * @param {object} input
   * @param {{date: string, kg: number}[]} input.readings   weigh-in history
   * @param {number} input.currentWeightKg
   * @param {string} input.goal                             bulk | cut | recomp | maintain
   * @param {number} input.currentTargetKcal
   * @param {number} input.maintenanceKcal
   * @returns {object} decision — see AdjustmentEngine.evaluate
   */
  compute({ readings, currentWeightKg, goal, currentTargetKcal, maintenanceKcal }) {
    const invalid =
      typeof currentWeightKg !== 'number' || !Number.isFinite(currentWeightKg) ||
      typeof currentTargetKcal !== 'number' || !Number.isFinite(currentTargetKcal) ||
      typeof maintenanceKcal !== 'number' || !Number.isFinite(maintenanceKcal);

    if (invalid) {
      return decision({
        action: ACTION.INSUFFICIENT_DATA,
        reason: 'Your profile is incomplete, so there is nothing to compare a trend against.',
        evidence: {},
        currentTargetKcal: currentTargetKcal ?? null,
      });
    }

    const trend = BodyEngine.recentTrend(readings, ADJUSTMENT.WINDOW_DAYS);

    if (!trend || trend.readings < ADJUSTMENT.MIN_READINGS) {
      return decision({
        action: ACTION.INSUFFICIENT_DATA,
        reason: `Not enough weigh-ins yet. ${ADJUSTMENT.MIN_READINGS} readings in the last ${ADJUSTMENT.WINDOW_DAYS} days are needed before changing anything — ${trend?.readings ?? 0} so far.`,
        evidence: {
          readings: trend?.readings ?? 0,
          required: ADJUSTMENT.MIN_READINGS,
          windowDays: ADJUSTMENT.WINDOW_DAYS,
        },
        currentTargetKcal,
      });
    }

    const targetRate = round(
      (ADJUSTMENT.TARGET_RATE_FRACTION[goal] ?? 0) * currentWeightKg,
      PRECISION.RATE_KG_PER_WEEK
    );
    const observedRate = trend.ratePerWeek;

    // A zero target still needs a band, or any fluctuation reads as drift.
    const tolerance = round(
      targetRate === 0
        ? ADJUSTMENT.FLAT_TOLERANCE_FRACTION * currentWeightKg
        : Math.abs(targetRate) * ADJUSTMENT.TOLERANCE_FRACTION,
      PRECISION.RATE_KG_PER_WEEK
    );

    const evidence = {
      observedRateKgPerWeek: observedRate,
      targetRateKgPerWeek: targetRate,
      toleranceKgPerWeek: tolerance,
      readings: trend.readings,
      spanDays: trend.spanDays,
      windowDays: ADJUSTMENT.WINDOW_DAYS,
      goal,
    };

    const weeks = round(ADJUSTMENT.WINDOW_DAYS / 7, 0);

    // Inside the band: the plan is working, leave it alone.
    if (Math.abs(observedRate - targetRate) <= tolerance) {
      return decision({
        action: ACTION.HOLD,
        reason: `Holding at ${currentTargetKcal} kcal. Over the last ${weeks} weeks your weight moved ${formatRate(observedRate)}, which is within ${tolerance} kg/week of the ${formatRate(targetRate)} you are aiming for.`,
        evidence,
        currentTargetKcal,
      });
    }

    const tooSlow = observedRate < targetRate;
    const step = tooSlow ? ADJUSTMENT.STEP_KCAL : -ADJUSTMENT.STEP_KCAL;

    // Never drift further than the cap from maintenance, in either direction.
    const floor = round(maintenanceKcal * (1 - ADJUSTMENT.MAX_DEVIATION_FRACTION), PRECISION.KCAL);
    const ceiling = round(maintenanceKcal * (1 + ADJUSTMENT.MAX_DEVIATION_FRACTION), PRECISION.KCAL);
    const proposed = currentTargetKcal + step;
    const capped = round(clamp(proposed, floor, ceiling), PRECISION.KCAL);

    if (capped === currentTargetKcal) {
      return decision({
        action: ACTION.HOLD,
        reason: `Your weight moved ${formatRate(observedRate)} against a target of ${formatRate(targetRate)}, but the intake target is already at the safe limit of ${currentTargetKcal} kcal (${Math.round(ADJUSTMENT.MAX_DEVIATION_FRACTION * 100)}% from maintenance). Look at training, sleep or how consistently you are logging instead.`,
        evidence: { ...evidence, capped: true, floor, ceiling },
        currentTargetKcal,
      });
    }

    const delta = capped - currentTargetKcal;

    return decision({
      action: delta > 0 ? ACTION.INCREASE : ACTION.DECREASE,
      reason: `${delta > 0 ? 'Raising' : 'Lowering'} the daily target by ${Math.abs(delta)} kcal, to ${capped}. Over the last ${weeks} weeks your weight moved ${formatRate(observedRate)} per week — ${tooSlow ? 'less' : 'more'} than the ${formatRate(targetRate)} this goal calls for, measured across ${trend.readings} weigh-ins.`,
      evidence: { ...evidence, floor, ceiling },
      currentTargetKcal,
      newTargetKcal: capped,
      deltaKcal: delta,
    });
  },
});

/** "+0.31 kg" / "-0.45 kg" / "no change". */
function formatRate(kgPerWeek) {
  if (kgPerWeek === 0) return 'no change';
  return `${kgPerWeek > 0 ? '+' : ''}${kgPerWeek} kg`;
}

/** Shape every decision identically, so a page can render any of them. */
function decision({
  action, reason, evidence,
  currentTargetKcal = null, newTargetKcal = null, deltaKcal = 0,
}) {
  return {
    action,
    deltaKcal,
    currentTargetKcal,
    newTargetKcal: newTargetKcal ?? currentTargetKcal,
    reason,
    evidence,
    decidedAt: new Date().toISOString(),
    formula: RATE_FEEDBACK.describe(),
  };
}

export const adjustmentFormula = createSlot('calorie-adjustment', RATE_FEEDBACK);

export const AdjustmentEngine = Object.freeze({
  /**
   * Should the intake target change?
   *
   * @returns {{action, deltaKcal, currentTargetKcal, newTargetKcal,
   *            reason, evidence, decidedAt, formula}}
   *          Never throws, and never returns a change without a reason.
   */
  evaluate(input) {
    return adjustmentFormula.current.compute(input ?? {});
  },

  /** True when the decision asks for a change. */
  isChange(result) {
    return result?.action === ACTION.INCREASE || result?.action === ACTION.DECREASE;
  },

  formulas() {
    return { adjustment: adjustmentFormula.current.describe() };
  },
});
