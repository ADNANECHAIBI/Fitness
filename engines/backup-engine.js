/**
 * backup-engine.js — phase 20. Getting the data out, and back in.
 *
 * This engine writes nothing and reads nothing. It is handed plain data,
 * hands plain data back, and the service above it is what talks to
 * repositories — which is the only reason a backup can be dry-run at all: if
 * the deciding and the writing lived in the same function, "what would this
 * import do" could only be answered by doing it.
 *
 * Two halves.
 *
 * **Export.** `snapshot()` takes the current data and produces a
 * `BackupSnapshot`: an envelope naming the app, its version, its build, the
 * schema version and the time, then the sections, then metadata counting what
 * went in. A partial export is the same object with fewer sections and a
 * `scope` saying which — never a different shape, because a file that
 * sometimes has a different shape is a file every future reader has to guess
 * about.
 *
 * **Import.** `plan()` takes a candidate file and the current data and
 * returns an `ImportPlan`: what would be written, section by section, what
 * would be skipped, every finding behind those decisions, and whether the
 * whole thing is safe to apply. It never applies it. `BackupService` takes
 * the plan and executes it through repositories, or does not.
 *
 * That split is what makes dry-run, validate-only and rollback possible, and
 * it is why the phrase "half-imported" does not describe any state this code
 * can reach: nothing is written until the entire plan is known to be sound.
 *
 * Pure. No storage, no events, no clock except the `createdAt` stamp a caller
 * may override.
 */

import {
  SECTIONS, SECTION_NAMES, BACKUP_SCOPE, IMPORT_MODE, sectionsFor,
} from './backup-schema.js';
import { checkEnvelope, checkSection, checkIntegrity, SEVERITY, CHECKS } from './backup-validation.js';
import { migrate, canMigrate, MIGRATIONS } from './backup-migration.js';
import { makeReason } from '../rules/rule.js';

export const BACKUP_ENGINE_VERSION = '1.0.0';

/** What an import was asked to do without doing it. */
export const IMPORT_INTENT = Object.freeze({
  APPLY: 'apply',
  DRY_RUN: 'dry-run',
  VALIDATE_ONLY: 'validate-only',
});

/* ── Export ─────────────────────────────────────────────────────────────── */

/**
 * Build a backup snapshot.
 *
 * The derived sections — reports, insights, analytics, dashboard — are
 * carried only when a caller passes them, and they are marked `derived` in
 * the metadata. They are never restored: everything in them can be rebuilt
 * from the records, and importing a stale analysis over live data would put
 * the app in a state its own engines disagree with. They are in the file so a
 * backup is a readable record of what the app was saying at the time, which
 * is worth having and is not the same as being restorable.
 *
 * @param {object} input
 * @param {Record<string, *>} input.data        the sections, from repositories
 * @param {object} [input.derived]              reports/insights/analytics/dashboard
 * @param {string|string[]} [input.scope]       BACKUP_SCOPE
 * @param {object} input.app                    { name, version, build, schemaVersion }
 * @param {string} [input.createdAt]
 * @returns {object} BackupSnapshot, frozen
 */
function snapshot({ data = {}, derived = {}, scope = BACKUP_SCOPE.FULL, app = {}, createdAt } = {}) {
  const wanted = sectionsFor(scope);
  const sections = {};
  const counts = {};

  for (const name of wanted) {
    const value = data[name];
    if (value === undefined) continue;

    sections[name] = value;
    counts[name] = Array.isArray(value) ? value.length : (value ? 1 : 0);
  }

  const full = wanted.length === SECTION_NAMES.length;

  return Object.freeze({
    app: app.name ?? null,
    version: app.version ?? null,
    build: app.build ?? app.version ?? null,
    schemaVersion: app.schemaVersion ?? null,
    createdAt: createdAt ?? new Date().toISOString(),
    exportedAt: createdAt ?? new Date().toISOString(),

    scope: full ? BACKUP_SCOPE.FULL : (Array.isArray(scope) ? scope : [scope]),

    data: sections,

    /* Present for reading, never for restoring. See the note above. */
    derived: Object.freeze({
      reports: derived.reports ?? null,
      insights: derived.insights ?? null,
      analytics: derived.analytics ?? null,
      dashboard: derived.dashboard ?? null,
    }),

    metadata: Object.freeze({
      engineVersion: BACKUP_ENGINE_VERSION,
      engineId: 'backup-engine',
      sections: wanted.filter((name) => name in sections),
      omitted: SECTION_NAMES.filter((name) => !(name in sections)),
      counts,
      records: Object.values(counts).reduce((total, count) => total + count, 0),
      derivedIncluded: Object.entries(derived)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key]) => key),
      derivedRestorable: false,
      reason: full
        ? 'A full export: every section the app owns, as the repositories hold them.'
        : `A partial export covering ${wanted.join(', ')}. Importing it changes only those sections and leaves the rest as they are.`,
    }),
  });
}

