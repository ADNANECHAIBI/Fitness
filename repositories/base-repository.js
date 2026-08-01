/**
 * base-repository.js — the two repository shapes.
 *
 * A repository is the ONLY thing allowed to read or write storage. Pages and
 * services ask a repository; nothing calls localStorage directly. That single
 * rule is what makes the storage engine swappable later (IndexedDB, a server)
 * without touching a page.
 *
 * Two shapes cover every model:
 *   collection — many records under one key (runs, sets, measurements)
 *   document   — exactly one record under one key (profile, settings)
 *
 * Both save on every mutation (no Save button anywhere) and publish an event
 * so the rest of the app hears about the change.
 */

import { storage } from '../scripts/storage.js';
import { bus, EVENTS } from '../events/index.js';
import { ValidationError, NotFoundError } from '../validators/index.js';
import { createLogger } from '../scripts/logger.js';

const log = createLogger('repository');

/** Report a contained failure without crashing the caller. */
function report(scope, error) {
  log.error(`[repository] ${scope}`, error);
  bus.emit(EVENTS.ERROR, { source: scope, error });
}

/**
 * Many records under one key.
 *
 * @param {object} options
 * @param {string} options.key       storage key from config.KEYS
 * @param {object} options.model     a model built by createModel
 * @param {(a,b)=>number} [options.sort]  applied on read; defaults to newest first
 * @returns {object} the repository
 */
export function createCollectionRepository({ key, model, sort = null }) {
  const byDateDesc = (a, b) =>
    String(b.date ?? b.createdAt ?? '').localeCompare(String(a.date ?? a.createdAt ?? ''));
  const order = sort ?? byDateDesc;

  /** Every record. Returns [] if storage is empty or unreadable. */
  function all() {
    try {
      const rows = storage.get(key, []);
      return Array.isArray(rows) ? [...rows].sort(order) : [];
    } catch (error) {
      report(`${model.name}.all`, error);
      return [];
    }
  }

  /** Persist the whole list. @returns {boolean} */
  function write(rows) {
    const saved = storage.set(key, rows);
    if (!saved) report(`${model.name}.write`, new Error('storage rejected the write'));
    return saved;
  }

  return Object.freeze({
    model,
    key,
    all,

    /** @returns {object|null} */
    byId(id) {
      return all().find((row) => row.id === id) ?? null;
    },

    /** @param {(row: object) => boolean} predicate */
    find(predicate) {
      try {
        return all().filter(predicate);
      } catch (error) {
        report(`${model.name}.find`, error);
        return [];
      }
    },

    /** Records on one ISO date. */
    byDate(date) {
      return all().filter((row) => row.date === date);
    },

    /** Records inside an inclusive ISO date range. */
    between(fromDate, toDate) {
      return all().filter((row) => row.date >= fromDate && row.date <= toDate);
    },

    /**
     * Validate, save and announce. Saves immediately — there is no Save button.
     * @throws {ValidationError} the only error a caller has to handle
     * @returns {object} the stored record
     */
    create(input) {
      const record = model.create(input);            // throws ValidationError
      const rows = storage.get(key, []);
      write([...(Array.isArray(rows) ? rows : []), record]);
      bus.emit(EVENTS.RECORD_CREATED, { model: model.name, key, record });
      return record;
    },

    /**
     * Merge a patch into one record.
     * @throws {ValidationError|NotFoundError}
     */
    update(id, patch) {
      const rows = storage.get(key, []);
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) throw new NotFoundError(model.name, id);

      const record = model.update(rows[index], patch);   // throws ValidationError
      rows[index] = record;
      write(rows);
      bus.emit(EVENTS.RECORD_UPDATED, { model: model.name, key, record });
      return record;
    },

    /** @returns {boolean} true when a record was actually removed */
    remove(id) {
      const rows = storage.get(key, []);
      const next = rows.filter((row) => row.id !== id);
      if (next.length === rows.length) return false;

      write(next);
      bus.emit(EVENTS.RECORD_DELETED, { model: model.name, key, id });
      return true;
    },

    /** Replace the whole collection. Used by import, not by pages. */
    replaceAll(rows) {
      const clean = [];
      for (const row of Array.isArray(rows) ? rows : []) {
        try {
          clean.push(model.create(row));
        } catch (error) {
          // Skip the bad row, keep the good ones: a partial import beats none.
          report(`${model.name}.replaceAll skipped a record`, error);
        }
      }
      write(clean);
      return clean.length;
    },

    count() { return all().length; },

    clear() {
      storage.remove(key);
      bus.emit(EVENTS.RECORD_DELETED, { model: model.name, key, id: '*' });
    },
  });
}

/**
 * Exactly one record under one key.
 *
 * @param {object} options
 * @param {string} options.key
 * @param {object} options.model
 * @param {string} [options.event]  extra topic emitted after every save
 * @returns {object} the repository
 */
export function createDocumentRepository({ key, model, event = null }) {
  /** The stored record, or the model's defaults when nothing is saved yet. */
  function get() {
    try {
      const row = storage.get(key, null);
      return row && typeof row === 'object' ? { ...model.defaults(), ...row } : null;
    } catch (error) {
      report(`${model.name}.get`, error);
      return null;
    }
  }

  function announce(record) {
    bus.emit(EVENTS.DOCUMENT_SAVED, { model: model.name, key, record });
    if (event) bus.emit(event, record);
  }

  return Object.freeze({
    model,
    key,
    get,

    /** True when the document has ever been saved. */
    exists() { return storage.has(key); },

    /** The defaults, for rendering an empty form. */
    defaults() { return model.defaults(); },

    /**
     * Replace the document. Saves immediately.
     * @throws {ValidationError}
     */
    save(input) {
      const existing = get();
      const record = existing
        ? model.update(existing, input)
        : model.create(input);

      storage.set(key, record);
      announce(record);
      return record;
    },

    /**
     * Merge a few fields into the document, creating it if needed.
     * @throws {ValidationError}
     */
    patch(partial) {
      const existing = get();
      if (!existing) return this.save(partial);

      const record = model.update(existing, partial);
      storage.set(key, record);
      announce(record);
      return record;
    },

    clear() {
      storage.remove(key);
      bus.emit(EVENTS.DOCUMENT_SAVED, { model: model.name, key, record: null });
    },
  });
}

export { ValidationError, NotFoundError };
