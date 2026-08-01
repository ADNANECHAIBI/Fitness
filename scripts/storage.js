/**
 * storage.js — LocalStorage Manager.
 *
 * A thin, safe wrapper around window.localStorage:
 *   • namespaces every key with a prefix, so the app never collides with
 *     anything else on the origin;
 *   • serialises to JSON and survives corrupt or missing values;
 *   • degrades to an in-memory Map when storage is unavailable
 *     (iOS Private Browsing, quota exceeded, storage disabled);
 *   • notifies listeners on write, ready for future UI binding.
 *
 * Nothing calls the write methods in Phase 1. This is the foundation.
 */

import { STORAGE_PREFIX, KEYS } from './config.js';
import { scrub } from './safe-json.js';
import { createLogger } from './logger.js';

const log = createLogger('storage');

/** @returns {boolean} true when localStorage is readable and writable. */
function isAvailable() {
  try {
    const probe = '__probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

class StorageManager {
  #prefix;
  #driver;          // localStorage, or a Map used as a fallback
  #usingFallback;
  #listeners = new Set();

  constructor(prefix = STORAGE_PREFIX) {
    this.#prefix = prefix;
    this.#usingFallback = !isAvailable();
    this.#driver = this.#usingFallback ? new Map() : window.localStorage;
  }

  /** True when data lives only in memory and will not survive a reload. */
  get isPersistent() { return !this.#usingFallback; }

  /** Namespaced key: "foundation:weights" */
  #k(key) { return `${this.#prefix}:${key}`; }

  #rawGet(key) {
    return this.#usingFallback
      ? (this.#driver.get(this.#k(key)) ?? null)
      : this.#driver.getItem(this.#k(key));
  }

  #rawSet(key, value) {
    if (this.#usingFallback) this.#driver.set(this.#k(key), value);
    else this.#driver.setItem(this.#k(key), value);
  }

  #rawRemove(key) {
    if (this.#usingFallback) this.#driver.delete(this.#k(key));
    else this.#driver.removeItem(this.#k(key));
  }

  /**
   * Read a value.
   *
   * Parsed output is scrubbed of prototype-polluting keys. Stored data is not
   * a trusted input: it can be edited by hand in developer tools, and it comes
   * back through an imported backup file that came from anywhere.
   *
   * @param {string} key      one of KEYS
   * @param {*} fallback      returned when missing or unparsable
   */
  get(key, fallback = null) {
    const raw = this.#rawGet(key);
    if (raw === null) return fallback;
    try {
      return scrub(JSON.parse(raw));
    } catch {
      // Corrupt entry: drop it rather than let it break the app on every load.
      this.#rawRemove(key);
      return fallback;
    }
  }

  /**
   * Write a value.
   * @returns {boolean} false when the write failed (quota, private mode).
   */
  set(key, value) {
    try {
      this.#rawSet(key, JSON.stringify(value));
      this.#emit(key, value);
      return true;
    } catch (error) {
      log.warn(`[storage] could not save "${key}"`, error);
      return false;
    }
  }

  /** Append one item to an array-shaped key. Creates the array if missing. */
  push(key, item) {
    const list = this.get(key, []);
    if (!Array.isArray(list)) return false;
    list.push(item);
    return this.set(key, list);
  }

  /** Shallow-merge an object into an object-shaped key. */
  merge(key, patch) {
    const current = this.get(key, {});
    return this.set(key, { ...current, ...patch });
  }

  /** Remove a single key. */
  remove(key) {
    this.#rawRemove(key);
    this.#emit(key, null);
  }

  /** True when the key exists. */
  has(key) { return this.#rawGet(key) !== null; }

  /** Remove every key owned by this app. Other origins' data is untouched. */
  clear() {
    if (this.#usingFallback) {
      this.#driver.clear();
    } else {
      Object.keys(this.#driver)
        .filter((k) => k.startsWith(`${this.#prefix}:`))
        .forEach((k) => this.#driver.removeItem(k));
    }
    this.#emit('*', null);
  }

  /** Everything this app owns, as one object — the base for a future export. */
  exportAll() {
    return Object.fromEntries(
      Object.values(KEYS).map((key) => [key, this.get(key)])
    );
  }

  /**
   * Subscribe to writes.
   * @param {(key: string, value: *) => void} handler
   * @returns {() => void} unsubscribe
   */
  subscribe(handler) {
    this.#listeners.add(handler);
    return () => this.#listeners.delete(handler);
  }

  #emit(key, value) {
    this.#listeners.forEach((handler) => {
      try { handler(key, value); }
      catch (error) { log.warn('[storage] listener failed', error); }
    });
  }
}

/** Shared instance. Import this, not the class. */
export const storage = new StorageManager();
export { StorageManager, KEYS };
