/**
 * report-explain.js — how a report explains its own numbers.
 *
 * Phase 16 requires that every figure in a report can answer "why that
 * number?". Rather than writing sentences next to the arithmetic and hoping
 * they stay in step, each figure is *recorded* as it is produced: the value,
 * the inputs it came from, the method in words, and which engine owns it.
 *
 * The recorder returns the value it was given, so the calculation reads the
 * same as it would without it:
 *
 *     const adherence = explain.figure('gym.adherencePercent', percentOf(4, 5), {…});
 *
 * A figure with no explanation is a bug, not a shortcut: `figure()` throws
 * when the method or the source engine is missing, the same stance rule.js
 * takes when a rule decides without a message.
 *
 * Pure. No storage, no events, no formatting for a screen.
 */

/** Engines a figure may be attributed to. A typo here should be loud. */
export const SOURCE = Object.freeze({
  CALCULATION: 'calculation-engine',
  BODY: 'body-engine',
  ENERGY: 'energy-engine',
  STRENGTH: 'strength-engine',
  RUNNING: 'running-engine',
  RUNNING_PROGRESS: 'running-progress-engine',
  EXECUTION: 'execution-engine',
  PLANNER: 'planner-engine',
  WORKOUT: 'workout-engine',
  NUTRITION: 'nutrition-engine',
  MEALS: 'meal-planning-engine',
  RECOVERY: 'recovery',
  REPORTS: 'reports-engine',
  INSIGHTS: 'insights-engine',
  DASHBOARD: 'dashboard-engine',
});

/**
 * @typedef {object} Explanation
 * @property {string} key        dotted path of the figure, e.g. 'adherence.overall'
 * @property {*} value
 * @property {string} [unit]
 * @property {string} method     how the number was reached, in words
 * @property {object} inputs     the numbers it was reached from
 * @property {string} source     which engine owns the underlying calculation
 * @property {string} [note]     what the figure does *not* say
 */

/**
 * Create a recorder for one report.
 * @returns {{figure: Function, note: Function, list: Function, map: Function, lookup: Function, has: Function}}
 */
export function createExplainer() {
  /** @type {Map<string, Explanation>} */
  const entries = new Map();

  /**
   * Record a figure and return it unchanged.
   *
   * @param {string} key
   * @param {*} value
   * @param {{method: string, source: string, inputs?: object, unit?: string, note?: string}} how
   * @returns {*} the value, so this wraps an expression in place
   * @throws {Error} when the explanation is incomplete
   */
  function figure(key, value, how = {}) {
    if (!key) throw new Error('an explained figure needs a key');
    if (!how.method) throw new Error(`figure "${key}" was recorded without a method`);
    if (!how.source) throw new Error(`figure "${key}" was recorded without a source engine`);

    entries.set(key, Object.freeze({
      key,
      value,
      unit: how.unit,
      method: how.method,
      inputs: Object.freeze({ ...(how.inputs ?? {}) }),
      source: how.source,
      note: how.note,
    }));

    return value;
  }

  /**
   * Record something that is not a number — why a figure is missing, or why a
   * judgement went the way it did. Same shape, no value.
   */
  function note(key, method, { inputs = {}, source = SOURCE.REPORTS } = {}) {
    return figure(key, null, { method, inputs, source });
  }

  return {
    figure,
    note,

    /** Every explanation, in the order the figures were produced. */
    list() { return [...entries.values()]; },

    /** The same, keyed by path — what a caller indexes into. */
    map() { return Object.fromEntries(entries); },

    /** One explanation, or null. */
    lookup(key) { return entries.get(key) ?? null; },

    has(key) { return entries.has(key); },
  };
}

/**
 * Turn an explanation into one sentence.
 *
 * This is the only place in the engine layer that builds a sentence, and it
 * builds it from data the report already holds — it is a convenience for the
 * console and for tests, not a display layer. Nothing in `pages/` needs it.
 *
 * @param {Explanation|null} explanation
 * @returns {string}
 */
export function describeExplanation(explanation) {
  if (!explanation) return 'Nothing was recorded under that key.';

  const value = explanation.value === null || explanation.value === undefined
    ? 'no value'
    : `${explanation.value}${explanation.unit ? ` ${explanation.unit}` : ''}`;

  const inputs = Object.entries(explanation.inputs ?? {})
    .map(([name, input]) => `${name}=${JSON.stringify(input)}`)
    .join(', ');

  return `${explanation.key} = ${value} — ${explanation.method}` +
    `${inputs ? ` (${inputs})` : ''} [${explanation.source}]` +
    `${explanation.note ? ` — ${explanation.note}` : ''}`;
}
