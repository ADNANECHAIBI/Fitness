/**
 * protocols.js — warm-up, cool-down, activation and recovery items.
 *
 * These are session bookends. The Workout Engine will ask for a `warmup` or a
 * `cooldown` the same way it asks for a compound horizontal push.
 */

import { EXERCISE_TYPE as T, MOVEMENT as M, CATEGORY as C, EQUIPMENT as E, DIFFICULTY as D, MUSCLE as U } from '../taxonomy.js';

const item = (type, slot) => (record) => ({
  type, category: C.MOBILITY, difficulty: D.BEGINNER, slot, defaultRest: 30, ...record,
});

const warmup = item(T.WARMUP, 'prep');
const cooldown = item(T.COOLDOWN, 'cooldown');
const activation = item(T.ACTIVATION, 'prep');
const recovery = item(T.RECOVERY, 'cooldown');

export const protocolExercises = [
  warmup({
    id: 'general-warmup-cardio', name: 'General Warm-Up', movement: M.GAIT, equipmentAny: [E.OUTDOOR, E.TREADMILL, E.NONE],
    muscles: { primary: [U.QUADS, U.CALVES], secondary: [U.CORE] },
    alternatives: ['dynamic-leg-swings', 'jump-rope'],
    execution: ['Five to ten minutes of easy movement until you are warm and breathing a little harder.'],
    commonMistakes: ['Skipping it entirely', 'Making it hard enough to count as a workout'],
    tags: ['every-session'],
  }),
  warmup({
    id: 'dynamic-leg-swings', name: 'Dynamic Leg Swings', movement: M.GAIT, equipment: [E.NONE],
    unilateral: true,
    muscles: { primary: [U.HIP_FLEXORS, U.HAMSTRINGS], secondary: [U.GLUTES] },
    alternatives: ['worlds-greatest-stretch', 'general-warmup-cardio'],
    execution: ['Hold a support and swing one leg forwards and back, then side to side.'],
    commonMistakes: ['Forcing range with momentum before the hip is warm'],
    tags: ['lower-body', 'running-prep'],
  }),
  warmup({
    id: 'jump-rope', name: 'Jump Rope', movement: M.GAIT, equipment: [E.NONE],
    muscles: { primary: [U.CALVES], secondary: [U.QUADS, U.CORE, U.FOREARMS] },
    alternatives: ['general-warmup-cardio'],
    execution: ['Light, quick bounces on the balls of the feet.'],
    commonMistakes: ['Jumping far higher than the rope needs'],
    tags: ['conditioning', 'home'],
  }),
  warmup({
    id: 'ramp-up-sets', name: 'Ramp-Up Sets', movement: M.STATIC, equipmentAny: [E.BARBELL, E.DUMBBELL, E.MACHINE],
    muscles: { primary: [], secondary: [] },
    alternatives: [],
    execution: [
      'Before the first working set, do two to four progressively heavier sets of the same movement.',
      'Keep the reps low so they prepare you rather than tire you.',
    ],
    commonMistakes: ['Doing warm-up sets to failure', 'Jumping straight to the working weight on a heavy compound'],
    tags: ['strength', 'every-heavy-lift'],
  }),

  activation({
    id: 'glute-activation-series', name: 'Glute Activation Series', movement: M.HINGE, equipment: [E.BAND, E.MAT],
    muscles: { primary: [U.GLUTES], secondary: [U.CORE] },
    alternatives: ['glute-bridge', 'clamshell', 'monster-walk'],
    execution: ['A short sequence of bridges, clamshells and banded walks before lower-body work.'],
    commonMistakes: ['Doing enough volume to fatigue the glutes before the main lift'],
    tags: ['leg-day', 'prep'],
  }),
  activation({
    id: 'scapular-activation-series', name: 'Scapular Activation Series', movement: M.HORIZONTAL_PULL, equipment: [E.BAND],
    muscles: { primary: [U.UPPER_BACK, U.REAR_DELTS], secondary: [] },
    alternatives: ['band-pull-apart', 'scapular-wall-slide', 'prone-y-raise'],
    execution: ['Pull-aparts, wall slides and scapular pulls before pressing or pulling.'],
    commonMistakes: ['Rushing through without feeling the shoulder blades move'],
    tags: ['push-day', 'pull-day', 'rounded-shoulders'],
  }),

  cooldown({
    id: 'cooldown-walk', name: 'Cool-Down Walk', movement: M.GAIT, equipmentAny: [E.OUTDOOR, E.TREADMILL],
    muscles: { primary: [U.CALVES], secondary: [] },
    alternatives: ['recovery-jog', 'breathing-drill'],
    execution: ['Five minutes of easy walking to let the heart rate come down gradually.'],
    commonMistakes: ['Stopping dead after a hard effort'],
    tags: ['every-session'],
  }),
  cooldown({
    id: 'breathing-drill', name: 'Diaphragmatic Breathing', movement: M.STATIC, equipment: [E.MAT],
    muscles: { primary: [U.CORE], secondary: [] },
    alternatives: ['childs-pose', 'cooldown-walk'],
    execution: ['Lie on your back, one hand on the belly.', 'Breathe in through the nose so the belly rises, out slowly through the mouth.'],
    commonMistakes: ['Breathing into the chest and shoulders'],
    tags: ['recovery', 'sleep'],
  }),

  recovery({
    id: 'foam-roll-lower-body', name: 'Lower-Body Foam Rolling', movement: M.STATIC, equipment: [E.FOAM_ROLLER],
    muscles: { primary: [U.QUADS, U.CALVES, U.GLUTES], secondary: [U.HAMSTRINGS] },
    alternatives: ['hamstring-stretch', 'calf-stretch'],
    execution: ['Roll slowly over each area, pausing on tender spots and breathing.'],
    commonMistakes: ['Rolling fast', 'Rolling directly over a joint or the lower back'],
    tags: ['recovery', 'soft-tissue'],
  }),
  recovery({
    id: 'rest-day-walk', name: 'Rest-Day Walk', movement: M.GAIT, equipment: [E.OUTDOOR],
    muscles: { primary: [U.CALVES, U.GLUTES], secondary: [] },
    alternatives: ['brisk-walk', 'breathing-drill'],
    execution: ['An easy walk on a rest day — movement without training stress.'],
    commonMistakes: ['Turning a rest day into another session'],
    tags: ['recovery', 'rest-day'],
  }),
];
