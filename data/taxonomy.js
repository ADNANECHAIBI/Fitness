/**
 * taxonomy.js — the vocabulary both databases are indexed by.
 *
 * These are the words an engine uses to ask a question. The Workout Engine
 * says "compound, horizontal push, barbell available" and the database
 * answers; it never needs to know that the answer is called a bench press.
 *
 * Every value is a stable machine key in snake_case. Display text lives in
 * data/i18n/ — adding a language never touches this file or any record.
 */

/** What kind of thing a record is. */
export const EXERCISE_TYPE = Object.freeze({
  STRENGTH: 'strength',
  RUNNING: 'running',
  MOBILITY: 'mobility',
  STRETCH: 'stretch',
  CORRECTIVE: 'corrective',
  WARMUP: 'warmup',
  COOLDOWN: 'cooldown',
  ACTIVATION: 'activation',
  RECOVERY: 'recovery',
});

/**
 * Movement patterns. A programme is built from patterns, not from exercise
 * names — this is the field the Workout Engine will filter on most.
 */
export const MOVEMENT = Object.freeze({
  HORIZONTAL_PUSH: 'horizontal_push',
  VERTICAL_PUSH: 'vertical_push',
  HORIZONTAL_PULL: 'horizontal_pull',
  VERTICAL_PULL: 'vertical_pull',
  SQUAT: 'squat',
  HINGE: 'hinge',
  LUNGE: 'lunge',
  CARRY: 'carry',
  ROTATION: 'rotation',
  ANTI_EXTENSION: 'anti_extension',
  ANTI_ROTATION: 'anti_rotation',
  ISOLATION: 'isolation',
  GAIT: 'gait',
  STATIC: 'static',
});

export const CATEGORY = Object.freeze({
  COMPOUND: 'compound',
  ISOLATION: 'isolation',
  ACCESSORY: 'accessory',
  CONDITIONING: 'conditioning',
  MOBILITY: 'mobility',
});

export const EQUIPMENT = Object.freeze({
  NONE: 'none',
  BARBELL: 'barbell',
  DUMBBELL: 'dumbbell',
  KETTLEBELL: 'kettlebell',
  MACHINE: 'machine',
  CABLE: 'cable',
  BAND: 'band',
  PULLUP_BAR: 'pullup_bar',
  BENCH: 'bench',
  DIP_BARS: 'dip_bars',
  FOAM_ROLLER: 'foam_roller',
  MAT: 'mat',
  OUTDOOR: 'outdoor',
  TREADMILL: 'treadmill',
});

export const DIFFICULTY = Object.freeze({
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
});

/** Muscles, matching the MUSCLES list the Gym model already validates against. */
export const MUSCLE = Object.freeze({
  CHEST: 'chest',
  UPPER_BACK: 'upper_back',
  LATS: 'lats',
  LOWER_BACK: 'lower_back',
  FRONT_DELTS: 'front_delts',
  SIDE_DELTS: 'side_delts',
  REAR_DELTS: 'rear_delts',
  BICEPS: 'biceps',
  TRICEPS: 'triceps',
  FOREARMS: 'forearms',
  QUADS: 'quads',
  HAMSTRINGS: 'hamstrings',
  GLUTES: 'glutes',
  ADDUCTORS: 'adductors',
  CALVES: 'calves',
  CORE: 'core',
  OBLIQUES: 'obliques',
  HIP_FLEXORS: 'hip_flexors',
  NECK: 'neck',
});

/* ── Food ───────────────────────────────────────────────────────────────── */

export const FOOD_GROUP = Object.freeze({
  PROTEIN: 'protein',
  GRAIN: 'grain',
  LEGUME: 'legume',
  VEGETABLE: 'vegetable',
  FRUIT: 'fruit',
  DAIRY: 'dairy',
  FAT: 'fat',
  SUPPLEMENT: 'supplement',
  DRINK: 'drink',
});

export const MEAL_TYPE = Object.freeze({
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  SNACK: 'snack',
  PRE_WORKOUT: 'pre_workout',
  POST_WORKOUT: 'post_workout',
});

/** How easy something is to find in an ordinary Moroccan shop or souk. */
export const AVAILABILITY = Object.freeze({
  EVERYWHERE: 'everywhere',
  COMMON: 'common',
  SEASONAL: 'seasonal',
  SPECIALTY: 'specialty',
});

/** Helper: every value of a frozen taxonomy object. */
export const valuesOf = (taxonomy) => Object.values(taxonomy);

export const ALL = Object.freeze({
  EXERCISE_TYPE, MOVEMENT, CATEGORY, EQUIPMENT, DIFFICULTY, MUSCLE,
  FOOD_GROUP, MEAL_TYPE, AVAILABILITY,
});
