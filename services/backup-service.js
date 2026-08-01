/**
 * BackupService — export, import, and getting back what an import broke.
 *
 * Phase 20 moved every decision out of this file. It used to decide what a
 * backup contained, whether a file was acceptable, and what to do with a
 * section that failed — three domain questions in a service. They live in
 * `engines/backup-engine.js` now, and what is left here is the part that only
 * this layer can do: talking to repositories.
 *
 * **The order matters more than anything else in this file.** Nothing is
 * written until the whole import is known to be sound:
 *
 *   1. parse and scrub the file
 *   2. read what is stored now, through repositories
 *   3. ask the engine for a *plan* — pure, writes nothing
 *   4. if the plan is not ok, stop; nothing has been touched
 *   5. take a rollback snapshot of every section the plan would change
 *   6. apply, section by section
 *   7. verify each section landed; on any failure, restore the snapshot
 *
 * Step 3 is what makes dry-run possible: "what would this do" is answered by
 * the same code path that does it, stopping one step earlier. Steps 5 and 7
 * are why a half-imported state is not reachable — not because the writes are
 * transactional, which localStorage cannot offer, but because the previous
 * state is held in memory until the last section has been checked.
 *
 * The repository boundary is absolute here as everywhere: this file reads and
 * writes through `ALL_REPOSITORIES` and never touches storage.
 */

import { ALL_REPOSITORIES } from '../repositories/index.js';
import { bus, EVENTS } from '../events/index.js';
import { ImportError } from '../validators/index.js';
import { APP } from '../scripts/config.js';
import { scrub } from '../scripts/safe-json.js';
import { createLogger } from '../scripts/logger.js';
import { BackupEngine } from '../engines/backup-engine.js';
import { BACKUP_SCOPE, IMPORT_MODE, SECTION_NAMES } from '../engines/backup-schema.js';
import { IMPORT_INTENT } from '../engines/backup-engine.js';

const log = createLogger('backup');

/** The app identity the engine stamps into a file and checks on the way in. */
const identity = () => ({
  name: APP.name,
  version: APP.version,
  build: APP.build ?? APP.version,
  schemaVersion: APP.schemaVersion,
});

/* ── Reading and writing through repositories ───────────────────────────── */

/**
 * Every section as the repositories hold it.
 * @param {string[]} [only] limit the read; defaults to everything
 */
function readAll(only = SECTION_NAMES) {
  const data = {};

  for (const [name, { repo, kind }] of Object.entries(ALL_REPOSITORIES)) {
    if (!only.includes(name)) continue;
    try {
      data[name] = kind === 'document' ? repo.get() : repo.all();
    } catch (error) {
      log.error(`[backup] could not read "${name}"`, error);
      data[name] = kind === 'document' ? null : [];
    }
  }

  return data;
}

/**
 * Write one section and confirm it landed.
 *
 * `replaceAll` skips a record it cannot revalidate and `storage.set` returns
 * false when the quota is gone — neither throws, so neither would be noticed
 * by a try/catch alone. Counting afterwards is what turns a silent partial
 * write into a failure the caller can roll back from.
 *
 * @returns {{written: number, expected: number, ok: boolean}}
 */
function writeSection(name, rows) {
  const entry = ALL_REPOSITORIES[name];
  if (!entry) return { written: 0, expected: 0, ok: true };

  const { repo, kind } = entry;

  if (kind === 'document') {
    const record = Array.isArray(rows) ? rows[0] : rows;
    if (record === undefined || record === null) return { written: 0, expected: 0, ok: true };

    repo.save(record);
    return { written: 1, expected: 1, ok: Boolean(repo.get()) };
  }

  const expected = rows.length;
  const written = repo.replaceAll(rows);

  return { written, expected, ok: written === expected };
}

/* ── Export ─────────────────────────────────────────────────────────────── */

/**
 * Everything the app owns, as one object.
 *
 * The return shape has not changed since phase 3 — `{app, version,
 * schemaVersion, exportedAt, data}` — because files written by every earlier
 * build carry it and `SyncService` reads it. Phase 20 added fields beside
 * those; it removed none.
 */
