/**
 * corrective.js — corrective work, with rounded shoulders covered in depth.
 *
 * A note on the term: "corrective" here means strengthening what is weak and
 * lengthening what is short. Posture is not a defect to be fixed, and no
 * exercise straightens a spine. What this work reliably does is build the
 * capacity to hold a comfortable position for longer.
 */

import { EXERCISE_TYPE as T, MOVEMENT as M, CATEGORY as C, EQUIPMENT as E, DIFFICULTY as D, MUSCLE as U } from '../taxonomy.js';

const corrective = (record) => ({
  type: T.CORRECTIVE, category: C.ACCESSORY, difficulty: D.BEGINNER,
  slot: 'prep', defaultRest: 45, ...record,
});

export const correctiveExercises = [
  corrective({
    id: 'band-pull-apart', name: 'Band Pull-Apart', movement: M.HORIZONTAL_PULL, equipment: [E.BAND],
    muscles: { primary: [U.REAR_DELTS, U.UPPER_BACK], secondary: [] },
    alternatives: ['face-pull', 'reverse-fly', 'prone-y-raise'],
    execution: ['Arms straight at chest height.', 'Pull the band apart until it touches the chest, keeping the ribs down.'],
    commonMistakes: ['Shrugging', 'Letting the ribs flare forward'],
    tags: ['rounded-shoulders', 'posture', 'high-frequency'],
  }),
  corrective({
    id: 'prone-y-raise', name: 'Prone Y Raise', movement: M.VERTICAL_PUSH, equipmentAny: [E.MAT, E.BENCH],
    muscles: { primary: [U.UPPER_BACK, U.REAR_DELTS], secondary: [U.SIDE_DELTS] },
    alternatives: ['prone-t-raise', 'band-pull-apart', 'face-pull'],
    execution: ['Face down, arms overhead in a Y, thumbs up.', 'Lift the arms a few centimetres and hold briefly.'],
    commonMistakes: ['Using heavy weight, which recruits the traps instead of the lower traps'],
    tags: ['rounded-shoulders', 'lower-traps'],
  }),
  corrective({
    id: 'prone-t-raise', name: 'Prone T Raise', movement: M.HORIZONTAL_PULL, equipmentAny: [E.MAT, E.BENCH],
    muscles: { primary: [U.REAR_DELTS, U.UPPER_BACK], secondary: [] },
    alternatives: ['prone-y-raise', 'reverse-fly'],
    execution: ['Face down, arms out to the sides, thumbs up.', 'Lift, squeeze the shoulder blades together, lower slowly.'],
    commonMistakes: ['Lifting the head and chest instead of just the arms'],
    tags: ['rounded-shoulders', 'posture'],
  }),
  corrective({
    id: 'external-rotation', name: 'Side-Lying External Rotation', movement: M.ROTATION, equipmentAny: [E.DUMBBELL, E.BAND],
    unilateral: true,
    muscles: { primary: [U.REAR_DELTS], secondary: [U.UPPER_BACK] },
    alternatives: ['face-pull', 'band-pull-apart'],
    execution: ['Elbow pinned to the ribs at 90 degrees.', 'Rotate the forearm up, then lower under control.'],
    commonMistakes: ['Letting the elbow drift away from the body', 'Going far too heavy'],
    tags: ['rotator-cuff', 'prehab'],
  }),
  corrective({
    id: 'chin-tuck', name: 'Chin Tuck', movement: M.STATIC, equipment: [E.NONE],
    muscles: { primary: [U.NECK], secondary: [U.UPPER_BACK] },
    alternatives: ['scapular-wall-slide'],
    execution: ['Draw the chin straight back, making a double chin, without tilting the head down.', 'Hold briefly, release.'],
    commonMistakes: ['Nodding instead of translating the head backwards'],
    tags: ['forward-head', 'desk-work', 'rounded-shoulders'],
  }),
  corrective({
    id: 'wall-angel', name: 'Wall Angel', movement: M.VERTICAL_PUSH, equipment: [E.NONE],
    muscles: { primary: [U.UPPER_BACK], secondary: [U.REAR_DELTS] },
    alternatives: ['scapular-wall-slide', 'prone-y-raise'],
    execution: ['Back against the wall, lower back flat.', 'Slide the arms up and down while keeping wrists and elbows in contact.'],
    commonMistakes: ['Arching the lower back off the wall to gain range'],
    tags: ['rounded-shoulders', 'thoracic'],
  }),
  corrective({
    id: 'scapular-pull-up', name: 'Scapular Pull-Up', movement: M.VERTICAL_PULL, equipment: [E.PULLUP_BAR],
    muscles: { primary: [U.UPPER_BACK, U.LATS], secondary: [] },
    alternatives: ['band-pull-apart', 'prone-y-raise'],
    execution: ['Hang from the bar with straight arms.', 'Pull the shoulder blades down without bending the elbows.'],
    commonMistakes: ['Turning it into a small pull-up'],
    tags: ['shoulders', 'prehab'],
  }),
  corrective({
    id: 'glute-bridge', name: 'Glute Bridge', movement: M.HINGE, equipment: [E.MAT],
    muscles: { primary: [U.GLUTES], secondary: [U.HAMSTRINGS, U.CORE] },
    alternatives: ['hip-thrust', 'hip-flexor-stretch'],
    execution: ['Heels close to the hips, ribs down.', 'Drive the hips up by squeezing the glutes, not by arching the back.'],
    commonMistakes: ['Extending through the lower back instead of the hips'],
    tags: ['glute-activation', 'anterior-pelvic-tilt'],
  }),
  corrective({
    id: 'clamshell', name: 'Clamshell', movement: M.ROTATION, equipment: [E.BAND, E.MAT],
    unilateral: true,
    muscles: { primary: [U.GLUTES], secondary: [] },
    alternatives: ['glute-bridge', 'monster-walk'],
    execution: ['Side-lying, knees bent, heels together.', 'Open the top knee without rolling the hips backwards.'],
    commonMistakes: ['Rotating the whole pelvis to get more range'],
    tags: ['glute-activation', 'knee-health'],
  }),
  corrective({
    id: 'monster-walk', name: 'Banded Monster Walk', movement: M.LUNGE, equipment: [E.BAND],
    muscles: { primary: [U.GLUTES], secondary: [U.QUADS] },
    alternatives: ['clamshell', 'glute-bridge'],
    execution: ['Band above the knees, quarter squat, step sideways keeping tension.'],
    commonMistakes: ['Letting the knees collapse inward between steps'],
    tags: ['glute-activation', 'knee-health'],
  }),
];
