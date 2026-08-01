/**
 * running.js — running sessions, described as protocols rather than distances.
 *
 * A session says what kind of effort it is; the actual distance comes from the
 * runner's current fitness, which lives in the running history, not here.
 */

import { EXERCISE_TYPE as T, MOVEMENT as M, CATEGORY as C, EQUIPMENT as E, DIFFICULTY as D, MUSCLE as U } from '../taxonomy.js';

const R = T.RUNNING;
const LEGS = { primary: [U.QUADS, U.HAMSTRINGS, U.CALVES], secondary: [U.GLUTES, U.CORE] };
/** Either works — the runner needs one of them, not both. */
const GEAR = [E.OUTDOOR, E.TREADMILL];

export const runningExercises = [
  {
    id: 'easy-run', name: 'Easy Run', type: R, movement: M.GAIT, category: C.CONDITIONING,
    equipment: GEAR, difficulty: D.BEGINNER, slot: 'main', defaultRest: 0, muscles: LEGS,
    alternatives: ['recovery-jog', 'long-run', 'brisk-walk'],
    execution: [
      'Run at a pace where you could hold a conversation in full sentences.',
      'If you cannot, you are running too fast — easy days being too hard is the most common mistake in endurance training.',
    ],
    commonMistakes: ['Running easy days at a moderate pace, which leaves you too tired for the hard ones'],
    tags: ['aerobic-base', 'most-of-your-running'],
  },
  {
    id: 'long-run', name: 'Long Run', type: R, movement: M.GAIT, category: C.CONDITIONING,
    equipment: GEAR, difficulty: D.INTERMEDIATE, slot: 'main', defaultRest: 0, muscles: LEGS,
    alternatives: ['easy-run'],
    execution: ['The week\u2019s longest run, at easy pace.', 'Increase its length by no more than about 10% a week.'],
    commonMistakes: ['Adding distance too quickly', 'Starting faster than easy pace and fading'],
    tags: ['aerobic-base', 'weekend'],
  },
  {
    id: 'recovery-jog', name: 'Recovery Jog', type: R, movement: M.GAIT, category: C.CONDITIONING,
    equipment: GEAR, difficulty: D.BEGINNER, slot: 'cooldown', defaultRest: 0, muscles: LEGS,
    alternatives: ['brisk-walk', 'easy-run'],
    execution: ['Very light, short, and slower than easy pace.', 'The purpose is blood flow, not fitness.'],
    commonMistakes: ['Treating it as a training session'],
    tags: ['recovery', 'deload'],
  },
  {
    id: 'brisk-walk', name: 'Brisk Walk', type: R, movement: M.GAIT, category: C.CONDITIONING,
    equipment: GEAR, difficulty: D.BEGINNER, slot: 'main', defaultRest: 0,
    muscles: { primary: [U.CALVES, U.GLUTES], secondary: [U.QUADS, U.HAMSTRINGS] },
    alternatives: ['recovery-jog', 'easy-run'],
    execution: ['Walk fast enough that breathing deepens but speech stays easy.'],
    commonMistakes: ['Strolling and counting it as training'],
    tags: ['low-impact', 'beginner'],
  },
  {
    id: 'tempo-run', name: 'Tempo Run', type: R, movement: M.GAIT, category: C.CONDITIONING,
    equipment: GEAR, difficulty: D.INTERMEDIATE, slot: 'main', defaultRest: 0, muscles: LEGS,
    alternatives: ['interval-run', 'progression-run'],
    execution: [
      'Warm up, then hold a comfortably hard pace — speech limited to short phrases.',
      'Sustain it for a continuous block, then cool down.',
    ],
    commonMistakes: ['Running it at race pace, which turns it into a hard interval session'],
    tags: ['threshold', 'quality'],
  },
  {
    id: 'interval-run', name: 'Interval Session', type: R, movement: M.GAIT, category: C.CONDITIONING,
    equipment: GEAR, difficulty: D.ADVANCED, slot: 'main', defaultRest: 120, muscles: LEGS,
    alternatives: ['tempo-run', 'hill-repeats', 'fartlek'],
    execution: [
      'Warm up thoroughly — intervals on cold legs are how hamstrings tear.',
      'Alternate hard efforts with easy jogging or standing recovery.',
      'Stop the session when pace drops off, rather than grinding out the last reps.',
    ],
    commonMistakes: ['Skipping the warm-up', 'Starting the first rep far too fast'],
    tags: ['quality', 'speed'],
  },
  {
    id: 'hill-repeats', name: 'Hill Repeats', type: R, movement: M.GAIT, category: C.CONDITIONING,
    equipmentAny: [E.OUTDOOR], difficulty: D.INTERMEDIATE, slot: 'main', defaultRest: 120, muscles: LEGS,
    alternatives: ['interval-run', 'tempo-run'],
    execution: ['Run hard up a moderate slope, walk or jog down as recovery.'],
    commonMistakes: ['Choosing a hill so steep that form collapses'],
    tags: ['strength-endurance', 'quality'],
  },
  {
    id: 'fartlek', name: 'Fartlek', type: R, movement: M.GAIT, category: C.CONDITIONING,
    equipment: GEAR, difficulty: D.INTERMEDIATE, slot: 'main', defaultRest: 0, muscles: LEGS,
    alternatives: ['interval-run', 'progression-run'],
    execution: ['Inside an easy run, pick landmarks and surge between them.', 'Unstructured by design — useful when a track is not available.'],
    commonMistakes: ['Surging so often it becomes one long hard run'],
    tags: ['quality', 'flexible'],
  },
  {
    id: 'progression-run', name: 'Progression Run', type: R, movement: M.GAIT, category: C.CONDITIONING,
    equipment: GEAR, difficulty: D.INTERMEDIATE, slot: 'main', defaultRest: 0, muscles: LEGS,
    alternatives: ['tempo-run', 'easy-run'],
    execution: ['Start easy and finish faster than you started, in a few steady stages.'],
    commonMistakes: ['Starting too fast, leaving nowhere to progress to'],
    tags: ['quality', 'pacing'],
  },
  {
    id: 'strides', name: 'Strides', type: R, movement: M.GAIT, category: C.CONDITIONING,
    equipment: GEAR, difficulty: D.BEGINNER, slot: 'finisher', defaultRest: 60, muscles: LEGS,
    alternatives: ['fartlek'],
    execution: ['Short accelerations to near-maximum speed, relaxed, with full recovery between.', 'Usually tacked onto the end of an easy run.'],
    commonMistakes: ['Straining rather than staying relaxed and quick'],
    tags: ['form', 'speed'],
  },
];
