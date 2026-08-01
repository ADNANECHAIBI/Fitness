/**
 * base-model.js — the model factory.
 *
 * Every model is the same machine with a different schema, so it is built
 * once here rather than copied eleven times (Factory Pattern). A model knows
 * how to create, update and describe its records — and nothing else. It never
 * reads storage, never emits events, never touches the DOM.
 *
 * @example
 * export const Profile = createModel('Profile', { age: { rule: number({min:10,max:100}) } });
 * const record = Profile.create({ age: 28 });
 */

import { ValidationError } from '../validators/errors.js';

/** Short, sortable, collision-resistant id: time in base36 + randomness. */
export function makeId(prefix = 'r') {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${time}${random}`;
}

/** Today as YYYY-MM-DD in the device's own timezone (not UTC). */
export function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Build a model from a schema.
 *
 * @param {import('../validators/schema.js').defineSchema} schema
 * @param {object} [options]
 * @param {string} [options.idPrefix]  prefix for generated ids
 * @param {boolean}[options.timestamps] add createdAt / updatedAt
 * @returns {{
 *   name: string, schema: object, defaults: Function,
 *   create: Function, update: Function, isValid: Function, describe: Function
 * }}
 */
export function createModel(schema, { idPrefix = 'r', timestamps = true } = {}) {
  /**
   * Validate input and stamp it into a complete record.
   * @throws {ValidationError}
   */
  function create(input = {}) {
    const record = schema.validate(input);
    const now = new Date().toISOString();

    return {
      id: input.id ?? makeId(idPrefix),
      ...record,
      ...(timestamps ? { createdAt: input.createdAt ?? now, updatedAt: now } : {}),
    };
  }

  /**
   * Merge a patch into an existing record, validating only what changed.
   * @throws {ValidationError}
   */
  function update(existing, patch = {}) {
    const clean = schema.validatePartial(patch);
    return {
      ...existing,
      ...clean,
      id: existing.id,
      ...(timestamps
        ? { createdAt: existing.createdAt, updatedAt: new Date().toISOString() }
        : {}),
    };
  }

  /** Check without throwing. @returns {{valid: boolean, errors: object}} */
  function isValid(input, { partial = false } = {}) {
    try {
      schema.validate(input, { partial });
      return { valid: true, errors: {} };
    } catch (error) {
      if (error instanceof ValidationError) return { valid: false, errors: error.fields };
      throw error;
    }
  }

  /** Field metadata, for building forms without duplicating the schema. */
  function describe() {
    return Object.entries(schema.fields).map(([key, spec]) => ({
      key,
      label: spec.label ?? key,
      required: Boolean(spec.required),
      unit: spec.unit ?? '',
      options: spec.options ?? null,
    }));
  }

  return Object.freeze({
    name: schema.name,
    schema,
    defaults: schema.defaults,
    create,
    update,
    isValid,
    describe,
  });
}
