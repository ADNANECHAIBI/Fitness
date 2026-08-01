/**
 * run-node.js — command-line entry point for the suite.
 * Usage: npm test
 *
 * The engines are pure, so they run under Node with no DOM shim. Anything
 * that needs a browser (storage, routing) is covered from tests/index.html.
 */

import { Logger } from '../scripts/logger.js';
import { run } from './index.js';

// Several tests deliberately trigger contained failures. Their log output is
// expected, so it is silenced here rather than left to bury the results.
Logger.setLevel(Logger.LEVEL.SILENT);

const { passed, failed, skipped, total, results } = await run();

for (const result of results.filter((r) => !r.ok)) {
  console.error(`FAIL  ${result.suite} › ${result.test}\n      ${result.error}\n`);
}

console.log(
  `${passed}/${total} passed${failed ? `, ${failed} failed` : ''}` +
  `${skipped ? `, ${skipped} skipped (need a browser — open tests/index.html)` : ''}` +
  `${failed ? '' : ' — all green'}`
);
process.exit(failed ? 1 : 0);
