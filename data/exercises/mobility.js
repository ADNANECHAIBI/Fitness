/**
 * mobility.js — stretching and mobility work.
 *
 * `tempo` is meaningless here; `defaultRest` is the hold time in seconds for
 * static work, and the rest between rounds for dynamic drills.
 */

import { EXERCISE_TYPE as T, MOVEMENT as M, CATEGORY as C, EQUIPMENT as E, DIFFICULTY as D, MUSCLE as U } from '../taxonomy.js';

const mob = (record) => ({ type: T.MOBILITY, category: C.MOBILITY, difficulty: D.BEGINNER, slot: 'prep', defaultRest: 30, ...record });
const stretch = (record) => ({ type: T.STRETCH, category: C.MOBILITY, difficulty: D.BEGINNER, slot: 'cooldown', defaultRest: 30, ...record });

export const mobilityExercises = [
  mob({
    id: 'cat-cow', name: 'Cat-Cow', movement: M.STATIC, equipment: [E.MAT],
    muscles: { primary: [U.LOWER_BACK, U.CORE], secondary: [U.UPPER_BACK] },
    alternatives: ['thoracic-rotation', 'childs-pose'],
    execution: ['On all fours, alternate arching and rounding the spine with the breath.'],
    commonMistakes: ['Moving only at the lower back and leaving the upper back stiff'],
    tags: ['spine', 'warmup'],
  }),
  mob({
    id: 'thoracic-rotation', name: 'Open Book Thoracic Rotation', movement: M.ROTATION, equipment: [E.MAT],
    muscles: { primary: [U.UPPER_BACK], secondary: [U.OBLIQUES, U.CHEST] },
    alternatives: ['cat-cow', 'thread-the-needle'],
    execution: ['Lie on your side, knees bent, arms together.', 'Open the top arm across the body, following it with the eyes.'],
    commonMistakes: ['Rotating from the lower back instead of the ribcage'],
    tags: ['thoracic', 'rounded-shoulders'],
  }),
  mob({
    id: 'thread-the-needle', name: 'Thread the Needle', movement: M.ROTATION, equipment: [E.MAT],
    muscles: { primary: [U.UPPER_BACK], secondary: [U.REAR_DELTS] },
    alternatives: ['thoracic-rotation'],
    execution: ['From all fours, slide one arm under the body and rest the shoulder down.'],
    commonMistakes: ['Collapsing the hips to one side'],
    tags: ['thoracic'],
  }),
  mob({
    id: 'hip-90-90', name: '90/90 Hip Switch', movement: M.ROTATION, equipment: [E.MAT],
    muscles: { primary: [U.GLUTES, U.HIP_FLEXORS], secondary: [U.ADDUCTORS] },
    alternatives: ['worlds-greatest-stretch', 'hip-flexor-stretch'],
    execution: ['Sit with both knees at 90 degrees, then switch sides without using the hands.'],
    commonMistakes: ['Rounding the back to force range'],
    tags: ['hips'],
  }),
  mob({
    id: 'worlds-greatest-stretch', name: "World's Greatest Stretch", movement: M.LUNGE, equipment: [E.MAT],
    muscles: { primary: [U.HIP_FLEXORS, U.HAMSTRINGS], secondary: [U.UPPER_BACK, U.GLUTES] },
    alternatives: ['hip-90-90', 'hip-flexor-stretch'],
    execution: ['Deep lunge, drop the elbow inside the front foot, then rotate the same arm to the ceiling.'],
    commonMistakes: ['Rushing through instead of holding each position'],
    tags: ['full-body', 'warmup'],
  }),
  mob({
    id: 'ankle-rocks', name: 'Half-Kneeling Ankle Rock', movement: M.STATIC, equipment: [E.MAT],
    muscles: { primary: [U.CALVES], secondary: [] },
    alternatives: ['calf-stretch'],
    execution: ['Front foot flat, drive the knee forward over the toes without the heel lifting.'],
    commonMistakes: ['Letting the heel come up, which defeats the purpose'],
    tags: ['ankles', 'squat-prep'],
  }),
  mob({
    id: 'scapular-wall-slide', name: 'Wall Slide', movement: M.VERTICAL_PUSH, equipment: [E.NONE],
    muscles: { primary: [U.UPPER_BACK], secondary: [U.SIDE_DELTS] },
    alternatives: ['band-pull-apart', 'thoracic-rotation'],
    execution: ['Forearms on the wall, slide up and down while keeping contact and ribs down.'],
    commonMistakes: ['Arching the lower back to gain height'],
    tags: ['shoulders', 'rounded-shoulders', 'warmup'],
  }),

  stretch({
    id: 'childs-pose', name: "Child's Pose", movement: M.STATIC, equipment: [E.MAT],
    muscles: { primary: [U.LOWER_BACK, U.LATS], secondary: [] },
    alternatives: ['cat-cow'],
    execution: ['Sit back onto the heels with the arms extended, and breathe into the back.'],
    commonMistakes: ['Holding tension in the shoulders'],
    tags: ['cooldown'],
  }),
  stretch({
    id: 'hip-flexor-stretch', name: 'Half-Kneeling Hip Flexor Stretch', movement: M.STATIC, equipment: [E.MAT],
    muscles: { primary: [U.HIP_FLEXORS], secondary: [U.QUADS] },
    alternatives: ['worlds-greatest-stretch', 'hip-90-90'],
    execution: ['Squeeze the glute of the kneeling side, then shift forward slightly.'],
    commonMistakes: ['Arching the lower back instead of tucking the pelvis'],
    tags: ['hips', 'desk-work'],
  }),
  stretch({
    id: 'hamstring-stretch', name: 'Standing Hamstring Stretch', movement: M.STATIC, equipment: [E.NONE],
    muscles: { primary: [U.HAMSTRINGS], secondary: [U.CALVES] },
    alternatives: ['childs-pose'],
    execution: ['Hinge at the hip with a flat back until a stretch is felt behind the thigh.'],
    commonMistakes: ['Rounding the back to reach further'],
    tags: ['cooldown', 'running'],
  }),
  stretch({
    id: 'calf-stretch', name: 'Wall Calf Stretch', movement: M.STATIC, equipment: [E.NONE],
    muscles: { primary: [U.CALVES], secondary: [] },
    alternatives: ['ankle-rocks'],
    execution: ['Back leg straight, heel down, hips forward.'],
    commonMistakes: ['Letting the back heel lift'],
    tags: ['cooldown', 'running'],
  }),
  stretch({
    id: 'doorway-chest-stretch', name: 'Doorway Chest Stretch', movement: M.STATIC, equipment: [E.NONE],
    muscles: { primary: [U.CHEST, U.FRONT_DELTS], secondary: [] },
    alternatives: ['pec-foam-roll', 'thoracic-rotation'],
    execution: ['Forearm on the frame at shoulder height, rotate the torso away.'],
    commonMistakes: ['Pushing into pain rather than a mild stretch'],
    tags: ['rounded-shoulders', 'posture'],
  }),
  stretch({
    id: 'pec-foam-roll', name: 'Pec Release with Roller or Ball', movement: M.STATIC, equipment: [E.FOAM_ROLLER],
    muscles: { primary: [U.CHEST], secondary: [U.FRONT_DELTS] },
    alternatives: ['doorway-chest-stretch'],
    execution: ['Pin a ball between the chest and a wall and move slowly through tender spots.'],
    commonMistakes: ['Rolling directly over the shoulder joint'],
    tags: ['rounded-shoulders', 'soft-tissue'],
  }),
  stretch({
    id: 'thoracic-extension-roll', name: 'Thoracic Extension over Roller', movement: M.STATIC, equipment: [E.FOAM_ROLLER],
    muscles: { primary: [U.UPPER_BACK], secondary: [U.CHEST] },
    alternatives: ['thoracic-rotation', 'cat-cow'],
    execution: ['Roller across the upper back, support the head, extend gently over it.'],
    commonMistakes: ['Letting the ribs flare and extending from the lower back'],
    tags: ['rounded-shoulders', 'thoracic'],
  }),
];
