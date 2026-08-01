/**
 * safe-json.js — parsing data that came from outside the app.
 *
 * Stored records and imported backup files are not trusted input: the first
 * can be edited by hand in developer tools, the second came from anywhere.
 * This lives on its own rather than inside the storage engine so the backup
 * service can use it without importing storage — only repositories may do that.
 */

/** Keys that can reach Object.prototype if they are ever spread or assigned. */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Remove prototype-polluting keys from parsed data, at any depth.
 *
 * JSON.parse does not itself set a prototype, but the own property it creates
 * survives a spread, and one assignment further down the line is all it takes.
 * Dropping the keys on the way in costs one pass and closes the whole class.
 */
export function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value === null || typeof value !== 'object') return value;

  const clean = {};
  for (const [key, entry] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    clean[key] = scrub(entry);
  }
  return clean;
}

/**
 * Parse JSON that came from outside, scrubbed.
 * @returns {*} the parsed value, or the fallback when it will not parse
 */
export function parseSafely(text, fallback = null) {
  try {
    return scrub(JSON.parse(text));
  } catch {
    return fallback;
  }
}
