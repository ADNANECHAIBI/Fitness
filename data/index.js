/**
 * data/index.js — the databases and their vocabulary.
 *
 * ── Where this sits ───────────────────────────────────────────────────────
 *   UI → Planner Engine → Workout Engine → ExerciseDB
 *                       → Nutrition Engine → FoodDB
 *
 * The engines above ask in the vocabulary of taxonomy.js. They never name an
 * exercise or a food, which is what makes both databases replaceable: change
 * a record, and the programme changes with no code edit.
 *
 * Nothing in here imports storage, events or UI.
 */

export { ExerciseDB } from './exercises/index.js';
export { FoodDB } from './foods/index.js';

export { Exercise, ExerciseSchema, normaliseExercise } from './exercise-schema.js';
export { Food, FoodSchema, food } from './food-schema.js';

export * as taxonomy from './taxonomy.js';
export {
  EXERCISE_TYPE, MOVEMENT, CATEGORY, EQUIPMENT, DIFFICULTY, MUSCLE,
  FOOD_GROUP, MEAL_TYPE, AVAILABILITY,
} from './taxonomy.js';

export { t, setLocale, getLocale, locales, registerLocale, labelFor } from './i18n/index.js';
