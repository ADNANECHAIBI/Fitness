/**
 * logger.js — the only thing in the app allowed to write to the console.
 *
 * Four levels, a threshold that can be raised to silence everything, and a
 * small ring buffer so a problem that happened a minute ago is still visible
 * when someone goes looking.
 *
 * Why not call console directly: a library that logs unconditionally is a
 * library you cannot ship. This makes the noise controllable from one place,
 * and gives every message a source so it is obvious which layer produced it.
 */

export const LEVEL = Object.freeze({
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  SILENT: 100,
});

const NAMES = { 10: 'DEBUG', 20: 'INFO', 30: 'WARN', 40: 'ERROR' };

/** Console method per level. */
const WRITERS = {
  10: (...args) => console.debug(...args),
  20: (...args) => console.info(...args),
  30: (...args) => console.warn(...args),
  40: (...args) => console.error(...args),
};

const HISTORY_LIMIT = 100;

/**
 * Production ships at INFO. A consumer can raise it to SILENT, or drop it to
 * DEBUG while chasing something.
 */
let threshold = LEVEL.INFO;
let enabled = true;
const history = [];

function write(level, source, message, detail) {
  const entry = { level, name: NAMES[level], source, message, detail, at: Date.now() };

  history.push(entry);
  if (history.length > HISTORY_LIMIT) history.shift();

  if (!enabled || level < threshold) return entry;

  const prefix = `[${source}]`;
  if (detail === undefined) WRITERS[level](prefix, message);
  else WRITERS[level](prefix, message, detail);

  return entry;
}

/**
 * A logger bound to one source.
 * @param {string} source  the module or layer, e.g. 'repository' or 'router'
 */
export function createLogger(source) {
  return Object.freeze({
    debug: (message, detail) => write(LEVEL.DEBUG, source, message, detail),
    info: (message, detail) => write(LEVEL.INFO, source, message, detail),
    warn: (message, detail) => write(LEVEL.WARN, source, message, detail),
    error: (message, detail) => write(LEVEL.ERROR, source, message, detail),
  });
}

export const Logger = Object.freeze({
  /** Raise or lower the threshold. Pass LEVEL.SILENT to turn logging off. */
  setLevel(level) { threshold = level; return threshold; },
  getLevel() { return threshold; },

  /** Switch output off entirely while still recording history. */
  disable() { enabled = false; },
  enable() { enabled = true; },
  get enabled() { return enabled; },

  /** Recent entries, newest last. Useful in a diagnostics view or a bug report. */
  history() { return [...history]; },
  clear() { history.length = 0; },

  LEVEL,
  create: createLogger,
});

export default Logger;
