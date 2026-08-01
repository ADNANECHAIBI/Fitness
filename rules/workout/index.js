/**
 * rules/workout/index.js — the workout rule sets, in pipeline order.
 *
 * Adding a rule: write it in the file for its domain, and it runs.
 * Replacing a set: pass your own arrays into WorkoutEngine.build().
 */

export { splitRules, TEMPLATES } from './split-rules.js';
export { volumeRules } from './volume-rules.js';
export { equipmentRules } from './equipment-rules.js';
export { injuryRules } from './injury-rules.js';
export { correctiveRules } from './corrective-training.js';
export { workoutRecoveryRules } from './recovery-rules.js';
export {
  criteriaRules, rankCandidates, scoreCandidate, explainChoice, setsFor,
} from './exercise-selection.js';
export { overloadRules, ACTION, warmupSetsFor } from './progressive-overload.js';

import { splitRules } from './split-rules.js';
import { volumeRules } from './volume-rules.js';
import { equipmentRules } from './equipment-rules.js';
import { injuryRules } from './injury-rules.js';
import { correctiveRules } from './corrective-training.js';
import { workoutRecoveryRules } from './recovery-rules.js';
import { criteriaRules } from './exercise-selection.js';
import { overloadRules } from './progressive-overload.js';

/**
 * The default pipeline.
 *   split      → which muscles each day serves        (one wins)
 *   equipment  → what can be performed                (stack)
 *   injury     → what must be left out                (stack)
 *   volume     → how many sets, what reps, what RPE   (stack)
 *   recovery   → how hard, and how loads are scaled   (stack)
 *   corrective → what gets added on top               (stack)
 *   criteria   → per slot, what to ask the database   (stack)
 *   overload   → per exercise, what to do with load   (one wins)
 */
export const WORKOUT_RULE_SETS = Object.freeze({
  split: splitRules,
  equipment: equipmentRules,
  injury: injuryRules,
  volume: volumeRules,
  recovery: workoutRecoveryRules,
  corrective: correctiveRules,
  criteria: criteriaRules,
  overload: overloadRules,
});

/** Every workout rule, flattened. */
export function allWorkoutRules() {
  return Object.values(WORKOUT_RULE_SETS).flat();
}
