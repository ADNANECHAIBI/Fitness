/**
 * ExerciseDB — the query surface over the exercise records.
 *
 * This is the contract the Workout Engine will use. It asks in the vocabulary
 * of taxonomy.js — "a compound horizontal push I can do with a barbell" — and
 * never mentions an exercise by name. Swapping the record files, or loading
 * them from a server later, changes nothing above this line.
 *
 * Everything here is pure and synchronous. No storage, no events, no DOM.
 */

import { normaliseExercise, Exercise } from '../exercise-schema.js';
import { strengthExercises } from './strength.js';
import { runningExercises } from './running.js';
import { mobilityExercises } from './mobility.js';
import { correctiveExercises } from './corrective.js';
import { protocolExercises } from './protocols.js';

/** Every record, defaults filled in. Built once at import. */
const RECORDS = [
  ...strengthExercises,
  ...runningExercises,
  ...mobilityExercises,
  ...correctiveExercises,
  ...protocolExercises,
].map(normaliseExercise);

/** id → record, for O(1) lookup. */
const BY_ID = new Map(RECORDS.map((record) => [record.id, record]));

/** Match a value against a filter that may be a single value or a list. */
function matches(value, filter) {
  if (filter === undefined || filter === null) return true;
  const wanted = Array.isArray(filter) ? filter : [filter];
  return wanted.includes(value);
}

/** True when the record has at least one of the wanted items. */
function overlaps(values, filter) {
  if (filter === undefined || filter === null) return true;
  const wanted = Array.isArray(filter) ? filter : [filter];
  return wanted.some((item) => values.includes(item));
}

/** Difficulty order, for "at most this hard" filtering. */
const DIFFICULTY_ORDER = ['beginner', 'intermediate', 'advanced'];

