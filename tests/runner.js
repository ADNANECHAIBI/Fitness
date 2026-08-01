/**
 * runner.js — a minimal test runner.
 *
 * No framework, no build step, same constraints as the app itself. It runs in
 * a browser (tests/index.html) and under Node, so the suite can be used both
 * by hand and in CI.
 *
 * Assertions throw; the runner catches, records and keeps going, so one
 * failure never hides the rest of the results.
 */

const suites = [];
let current = null;

/** Declare a group of tests. */
export function describe(name, body) {
  current = { name, tests: [] };
  suites.push(current);
  body();
  current = null;
}

/** Declare one test. */
export function it(name, body) {
  if (!current) throw new Error(`it("${name}") must be inside a describe()`);
  current.tests.push({ name, body, skip: current.skip });
}

/** True when a real DOM is available — the browser, not Node. */
export const hasDom = typeof document !== 'undefined' && typeof document.createElement === 'function';

/**
 * A group that only runs where there is a DOM. Under Node its tests are
 * reported as skipped, which is honest: they were not run, not passed.
 */
export function describeDom(name, body) {
  current = { name, tests: [], skip: !hasDom };
  suites.push(current);
  body();
  current = null;
}

/* ── Assertions ─────────────────────────────────────────────────────────── */

function fail(message, actual, expected) {
  const error = new Error(
    `${message}\n      expected: ${format(expected)}\n      actual:   ${format(actual)}`
  );
  error.name = 'AssertionError';
  throw error;
}

function format(value) {
  if (typeof value === 'string') return `"${value}"`;
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export const expect = (actual) => ({
  /** Strict equality, with NaN treated as equal to NaN. */
  toBe(expected, message = 'values differ') {
    if (!Object.is(actual, expected)) fail(message, actual, expected);
  },

  /** Deep equality by JSON shape — enough for the plain data this app holds. */
  toEqual(expected, message = 'objects differ') {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(message, actual, expected);
  },

  toBeNull(message = 'expected null') {
    if (actual !== null) fail(message, actual, null);
  },

  toBeCloseTo(expected, decimals = 2, message = 'numbers differ') {
    const tolerance = 10 ** -decimals / 2;
    if (typeof actual !== 'number' || Math.abs(actual - expected) > tolerance) {
      fail(`${message} (±${tolerance})`, actual, expected);
    }
  },

  toBeTruthy(message = 'expected a truthy value') {
    if (!actual) fail(message, actual, 'truthy');
  },

  toBeFalsy(message = 'expected a falsy value') {
    if (actual) fail(message, actual, 'falsy');
  },

  toContain(substring, message = 'text not found') {
    if (typeof actual !== 'string' || !actual.includes(substring)) {
      fail(message, actual, `…${substring}…`);
    }
  },

  toBeGreaterThan(limit, message = 'not greater') {
    if (!(actual > limit)) fail(message, actual, `> ${limit}`);
  },

  toBeLessThan(limit, message = 'not less') {
    if (!(actual < limit)) fail(message, actual, `< ${limit}`);
  },

  /** The function must throw; optionally with a given error name. */
  toThrow(name = null, message = 'expected a throw') {
    let thrown = null;
    try { actual(); } catch (error) { thrown = error; }

    if (!thrown) fail(message, 'no error', name ?? 'an error');
    if (name && thrown.name !== name) fail(message, thrown.name, name);
    return thrown;
  },
});

/* ── Execution ──────────────────────────────────────────────────────────── */

/**
 * Run every declared suite.
 * @returns {Promise<{passed, failed, total, results}>}
 */
export async function run() {
  const results = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const suite of suites) {
    for (const test of suite.tests) {
      if (test.skip) {
        results.push({ suite: suite.name, test: test.name, ok: true, skipped: true });
        skipped += 1;
        continue;
      }

      try {
        await test.body();
        results.push({ suite: suite.name, test: test.name, ok: true });
        passed += 1;
      } catch (error) {
        results.push({ suite: suite.name, test: test.name, ok: false, error: error.message });
        failed += 1;
      }
    }
  }

  return { passed, failed, skipped, total: passed + failed, results };
}

/** Discard everything declared so far. Used between runs in the browser. */
export function reset() {
  suites.length = 0;
  current = null;
}
