/**
 * volume-rules.js — how many sets the week may hold, and how they are shared.
 *
 * Sets are the unit of volume here, not tonnage: a set taken near failure is
 * the stimulus, and load is what progresses within it.
 *
 * The rules set a weekly budget; exercise-selection.js spends it.
 */

import { defineRule } from '../rule.js';
import { WORKOUT, PROGRESSION } from '../../engines/constants.js';
import { round } from '../../engines/calculation-engine.js';

export const volumeRules = [
  defineRule({
    id: 'volume.weekly-budget',
    name: 'Weekly set budget',
    scope: 'week',
    priority: 100,
    when: (context) => context.gymDayCount > 0,
    apply: (context) => ({
      patch: {
        weeklySetsPerMuscle: context.weeklySetTarget,
        setsPerExercise: { ...WORKOUT.SETS_PER_EXERCISE },
      },
      message: `Targeting about ${context.weeklySetTarget} working sets per muscle this week — the ${context.level} range, scaled for a ${context.phase} block.`,
    }),
  }),

  defineRule({
    id: 'volume.deload-cut',
    name: 'Deload cuts sets',
    scope: 'week',
    priority: 95,
    when: (context) => context.deload,
    apply: (context, draft) => {
      const target = round(draft.weeklySetsPerMuscle * PROGRESSION.DELOAD_SET_FACTOR, 0);
      const perExercise = Object.fromEntries(
        Object.entries(draft.setsPerExercise).map(([key, value]) =>
          [key, Math.max(1, Math.round(value * PROGRESSION.DELOAD_SET_FACTOR))])
      );

      return {
        patch: { weeklySetsPerMuscle: target, setsPerExercise: perExercise },
        message: `Sets are cut to ${Math.round(PROGRESSION.DELOAD_SET_FACTOR * 100)}% — about ${target} per muscle. A deload that keeps the volume is not a deload.`,
      };
    },
  }),

  defineRule({
    id: 'volume.plan-volume-factor',
    name: 'Volume follows the planner',
    scope: 'week',
    priority: 90,
    when: (context, draft) => !context.deload && context.volumeFactor < 1 && draft.weeklySetsPerMuscle,
    apply: (context, draft) => {
      const target = Math.max(1, round(draft.weeklySetsPerMuscle * context.volumeFactor, 0));
      return {
        patch: { weeklySetsPerMuscle: target },
        message: `Volume is held at ${Math.round(context.volumeFactor * 100)}% of normal — about ${target} sets per muscle — because the weekly plan already reduced the load for recovery reasons.`,
      };
    },
  }),

  defineRule({
    id: 'volume.back-off-after-a-heavy-week',
    name: 'Back off after a heavy week',
    scope: 'week',
    priority: 80,
    when: (context, draft) => {
      const done = Object.values(context.history.lastWeekSetsByMuscle);
      if (!done.length || !context.history.hasHistory) return false;
      const overMax = done.filter((sets) => sets > context.weeklySetMax);
      return overMax.length >= 2 && !context.deload && draft.weeklySetsPerMuscle > context.weeklySetMin;
    },
    apply: (context, draft) => {
      const over = Object.entries(context.history.lastWeekSetsByMuscle)
        .filter(([, sets]) => sets > context.weeklySetMax)
        .map(([muscle]) => muscle);
      const target = Math.max(context.weeklySetMin, draft.weeklySetsPerMuscle - 2);

      return {
        patch: { weeklySetsPerMuscle: target },
        message: `Two sets per muscle are taken back, to about ${target}. Last week ${over.join(' and ')} went past the ${context.weeklySetMax}-set ceiling for your level, and volume beyond what you recover from is junk volume.`,
      };
    },
  }),

  defineRule({
    id: 'volume.build-up-from-nothing',
    name: 'Start low with no history',
    scope: 'week',
    priority: 70,
    when: (context) => !context.history.hasHistory && !context.deload,
    apply: (context, draft) => ({
      patch: { weeklySetsPerMuscle: Math.max(context.weeklySetMin, draft.weeklySetsPerMuscle - 2) },
      message: `Starting nearer the bottom of the range, at about ${Math.max(context.weeklySetMin, draft.weeklySetsPerMuscle - 2)} sets per muscle. Nothing has been logged yet, so there is no evidence of what you recover from — it is easier to add volume later than to undo a week that wrecked you.`,
    }),
  }),

  defineRule({
    id: 'volume.rep-and-rpe-targets',
    name: 'Rep range and effort from the phase',
    scope: 'week',
    priority: 60,
    when: () => true,
    apply: (context) => {
      const [low, high] = WORKOUT.PHASE_REP_RANGE[context.phase] ?? WORKOUT.PHASE_REP_RANGE.hypertrophy;
      const rpe = WORKOUT.PHASE_RPE[context.phase] ?? 8;

      return {
        patch: { repRange: [low, high], targetRpe: rpe, restFactor: WORKOUT.PHASE_REST_FACTOR[context.phase] ?? 1 },
        message: `Working sets of ${low} to ${high} reps at about RPE ${rpe} — roughly ${round(10 - rpe, 0)} reps left in the tank. That is what a ${context.phase} block calls for.`,
      };
    },
  }),
];
