/**
 * errors.js — the error types the data layer throws.
 *
 * Only ValidationError escapes a repository. Everything else (storage full,
 * corrupt JSON) is caught inside the layer and turned into a safe fallback,
 * so a bad write can never take the app down.
 */

/** Thrown when data fails a schema check. Carries a field → message map. */
export class ValidationError extends Error {
  /**
   * @param {string} model
   * @param {Record<string,string>} fields
   */
  constructor(model, fields) {
    const summary = Object.entries(fields)
      .map(([name, message]) => `${name}: ${message}`)
      .join('; ');
    super(`${model} is invalid — ${summary}`);
    this.name = 'ValidationError';
    this.model = model;
    this.fields = fields;
  }

  /** True when a specific field failed. */
  has(field) { return field in this.fields; }
}

/** Thrown when a record is requested by an id that does not exist. */
export class NotFoundError extends Error {
  constructor(model, id) {
    super(`${model} "${id}" was not found`);
    this.name = 'NotFoundError';
    this.model = model;
    this.id = id;
  }
}

/** Thrown when an import file does not match the export format. */
export class ImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImportError';
  }
}
