/**
 * i18n — labels, kept apart from data.
 *
 * Records carry stable English ids and a canonical English `name`. Everything
 * a person reads comes through here, so a new language is one file plus one
 * line in LOCALES. Nothing about a query, an engine or a record changes.
 *
 * Missing keys fall back: requested locale → English → the key itself.
 */

import { en } from './en.js';
import { ar } from './ar.js';

const LOCALES = new Map([
  ['en', en],
  ['ar', ar],
]);

/**
 * Writing direction per language. Only the exceptions are listed; everything
 * else is left-to-right, so adding a European language needs no entry here.
 */
const RTL = new Set(['ar', 'he', 'fa', 'ur']);

const FALLBACK = 'en';
let current = FALLBACK;

/**
 * Register a language at runtime.
 * @param {string} code
 * @param {object} labels
 * @param {{dir?: 'ltr'|'rtl'}} [options]
 */
export function registerLocale(code, labels, { dir = 'ltr' } = {}) {
  LOCALES.set(code, labels);
  if (dir === 'rtl') RTL.add(code);
  else RTL.delete(code);
}

/** 'rtl' or 'ltr' for a language. Unknown languages read left to right. */
export function direction(code = current) {
  return RTL.has(code) ? 'rtl' : 'ltr';
}

/**
 * Does this language define this key itself?
 *
 * `t()` deliberately falls back to English, which is what lets a language be
 * filled in gradually. That also hides the difference between "translated"
 * and "not translated yet", and the language manager needs to tell them
 * apart so it can report one and warn about the other.
 *
 * @param {string} key
 * @param {string} [locale]
 * @returns {boolean}
 */
export function has(key, locale = current) {
  return LOCALES.get(locale)?.[key] !== undefined;
}

/** Every key a language defines. Used by the tests to compare coverage. */
export function keysOf(locale) {
  return Object.keys(LOCALES.get(locale) ?? {});
}

/** Which languages exist. */
export function locales() { return [...LOCALES.keys()]; }

/** Set the active language. Unknown codes are ignored. */
export function setLocale(code) {
  if (LOCALES.has(code)) current = code;
  return current;
}

export function getLocale() { return current; }

/**
 * Translate a key.
 * @param {string} key      e.g. 'muscle.chest' or 'food.egg'
 * @param {object} [options]
 * @param {string} [options.locale]    override the active language
 * @param {string} [options.fallback]  text to use when nothing matches
 * @returns {string}
 */
export function t(key, { locale = current, fallback = null } = {}) {
  return LOCALES.get(locale)?.[key]
    ?? LOCALES.get(FALLBACK)?.[key]
    ?? fallback
    ?? key;
}

/**
 * The display name of a record. Falls back to the record's own English name,
 * which is why an untranslated language still shows something readable.
 *
 * @param {object} record   an exercise or a food
 * @param {string} [prefix] 'exercise' or 'food'
 */
export function labelFor(record, prefix, options = {}) {
  if (!record) return '';
  return t(`${prefix}.${record.id}`, { ...options, fallback: record.name });
}

export { en, ar };
