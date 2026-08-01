/**
 * formula.js — how a formula is declared and how it can be replaced.
 *
 * Every equation in the app is wrapped in a Formula: a compute function plus
 * the metadata that lets the app tell the user where the number came from and
 * how much to trust it. Nothing calls a bare equation.
 *
 * Replaceability (rule 5): formulas are looked up in a registry by slot name,
 * so swapping Mifflin-St Jeor for Katch-McArdle — or for something you write
 * yourself — is one call to `registry.use()`. No engine, service or page
 * changes.
 */

/**
 * @typedef {'exact'|'estimate'} Accuracy
 *   exact    — arithmetic with no modelling assumptions (pace, volume, BMI)
 *   estimate — a population model fitted to a sample; wrong for individuals
 *              by a predictable margin
 */

/**
 * @typedef {object} Formula
 * @property {string} id
 * @property {string} name
 * @property {string} source     citation the user could look up
 * @property {Accuracy} accuracy
 * @property {string} useWhen    when this formula is the right choice
 * @property {string} [caveat]   what it gets wrong, in plain words
 * @property {Function} compute
 * @property {(input: object) => string} [explain]
 */

/**
 * Declare a formula.
 * @param {Formula} definition
 * @returns {Formula & { describe: () => object }}
 */
export function defineFormula(definition) {
  const required = ['id', 'name', 'source', 'accuracy', 'useWhen', 'compute'];
  for (const key of required) {
    if (!definition[key]) {
      throw new Error(`formula "${definition.id ?? '?'}" is missing "${key}"`);
    }
  }
  if (!['exact', 'estimate'].includes(definition.accuracy)) {
    throw new Error(`formula "${definition.id}" has an unknown accuracy`);
  }

  /** Metadata for display, without the function. */
  function describe() {
    const { compute, explain, ...meta } = definition;
    return { ...meta };
  }

  return Object.freeze({ ...definition, describe });
}

/**
 * A named slot that holds one formula at a time.
 *
 * @example
 * const bmr = createSlot('bmr', MIFFLIN_ST_JEOR, [KATCH_MCARDLE]);
 * bmr.use('katch-mcardle');     // swap, app-wide
 * bmr.current.compute({ ... });
 */
export function createSlot(slotName, defaultFormula, alternatives = []) {
  const options = new Map(
    [defaultFormula, ...alternatives].map((formula) => [formula.id, formula])
  );
  let active = defaultFormula;

  return Object.freeze({
    slotName,

    /** The formula currently in use. */
    get current() { return active; },

    /** Every formula registered for this slot. */
    get options() { return [...options.values()].map((formula) => formula.describe()); },

    /**
     * Switch the active formula.
     * @param {string} id
     * @throws {Error} when the id was never registered
     */
    use(id) {
      const next = options.get(id);
      if (!next) {
        throw new Error(`no formula "${id}" registered for slot "${slotName}"`);
      }
      active = next;
      return next;
    },

    /** Add a formula written elsewhere, then optionally switch to it. */
    register(formula) {
      options.set(formula.id, formula);
      return formula;
    },

    /** Restore the formula the app shipped with. */
    reset() { active = defaultFormula; },
  });
}