/* ── Import ─────────────────────────────────────────────────────────────── */

/**
 * Work out what importing a file would do.
 *
 * @param {object} input
 * @param {object} input.backup                 the candidate file, already parsed
 * @param {Record<string, *>} [input.current]   what is stored now, for counting
 * @param {string} [input.mode]                 IMPORT_MODE
 * @param {string|string[]} [input.scope]       limit the import to some sections
 * @param {string} [input.intent]               IMPORT_INTENT
 * @param {object} input.app                    { name, schemaVersion }
 * @returns {object} ImportPlan, frozen
 */
function plan({
  backup, current = {}, mode = IMPORT_MODE.REPLACE,
  scope = BACKUP_SCOPE.FULL, intent = IMPORT_INTENT.APPLY, app = {},
} = {}) {
  const errors = [];
  const warnings = [];
  const reasons = [];

  /* 1. The envelope. A file that fails here is not read any further — every
        later check assumes a shape this one is what establishes. */
  const envelope = checkEnvelope(backup, {
    appName: app.name,
    schemaVersion: app.schemaVersion,
  });

  sort(envelope, errors, warnings);

  if (errors.length) {
    return refuse({
      mode, scope, intent, errors, warnings,
      reason: 'The file was refused before any section was read: its envelope is not one this build can trust.',
    });
  }

  /* 2. Migration, before validation. A version-1 record checked against a
        version-3 schema fails for reasons that migration would have fixed. */
  const declared = Number.isFinite(Number(backup.schemaVersion))
    ? Number(backup.schemaVersion)
    : 0;

  const migration = migrate(backup.data ?? {}, declared, app.schemaVersion);

  if (migration.applied.length) {
    reasons.push(makeReason(
      { id: 'backup.migrated', name: 'Migrated forward', scope: 'import' },
      migration.reason,
      { from: declared, to: app.schemaVersion, steps: migration.applied }
    ));
  }

  if (!canMigrate(declared, app.schemaVersion)) {
    warnings.push({
      check: 'version', severity: SEVERITY.WARNING, section: null,
      message: migration.reason,
      evidence: { from: declared, to: app.schemaVersion },
    });
  }

  /* 3. Each section, against its own model. */
  const wanted = sectionsFor(scope);
  const carried = Object.keys(migration.data);
  const sections = {};

  for (const name of carried) {
    if (!wanted.includes(name) && SECTION_NAMES.includes(name)) {
      reasons.push(makeReason(
        { id: 'backup.out-of-scope', name: 'Out of scope', scope: 'import' },
        `The file carries "${name}" but the import was limited to ${wanted.join(', ')}, so it is left untouched.`,
        { section: name, scope: wanted }
      ));
      continue;
    }

    const result = checkSection(name, migration.data[name]);
    sort(result.findings, errors, warnings);

    if (!SECTION_NAMES.includes(name)) continue;

    const definition = SECTIONS[name];
    const blocked = result.findings.some((item) => item.severity === SEVERITY.ERROR);

    sections[name] = {
      section: name,
      label: definition.label,
      kind: definition.kind,
      mode,
      incoming: countOf(migration.data[name]),
      accepted: result.valid.length,
      rejected: result.rejected.length,
      existing: countOf(current[name]),
      records: result.valid,
      skipped: blocked && definition.kind === 'document',
      reason: reasonFor(definition, result, mode, blocked),
    };
  }

  /* 4. Sections the file did not carry at all. */
  for (const name of wanted) {
    if (name in sections) continue;
    reasons.push(makeReason(
      { id: 'backup.absent-section', name: 'Section absent', scope: 'import' },
      `The file carries no "${name}". It is left exactly as it is — an absent section is not an empty one, and a partial backup must not wipe what it never claimed to hold.`,
      { section: name, existing: countOf(current[name]) }
    ));
  }

  /* 5. Relations no single section can see. */
  sort(checkIntegrity(migration.data), errors, warnings);

  /* 6. The verdict. Errors that belong to a section stop that section;
        errors without one stop the import. */
  const fatal = errors.filter((item) => !item.section);
  const importable = Object.values(sections).filter((entry) => !entry.skipped && entry.accepted > 0);

  const safe = fatal.length === 0;

  if (safe && !importable.length) {
    reasons.push(makeReason(
      { id: 'backup.nothing-to-import', name: 'Nothing to import', scope: 'import' },
      'The file is valid and contains no record this build can accept. Nothing is written, which is different from an import that failed.',
      { sections: Object.keys(sections) }
    ));
  }

  return Object.freeze({
    ok: safe,
    intent,
    mode,
    scope: wanted,
    willWrite: intent === IMPORT_INTENT.APPLY && safe,

    sections,
    order: SECTION_NAMES.filter((name) => name in sections),

    migration: {
      from: declared,
      to: app.schemaVersion ?? null,
      applied: migration.applied,
      migrated: migration.migrated,
      reason: migration.reason,
    },

    errors,
    warnings,
    checksRun: CHECKS,

    totals: {
      incoming: sum(sections, (entry) => entry.incoming),
      accepted: sum(sections, (entry) => entry.accepted),
      rejected: sum(sections, (entry) => entry.rejected),
      sections: Object.keys(sections).length,
    },

    reasons,

    evidence: Object.fromEntries(
      Object.entries(sections).map(([name, entry]) => [name, {
        incoming: entry.incoming, accepted: entry.accepted,
        rejected: entry.rejected, existing: entry.existing,
      }])
    ),

    meta: {
      engineVersion: BACKUP_ENGINE_VERSION,
      engineId: 'backup-engine',
      migrationsAvailable: MIGRATIONS.map((step) => step.id),
      fileVersion: backup?.version ?? null,
      fileCreatedAt: backup?.createdAt ?? backup?.exportedAt ?? null,
    },
  });
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

const countOf = (value) => (Array.isArray(value) ? value.length : (value ? 1 : 0));

const sum = (sections, read) =>
  Object.values(sections).reduce((total, entry) => total + read(entry), 0);

/** Split findings into the two lists a caller acts on differently. */
function sort(findings, errors, warnings) {
  for (const item of findings ?? []) {
    (item.severity === SEVERITY.ERROR ? errors : warnings).push(item);
  }
}

/** Why a section will be written, skipped, or partly written. */
function reasonFor(definition, result, mode, blocked) {
  if (blocked && definition.kind === 'document') {
    return `${definition.label} failed its own model, so it is skipped entirely. A document is one record: there is no partial version of it to keep.`;
  }
  if (!result.valid.length) {
    return `${definition.label} carries nothing this build can accept, so nothing is written for it.`;
  }
  if (result.rejected.length) {
    return `${result.valid.length} of ${result.valid.length + result.rejected.length} ${definition.label} records passed their model and will be ${mode === IMPORT_MODE.MERGE ? 'merged' : 'written'}; ${result.rejected.length} were rejected and are listed in the errors. A partial section beats losing the whole file.`;
  }
  return `All ${result.valid.length} ${definition.label} record${result.valid.length === 1 ? '' : 's'} passed their model and will be ${mode === IMPORT_MODE.MERGE ? 'merged with what is already stored' : 'written over what is stored'}.`;
}

/** A plan that refuses, in the same shape as one that does not. */
function refuse({ mode, scope, intent, errors, warnings, reason }) {
  return Object.freeze({
    ok: false,
    intent,
    mode,
    scope: sectionsFor(scope),
    willWrite: false,
    sections: {},
    order: [],
    migration: { from: null, to: null, applied: [], migrated: false, reason: 'Not attempted: the file was refused first.' },
    errors,
    warnings,
    checksRun: CHECKS,
    totals: { incoming: 0, accepted: 0, rejected: 0, sections: 0 },
    reasons: [makeReason(
      { id: 'backup.refused', name: 'File refused', scope: 'import' },
      reason,
      { errors: errors.map((item) => item.message) }
    )],
    evidence: {},
    meta: {
      engineVersion: BACKUP_ENGINE_VERSION,
      engineId: 'backup-engine',
      migrationsAvailable: MIGRATIONS.map((step) => step.id),
      fileVersion: null,
      fileCreatedAt: null,
    },
  });
}

/**
 * Merge one section's incoming records with what is stored.
 *
 * Pure, and separated from the writing on purpose: the merge rule — incoming
 * wins on a shared id, order is stable, everything else is kept — is a
 * decision, and decisions belong here rather than inside a loop in a service.
 *
 * @param {object[]} existing
 * @param {object[]} incoming
 * @returns {{rows: object[], added: number, replaced: number, kept: number}}
 */
function mergeRecords(existing = [], incoming = []) {
  const byId = new Map((existing ?? []).filter(Boolean).map((row) => [row.id, row]));
  const before = byId.size;
  let replaced = 0;

  for (const row of incoming ?? []) {
    if (!row) continue;
    if (row.id !== undefined && byId.has(row.id)) replaced += 1;
    byId.set(row.id, row);
  }

  return {
    rows: [...byId.values()],
    added: byId.size - before,
    replaced,
    kept: before - replaced,
  };
}

export const BackupEngine = Object.freeze({
  snapshot,
  plan,
  mergeRecords,

  SCOPE: BACKUP_SCOPE,
  MODE: IMPORT_MODE,
  INTENT: IMPORT_INTENT,
  SECTIONS: SECTION_NAMES,

  version: BACKUP_ENGINE_VERSION,
});