export const ExerciseDB = Object.freeze({
  /** Every record. Frozen at import — callers must not mutate it. */
  all() { return RECORDS; },

  /** @returns {object|null} */
  byId(id) { return BY_ID.get(id) ?? null; },

  /** @returns {boolean} */
  has(id) { return BY_ID.has(id); },

  count() { return RECORDS.length; },

  /**
   * The main query. Every field is optional; omitting one means "any".
   *
   * @param {object} [criteria]
   * @param {string|string[]} [criteria.type]
   * @param {string|string[]} [criteria.movement]
   * @param {string|string[]} [criteria.category]
   * @param {string|string[]} [criteria.slot]
   * @param {string|string[]} [criteria.muscles]        matches primary or secondary
   * @param {string|string[]} [criteria.primaryMuscles] matches primary only
   * @param {string|string[]} [criteria.tags]
   * @param {string[]} [criteria.equipment]   what is AVAILABLE, not required:
   *                                          a record matches when everything
   *                                          it needs is in this list
   * @param {string} [criteria.maxDifficulty]
   * @param {string} [criteria.difficulty]    exact match
   * @param {boolean} [criteria.unilateral]
   * @param {string[]} [criteria.exclude]     ids to leave out
   * @returns {object[]}
   *
   * @example
   * ExerciseDB.query({ movement: 'horizontal_push', category: 'compound',
   *                    equipment: ['barbell', 'bench'] });
   */
  query(criteria = {}) {
    const {
      type, movement, category, slot, muscles, primaryMuscles, tags,
      equipment, maxDifficulty, difficulty, unilateral, exclude = [],
    } = criteria;

    const ceiling = maxDifficulty ? DIFFICULTY_ORDER.indexOf(maxDifficulty) : null;

    return RECORDS.filter((record) => {
      if (exclude.includes(record.id)) return false;
      if (!matches(record.type, type)) return false;
      if (!matches(record.movement, movement)) return false;
      if (!matches(record.category, category)) return false;
      if (!matches(record.slot, slot)) return false;
      if (!matches(record.difficulty, difficulty)) return false;
      if (unilateral !== undefined && record.unilateral !== unilateral) return false;

      if (ceiling !== null && DIFFICULTY_ORDER.indexOf(record.difficulty) > ceiling) return false;

      if (!overlaps([...record.muscles.primary, ...record.muscles.secondary], muscles)) return false;
      if (!overlaps(record.muscles.primary, primaryMuscles)) return false;
      if (!overlaps(record.tags, tags)) return false;

      // Equipment is a capability check: can this be done with what is on hand?
      // Everything in `equipment` is required; one item from `equipmentAny` is
      // enough. 'none' is always satisfied.
      if (Array.isArray(equipment) && !canPerform(record, equipment)) return false;

      return true;
    });
  },

  /** The first match, or null. Convenience over query()[0]. */
  find(criteria = {}) {
    return this.query(criteria)[0] ?? null;
  },

  /**
   * Alternatives for an exercise, optionally filtered by available equipment.
   * Falls back to the same movement pattern when the record lists none.
   *
   * @returns {object[]}
   */
  /**
   * Can this record be performed with the equipment on hand?
   * @param {object} record
   * @param {string[]} available
   */
  canPerform(record, available) {
    return canPerform(record, available);
  },

  alternativesFor(id, { equipment = null } = {}) {
    const record = this.byId(id);
    if (!record) return [];

    const listed = record.alternatives
      .map((altId) => this.byId(altId))
      .filter(Boolean);

    const pool = listed.length ? listed : this.query({
      movement: record.movement,
      category: record.category,
      exclude: [id],
    });

    if (!Array.isArray(equipment)) return pool.filter((alt) => alt.id !== id);

    return pool.filter((alt) => alt.id !== id && canPerform(alt, equipment));
  },

  /**
   * A deterministic pick from the matches — same seed, same answer.
   * Deterministic on purpose: a plan that reshuffles itself on every render is
   * not a plan.
   *
   * @param {object} criteria
   * @param {{seed?: number|string, count?: number}} [options]
   * @returns {object[]}
   */
  pick(criteria = {}, { seed = 0, count = 1 } = {}) {
    const pool = this.query(criteria);
    if (!pool.length || count < 1) return [];

    const offset = hash(String(seed));
    return Array.from({ length: Math.min(count, pool.length) },
      (_, i) => pool[(offset + i) % pool.length]);
  },

  /** Which values actually appear in the data, for building a filter UI. */
  facets() {
    const collect = (get) => [...new Set(RECORDS.flatMap(get))].sort();
    return {
      type: collect((r) => [r.type]),
      movement: collect((r) => [r.movement]),
      category: collect((r) => [r.category]),
      equipment: collect((r) => [...r.equipment, ...r.equipmentAny]),
      difficulty: collect((r) => [r.difficulty]),
      slot: collect((r) => [r.slot]),
      muscles: collect((r) => [...r.muscles.primary, ...r.muscles.secondary]),
      tags: collect((r) => r.tags),
    };
  },

  /**
   * Validate every record against the schema.
   * Not run at import — see the note in exercise-schema.js. The test suite
   * calls this, and so should you after editing a record file.
   *
   * @returns {{valid: boolean, errors: {id: string, fields: object}[]}}
   */
  validateAll() {
    const errors = [];
    for (const record of RECORDS) {
      const result = Exercise.isValid(record);
      if (!result.valid) errors.push({ id: record.id, fields: result.errors });
    }
    return { valid: errors.length === 0, errors };
  },

  /** Ids referenced as alternatives that do not exist. Should always be empty. */
  brokenLinks() {
    return RECORDS.flatMap((record) =>
      record.alternatives
        .filter((altId) => !BY_ID.has(altId))
        .map((altId) => ({ from: record.id, to: altId }))
    );
  },
});

/**
 * Everything in `equipment` must be available; at least one item from
 * `equipmentAny` must be. 'none' means bodyweight and is always satisfied.
 */
function canPerform(record, available) {
  const has = (item) => item === 'none' || available.includes(item);

  if (!record.equipment.every(has)) return false;
  if (record.equipmentAny.length && !record.equipmentAny.some(has)) return false;
  return true;
}

/** Small stable string hash, so `pick` is reproducible across sessions. */
function hash(text) {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) {
    value = (value * 31 + text.charCodeAt(i)) >>> 0;
  }
  return value;
}
