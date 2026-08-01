/**
 * rules.js — field rules.
 *
 * A rule is a pure function: (value) => { ok, value, error }.
 * It never throws and never touches storage. Rules are composed into schemas
 * by validators/schema.js, which is the only consumer of this file.
 *
 * Bounds are deliberately generous but physical: they exist to stop nonsense
 * (weight -5, height 500 cm, age 2, a 35-hour session), not to police users.
 */

const ok = (value) => ({ ok: true, value, error: null });
const fail = (error) => ({ ok: false, value: null, error });

/** @typedef {(value: *) => {ok: boolean, value: *, error: string|null}} Rule */

/**
 * A number inside a closed range.
 * @param {object} [options] min, max, integer, unit
 * @returns {Rule}
 */
export function number({ min = -Infinity, max = Infinity, integer = false, unit = '' } = {}) {
  const suffix = unit ? ` ${unit}` : '';
  return (value) => {
    const n = typeof value === 'string' ? Number(value.trim()) : value;
    if (n === null || n === '' || Number.isNaN(n) || typeof n !== 'number' || !Number.isFinite(n)) {
      return fail('must be a number');
    }
    if (integer && !Number.isInteger(n)) return fail('must be a whole number');
    if (n < min) return fail(`must be at least ${min}${suffix}`);
    if (n > max) return fail(`must be at most ${max}${suffix}`);
    return ok(n);
  };
}

/**
 * Text with a length range. Trims before checking.
 * @returns {Rule}
 */
export function string({ min = 0, max = 500 } = {}) {
  return (value) => {
    if (typeof value !== 'string') return fail('must be text');
    const text = value.trim();
    if (text.length < min) return fail(`must be at least ${min} characters`);
    if (text.length > max) return fail(`must be at most ${max} characters`);
    return ok(text);
  };
}

/**
 * One of a fixed set of values.
 * @param {*[]} allowed
 * @returns {Rule}
 */
export function oneOf(allowed) {
  return (value) => allowed.includes(value)
    ? ok(value)
    : fail(`must be one of: ${allowed.join(', ')}`);
}

/** True or false. Accepts the strings "true"/"false". @returns {Rule} */
export function boolean() {
  return (value) => {
    if (typeof value === 'boolean') return ok(value);
    if (value === 'true') return ok(true);
    if (value === 'false') return ok(false);
    return fail('must be true or false');
  };
}

/**
 * An ISO date string (YYYY-MM-DD). Rejects impossible calendar dates and
 * anything outside the allowed window.
 * @param {object} [options] notBefore, notAfter — ISO strings
 * @returns {Rule}
 */
export function isoDate({ notBefore = '1900-01-01', notAfter = null } = {}) {
  return (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return fail('must be a date (YYYY-MM-DD)');
    }
    /* Parsed as UTC, because the round-trip below renders with toISOString(),
       which is UTC. Parsing as local midnight — `T00:00:00Z` with no Z — and
       comparing against a UTC rendering puts two calendar frames in one check:
       east of UTC, local midnight is the previous UTC day, so every real date
       failed the round trip. Found on a phone in UTC+1 after phase 23. */
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return fail('is not a real date');
    // Round-trip check catches 2026-02-31, which Date silently rolls over.
    if (date.toISOString().slice(0, 10) !== value) return fail('is not a real date');

    if (value < notBefore) return fail(`must be on or after ${notBefore}`);

    /* "Today" means the user's today, built from local calendar parts rather
       than from toISOString(), which would be UTC. In UTC+9 the two disagree
       for nine hours every day, and the app's own today() is already local —
       so a date the app supplied as a default was being rejected as future. */
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const ceiling = notAfter ?? localToday;
    if (value > ceiling) return fail(`must not be in the future`);
    return ok(value);
  };
}

/**
 * A list, with every item passing the same rule.
 * @param {Rule} itemRule
 * @returns {Rule}
 */
export function list(itemRule, { max = 500 } = {}) {
  return (value) => {
    if (!Array.isArray(value)) return fail('must be a list');
    if (value.length > max) return fail(`must hold at most ${max} items`);

    const out = [];
    for (const [i, item] of value.entries()) {
      const result = itemRule(item);
      if (!result.ok) return fail(`item ${i + 1} ${result.error}`);
      out.push(result.value);
    }
    return ok(out);
  };
}

/**
 * A nested object validated by a map of rules.
 * @param {Record<string, Rule>} shape
 * @returns {Rule}
 */
export function object(shape) {
  return (value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return fail('must be an object');
    }
    const out = {};
    for (const [key, rule] of Object.entries(shape)) {
      if (value[key] === undefined || value[key] === null) continue;
      const result = rule(value[key]);
      if (!result.ok) return fail(`${key} ${result.error}`);
      out[key] = result.value;
    }
    return ok(out);
  };
}

/** Duration in minutes. A single session cannot run for 35 hours. @returns {Rule} */
export function minutes({ min = 1, max = 600 } = {}) {
  return number({ min, max, integer: false, unit: 'min' });
}
