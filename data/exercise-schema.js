/**
 * exercise-schema.js — the shape of one exercise record.
 *
 * Built with the same defineSchema / createModel used by the storage models,
 * so validation lives in one place for the whole project.
 *
 * Records are NOT validated on import: eighty records through a schema on
 * every page load costs time for nothing, since the records ship with the app
 * and cannot change at runtime. They are validated in the test suite instead,
 * and validateAll() is available while editing.
 */

import { defineSchema, rules } from '../validators/index.js';
import { createModel } from '../models/base-model.js';
import {
  EXERCISE_TYPE, MOVEMENT, CATEGORY, EQUIPMENT, DIFFICULTY, MUSCLE, valuesOf,
} from './taxonomy.js';

const slug = rules.string({ min: 2, max: 60 });

export const ExerciseSchema = defineSchema('Exercise', {
  /** Stable machine key. Never translated, never renamed. */
  id: { rule: slug, required: true, label: 'Id' },

  /** Canonical English name — the fallback when a locale has no label. */
  name: { rule: rules.string({ min: 2, max: 80 }), required: true, label: 'Name' },

  type: { rule: rules.oneOf(valuesOf(EXERCISE_TYPE)), required: true, label: 'Type' },
  movement: { rule: rules.oneOf(valuesOf(MOVEMENT)), required: true, label: 'Movement' },
  category: { rule: rules.oneOf(valuesOf(CATEGORY)), required: true, label: 'Category' },
  /**
   * Everything the exercise needs, all of it. A barbell bench press needs a
   * barbell AND a bench.
   */
  equipment: { rule: rules.list(rules.oneOf(valuesOf(EQUIPMENT)), { max: 6 }), default: () => [], label: 'Equipment' },

  /**
   * Interchangeable options: any ONE of these is enough. A goblet squat takes
   * a dumbbell OR a kettlebell. Keeping this separate from `equipment` is what
   * lets a query answer "what can I do with only a band?" correctly.
   */
  equipmentAny: { rule: rules.list(rules.oneOf(valuesOf(EQUIPMENT)), { max: 6 }), default: () => [], label: 'Equipment alternatives' },
  difficulty: { rule: rules.oneOf(valuesOf(DIFFICULTY)), required: true, label: 'Difficulty' },

  muscles: {
    rule: rules.object({
      primary: rules.list(rules.oneOf(valuesOf(MUSCLE)), { max: 6 }),
      secondary: rules.list(rules.oneOf(valuesOf(MUSCLE)), { max: 8 }),
    }),
    required: true,
    label: 'Muscles',
  },

  /** "3-1-1-0" — eccentric, pause, concentric, pause. Null where meaningless. */
  tempo: { rule: rules.string({ max: 12 }), label: 'Tempo' },

  /** Seconds. For timed work this is rest between rounds. */
  defaultRest: { rule: rules.number({ min: 0, max: 600, integer: true }), default: 90, label: 'Default rest' },

  /** Where a session would normally place this. */
  slot: { rule: rules.oneOf(['main', 'accessory', 'finisher', 'prep', 'cooldown']), default: 'accessory', label: 'Slot' },

  unilateral: { rule: rules.boolean(), default: false, label: 'Unilateral' },

  /** Ids of exercises that train the same pattern. Checked by the tests. */
  alternatives: { rule: rules.list(slug, { max: 8 }), default: () => [], label: 'Alternatives' },

  execution: { rule: rules.list(rules.string({ max: 300 }), { max: 10 }), default: () => [], label: 'Execution' },
  commonMistakes: { rule: rules.list(rules.string({ max: 300 }), { max: 10 }), default: () => [], label: 'Common mistakes' },
  cues: { rule: rules.list(rules.string({ max: 160 }), { max: 6 }), default: () => [], label: 'Cues' },

  /**
   * Media is referenced, never embedded, and never a third-party URL: the app
   * looks for assets/exercises/<id>.<ext> and shows nothing if it is absent.
   * `videoSearch` is a search term, not a link — see data/README notes.
   */
  media: {
    rule: rules.object({
      image: rules.string({ max: 200 }),
      gif: rules.string({ max: 200 }),
      video: rules.string({ max: 200 }),
      videoSearch: rules.string({ max: 120 }),
    }),
    default: () => ({}),
    label: 'Media',
  },

  tags: { rule: rules.list(slug, { max: 10 }), default: () => [], label: 'Tags' },
});

export const Exercise = createModel(ExerciseSchema, { idPrefix: 'ex', timestamps: false });

/**
 * Fill in what a record left out, without running validation.
 * Keeps every record in the files short: only what differs from the default.
 */
export function normaliseExercise(record) {
  return {
    tempo: null,
    defaultRest: 90,
    slot: 'accessory',
    unilateral: false,
    alternatives: [],
    equipment: [],
    equipmentAny: [],
    execution: [],
    commonMistakes: [],
    cues: [],
    tags: [],
    ...record,
    muscles: { primary: [], secondary: [], ...(record.muscles ?? {}) },
    media: {
      image: `assets/exercises/${record.id}.jpg`,
      gif: `assets/exercises/${record.id}.gif`,
      video: null,
      videoSearch: `${record.name} proper form technique`,
      ...(record.media ?? {}),
    },
  };
}