function exportSnapshot(scope = BACKUP_SCOPE.FULL, derived = {}) {
  return BackupEngine.snapshot({
    data: readAll(),
    derived,
    scope,
    app: identity(),
  });
}

/* ── Import ─────────────────────────────────────────────────────────────── */

/** Parse whatever the caller handed over, or say why it could not be. */
function parse(source) {
  try {
    return scrub(typeof source === 'string' ? JSON.parse(source) : source);
  } catch {
    throw new ImportError('That file is not valid JSON.');
  }
}

/**
 * Plan an import without touching anything.
 * @returns {object} ImportPlan
 */
function planImport(source, { mode = IMPORT_MODE.REPLACE, scope = BACKUP_SCOPE.FULL, intent = IMPORT_INTENT.APPLY } = {}) {
  const backup = parse(source);

  return BackupEngine.plan({
    backup,
    current: readAll(),
    mode,
    scope,
    intent,
    app: identity(),
  });
}

/**
 * Apply a plan, with a rollback snapshot held until the last section lands.
 *
 * @param {object} plan
 * @returns {object} the outcome
 */
function apply(plan) {
  const touched = plan.order;

  /* The automatic backup. Taken before the first write and kept in memory —
     it is the thing rollback restores from, so it is deliberately not
     written anywhere that the import itself could overwrite. */
  const rollbackPoint = readAll(touched);

  const imported = {};
  const skipped = [];
  const failures = [];

  for (const name of touched) {
    const entry = plan.sections[name];

    if (entry.skipped || !entry.accepted) {
      skipped.push(name);
      continue;
    }

    try {
      const rows = entry.mode === IMPORT_MODE.MERGE && entry.kind === 'collection'
        ? BackupEngine.mergeRecords(rollbackPoint[name] ?? [], entry.records).rows
        : entry.records;

      const result = writeSection(name, rows);

      if (!result.ok) {
        failures.push({ section: name, reason: `${result.written} of ${result.expected} records were stored; the rest were refused by storage.` });
        break;
      }

      imported[name] = result.written;
    } catch (error) {
      log.error(`[backup] "${name}" could not be written`, error);
      failures.push({ section: name, reason: error?.message ?? String(error) });
      break;
    }
  }

  if (failures.length) {
    const restored = rollback(rollbackPoint);

    return {
      success: false,
      rolledBack: true,
      restoredSections: restored,
      imported: {},
      skipped,
      failures,
      reason: `The import failed on "${failures[0].section}" and every section written before it was put back. Nothing changed. ${failures[0].reason}`,
    };
  }

  return {
    success: true,
    rolledBack: false,
    imported,
    skipped,
    failures: [],
    reason: `${Object.keys(imported).length} section${Object.keys(imported).length === 1 ? '' : 's'} written after the whole file passed validation. The previous state was held until the last one landed.`,
  };
}

/**
 * Put back what was there before.
 *
 * Best-effort by necessity: if storage is refusing writes, the restore can
 * fail too. What it can guarantee is that it tries every section rather than
 * stopping at the first problem, and reports which ones came back.
 */
function rollback(point) {
  const restored = [];

  for (const [name, value] of Object.entries(point)) {
    try {
      const { kind } = ALL_REPOSITORIES[name] ?? {};
      if (kind === 'document') {
        if (value) ALL_REPOSITORIES[name].repo.save(value);
        else ALL_REPOSITORIES[name].repo.clear();
      } else {
        ALL_REPOSITORIES[name].repo.replaceAll(value ?? []);
      }
      restored.push(name);
    } catch (error) {
      log.error(`[backup] rollback could not restore "${name}"`, error);
    }
  }

  return restored;
}

