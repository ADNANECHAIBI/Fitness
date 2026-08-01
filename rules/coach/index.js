/**
 * rules/coach/index.js — every coaching rule, and what makes what redundant.
 *
 * Fifty rules across ten categories. All of them run — none excludes another
 * at match time — because a week genuinely can need less volume, more food,
 * more sleep and a smaller plan at once, and a coach that reported only the
 * loudest of those would be hiding three real problems.
 *
 * What stops that becoming a wall of text happens *after* ranking, in two
 * steps:
 *
 *   1. **Suppression.** Some advice makes other advice redundant as a
 *      sentence even though both are true as findings. "Do not train today"
 *      already implies "take the volume down"; printing both reads as a
 *      machine repeating itself. The table below says which. It is applied to
 *      the ranked list, so the survivor is the more important one rather than
 *      whichever rule happens to be declared first.
 *
 *   2. **Caps.** `COACH.MAX_DAILY` and `MAX_WEEKLY` trim what is left. A
 *      coach that says four things gets one of them done; a coach that says
 *      twelve gets none.
 *
 * Nothing is dropped silently — the engine records every suppression and every
 * trim, with the key that displaced it.
 */

export { trainingRules, planningRules } from './training-rules.js';
export { runningRules, nutritionRules, weightRules } from './body-rules.js';
export {
  recoveryRules, consistencyRules, goalRules, motivationRules, healthRules,
} from './life-rules.js';

import { trainingRules, planningRules } from './training-rules.js';
import { runningRules, nutritionRules, weightRules } from './body-rules.js';
import {
  recoveryRules, consistencyRules, goalRules, motivationRules, healthRules,
} from './life-rules.js';

export const COACH_RULE_SETS = Object.freeze({
  training: trainingRules,
  running: runningRules,
  nutrition: nutritionRules,
  recovery: recoveryRules,
  weight: weightRules,
  consistency: consistencyRules,
  goal: goalRules,
  motivation: motivationRules,
  health: healthRules,
  planning: planningRules,
});

export function allCoachRules() {
  return Object.values(COACH_RULE_SETS).flat();
}

/**
 * Advice key → the keys it makes redundant.
 *
 * Read as: "if this survives ranking, these others add nothing a reader would
 * act on separately." The relation is deliberately one-directional and not
 * transitive — each entry was decided on its own rather than derived, because
 * two pieces of advice overlapping is a judgement about wording, not a fact
 * about the data.
 */
export const SUPPRESSES = Object.freeze({
  /* Not training today covers every instruction about how to train today. */
  'recovery.rest-today': [
    'training.session-today', 'running.run-today', 'training.reduce-load',
  ],

  /* Overreaching is the strongest recovery statement; the rest restate it. */
  'recovery.overreaching': [
    'training.reduce-load', 'training.add-rest-day', 'recovery.deload-now',
    'running.reduce-frequency',
  ],

  /* Persistent fatigue outranks any programme instruction about fatigue. */
  'health.persistent-fatigue': [
    'recovery.overreaching', 'recovery.deload-now', 'training.reduce-load',
    'recovery.sleep-more',
  ],

  /* With no data, nothing below is worth reading. */
  'health.not-enough-data': [
    'training.hold-the-plan', 'nutrition.hold-calories', 'goal.dont-change-goal',
    'motivation.first-weeks', 'weight.watch-the-scale',
  ],

  /* With no plan, advice about following one is premature. */
  'planning.generate-week': [
    'consistency.focus-on-showing-up', 'training.session-today', 'running.run-today',
  ],

  /* If the plan is not being followed, optimising it is noise. */
  'consistency.focus-on-showing-up': [
    'training.plateau-change-stimulus', 'training.volume-too-low',
    'running.build-base', 'nutrition.hold-calories', 'training.hold-the-plan',
  ],

  /* A stalled bulk and "watch the scale" are the same observation twice. */
  'nutrition.increase-calories': ['weight.watch-the-scale', 'nutrition.hold-calories'],
  'nutrition.reduce-calories': ['weight.watch-the-scale', 'nutrition.hold-calories'],

  /* Rate warnings replace the reassurance that the rate is fine. */
  'weight.gaining-too-fast': ['nutrition.hold-calories', 'goal.dont-change-goal'],
  'weight.losing-too-fast': ['nutrition.hold-calories', 'goal.dont-change-goal'],

  /* Coming back from a break replaces ordinary progression advice. */
  'consistency.after-layoff': [
    'training.plateau-change-stimulus', 'training.volume-too-low', 'running.build-base',
  ],

  /* A reached goal makes advice about pursuing it redundant. */
  'goal.reached': ['goal.dont-change-goal', 'goal.wrong-direction'],

  /* One instruction about the week beats several. */
  'planning.review-after-warnings': ['training.hold-the-plan'],

  /* A spiking load already says what to do about running volume. */
  'running.add-easy-run': ['running.build-base', 'running.no-extra-cardio'],
});
