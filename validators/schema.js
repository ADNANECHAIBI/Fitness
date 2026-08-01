/**
 * schema.js — turns a map of rules into a validator.
 *
 * A schema describes one model: which fields exist, which are required, what
 * each defaults to, and the rule every value must pass. Unknown keys are
 * dropped, so nothing a page sends can smuggle extra data into storage.
 */

import { ValidationError } from './errors.js';

/**
 * @typedef {object} FieldSpec
 * @property {import('./rules.js').Rule} rule
 * @property {boolean} [required]
 * @property {*} [default]
 * @property {string} [label]  human name used in error messages
 */

/**
 * @param {string} name                        model name, used in errors
 * @param {Record<string, FieldSpec>} fields
 * @returns {{ name, fields, defaults, validate, validatePartial }}
 */
export function defineSchema(name, fields) {
  /** The empty record: every field at its declared default. */
  function defaults() {
    const out = {};
    for (const [key, spec] of Object.entries(fields)) {
      out[key] = typeof spec.default === 'function' ? spec.default() : (spec.default ?? null);
    }
    return out;
  }

  /**
   * Validate a whole record.
   * @param {object} input
   * @param {{partial?: boolean}} [options] partial skips the required check
   *        and only validates the keys actually present — used by updates.
   * @returns {object} a clean copy, containing only declared fields
   * @throws {ValidationError}
   */
  function validate(input, { partial = false } = {}) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new ValidationError(name, { _: 'must be an object' });
    }

    const errors = {};
    const out = partial ? {} : defaults();

    for (const [key, spec] of Object.entries(fields)) {
      const present = input[key] !== undefined && input[key] !== null && input[key] !== '';

      if (!present) {
        if (partial) continue;
        // A declared default satisfies a required field — that is what the
        // default is for. Only a required field with nothing to fall back on
        // is an error.
        const fallback = out[key];
        if (fallback !== null && fallback !== undefined && fallback !== '') continue;
        if (spec.required) errors[spec.label ?? key] = 'is required';
        continue;
      }

      const result = spec.rule(input[key]);
      if (result.ok) out[key] = result.value;
      else errors[spec.label ?? key] = result.error;
    }

    if (Object.keys(errors).length) throw new ValidationError(name, errors);
    return out;
  }

  /** Validate only the keys present — for patches. @throws {ValidationError} */
  function validatePartial(input) {
    return validate(input, { partial: true });
  }

  return Object.freeze({ name, fields, defaults, validate, validatePartial });
}