/** The outcome shape every import returns, whatever happened. */
function outcome(plan, applied) {
  return Object.freeze({
    success: applied?.success ?? plan.ok,
    intent: plan.intent,
    mode: plan.mode,

    errors: plan.errors,
    warnings: plan.warnings,

    importedItems: applied?.imported ?? {},
    skippedItems: applied?.skipped ?? Object.keys(plan.sections).filter((name) => plan.sections[name].skipped),
    fixedItems: plan.migration.applied,
    ignoredItems: plan.warnings
      .filter((item) => item.check === 'unknownFields')
      .flatMap((item) => item.evidence?.unknown ?? []),

    rolledBack: applied?.rolledBack ?? false,
    failures: applied?.failures ?? [],

    totals: plan.totals,
    migration: plan.migration,
    checksRun: plan.checksRun,

    reason: applied?.reason ?? plan.reasons[0]?.message ?? 'The file was read and nothing was written.',
    reasons: plan.reasons,
    evidence: plan.evidence,

    plan,

    /* The phase-3 shape, kept so nothing that reads it has to change. */
    restored: applied?.imported ?? {},
    skipped: applied?.skipped ?? [],
  });
}

export const BackupService = Object.freeze({
  /**
   * Everything the app owns, as one object.
   * @returns {object} BackupSnapshot
   */
  export() { return exportSnapshot(BACKUP_SCOPE.FULL); },

  /**
   * Part of it. Pass a scope — profile, training, nutrition, settings — or a
   * section name, or a list of either.
   * @returns {object} BackupSnapshot
   */
  exportScope(scope, derived = {}) { return exportSnapshot(scope, derived); },

  /** The backup as a formatted JSON string. */
  toJSON(scope = BACKUP_SCOPE.FULL) {
    return JSON.stringify(exportSnapshot(scope), null, 2);
  },

  /** Trigger a file download in the browser. @returns {string} the file name */
  download(scope = BACKUP_SCOPE.FULL) {
    const suffix = scope === BACKUP_SCOPE.FULL ? '' : `-${scope}`;
    const name = `foundation-backup${suffix}-${new Date().toISOString().slice(0, 10)}.json`;

    const blob = new Blob([this.toJSON(scope)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();

    // Release the object URL once the download has started.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  },

  /**
   * Restore from a backup object or JSON string.
   *
   * Replaces by default: the file is the new truth. The return value keeps
   * `{restored, skipped}` from phase 3 and carries the fuller outcome beside
   * it, so nothing that already reads those two keys has to change.
   *
   * @param {object|string} source
   * @param {{mode?: string, scope?: string|string[]}} [options]
   * @returns {object} the outcome
   * @throws {ImportError} when the file is not a Foundation backup at all
   */
  import(source, options = {}) {
    const plan = planImport(source, { ...options, intent: IMPORT_INTENT.APPLY });

    /* A file that fails the envelope check has never been importable, and
       callers since phase 3 catch ImportError. That contract is kept. */
    if (!plan.ok && plan.errors.some((item) => !item.section)) {
      throw new ImportError(plan.errors.find((item) => !item.section).message);
    }

    const applied = apply(plan);

    if (applied.success) {
      bus.emit(EVENTS.DATA_IMPORTED, { restored: applied.imported, skipped: applied.skipped });
    }

    return outcome(plan, applied);
  },

  /** Merge a file into what is stored instead of replacing it. */
  merge(source, options = {}) {
    return this.import(source, { ...options, mode: IMPORT_MODE.MERGE });
  },

  /**
   * What an import would do, without doing any of it.
   * Nothing is written and no cache is invalidated.
   */
  dryRun(source, options = {}) {
    const plan = planImport(source, { ...options, intent: IMPORT_INTENT.DRY_RUN });
    return outcome(plan, null);
  },

  /** Only the checks. The same code path as an import, stopped earlier. */
  validate(source, options = {}) {
    const plan = planImport(source, { ...options, intent: IMPORT_INTENT.VALIDATE_ONLY });
    return outcome(plan, null);
  },

  /**
   * Read a File from an <input type="file"> and restore it.
   * @param {File} file
   * @returns {Promise<object>}
   */
  async importFile(file, options = {}) {
    if (!file) throw new ImportError('No file was selected.');
    const text = await file.text();
    return this.import(text, options);
  },

  /** Delete everything the app owns. Irreversible. */
  reset() {
    for (const { repo } of Object.values(ALL_REPOSITORIES)) {
      repo.clear();
    }
    bus.emit(EVENTS.DATA_RESET, null);
  },

  /** The scopes and modes, for a caller offering them as choices. */
  SCOPE: BACKUP_SCOPE,
  MODE: IMPORT_MODE,
  INTENT: IMPORT_INTENT,
});
