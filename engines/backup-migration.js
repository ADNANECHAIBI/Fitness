/**
 * backup-migration.js — reading a file written by an older build.
 *
 * A migration is a small, independent, pure function: given the data as
 * version *n* left it, return the data as version *n+1* expects it, plus a
 * note about what it changed. Nothing shares state with anything else, and
 * none of them writes.
 *
 * They run in a chain. A file at version 1 opened by a build at version 3
 * runs 1→2 then 2→3, in that order, and each step sees only what the step
 * before it produced. That is the whole reason they are one-step-at-a-time:
 * a single function that tried to handle "any old version" would grow a
 * branch per release and be untestable within a year.
 *
 * **Forward compatibility** is the direction that cannot be solved by code. A
 * file from a *newer* build may contain fields this one has never heard of,
 * and there is no honest way to guess what they mean — so the envelope check
 * refuses it rather than importing three-quarters of it and calling that
 * success. What this build *can* promise is that it never silently discards:
 * unknown fields are reported before anything is written.
 *
 * **Backward compatibility** is solved by code, and it is the direction that
 * matters: a backup a user made a year ago must still restore. Every
 * migration below is kept forever for that reason, including the ones that
 * are now trivial.
 *
 * Pure. No storage, no events, no clock.
 */

/**
 * @typedef {object} Migration
 * @property {string} id        stable, for logs and tests
 * @property {number} from      the version this step reads
 * @property {number} to        the version it produces
 * @property {string} describe  one line, in words
 * @property {(data: object) => {data: object, changed: string[]}} apply
 */

/**
 * The chain, in order.
 *
 * Version 1 is the first shipped schema. When the stored shape changes, bump
 * `APP.schemaVersion` and add a step here — do not edit an existing one, or a
 * file already in the wild stops migrating correctly.
 */
export const MIGRATIONS = Object.freeze([
  /**
   * Version 0 is what a file with no version stamp is treated as: an export
   * from before the stamp existed. Those files are structurally identical to
   * version 1 — the stamp was added alongside it — so this step only records
   * that the assumption was made, rather than pretending to have verified it.
   */
  {
    id: 'v0-to-v1.assume-first-schema',
    from: 0,
    to: 1,
    describe: 'A file with no schema version is read as the first schema, which is the only one that ever shipped without a stamp.',
    apply(data) {
      return { data, changed: [] };
    },
  },
]);

/** The lowest version any migration can start from. */
export const OLDEST_SUPPORTED = 0;

/**
 * Migrate a file's data forward to the target version.
 *
 * @param {object} data     the file's `data` object
 * @param {number} from     the version it was written at
 * @param {number} to       the version this build expects
 * @returns {{data: object, applied: object[], reason: string, migrated: boolean}}
 */
export function migrate(data, from, to) {
  const start = Number.isFinite(from) ? from : OLDEST_SUPPORTED;

  if (start >= to) {
    return {
      data,
      applied: [],
      migrated: false,
      reason: start === to
        ? `The file is already at schema version ${to}; nothing to migrate.`
        : `The file declares schema version ${start}, which is ahead of this build's ${to}. No migration runs backwards.`,
    };
  }

  let current = data;
  const applied = [];

  for (let version = start; version < to; version += 1) {
    const step = MIGRATIONS.find((migration) => migration.from === version);

    if (!step) {
      return {
        data: current,
        applied,
        migrated: applied.length > 0,
        reason: `No migration exists from schema version ${version} to ${version + 1}, so the file is left at ${version}. It was not guessed at.`,
      };
    }

    const result = step.apply(current);
    current = result.data;

    applied.push({
      id: step.id,
      from: step.from,
      to: step.to,
      describe: step.describe,
      changed: result.changed ?? [],
    });
  }

  return {
    data: current,
    applied,
    migrated: applied.length > 0,
    reason: applied.length
      ? `Migrated from schema version ${start} to ${to} in ${applied.length} step${applied.length === 1 ? '' : 's'}: ${applied.map((step) => step.id).join(' → ')}.`
      : `The file needed no migration to reach schema version ${to}.`,
  };
}

/** Whether a chain exists from one version to another. */
export function canMigrate(from, to) {
  if (from >= to) return from === to;

  for (let version = from; version < to; version += 1) {
    if (!MIGRATIONS.some((migration) => migration.from === version)) return false;
  }
  return true;
}
