/**
 * backup-validation.js — is this file safe to import?
 *
 * Eleven checks, and **none of them is a validation rule**. Every question
 * about whether a record is well-formed is asked of the model that owns it,
 * through `model.isValid()`, which runs exactly the schema a repository would
 * have run on `create()`. What this file adds is the questions a schema
 * cannot answer because they are about the file rather than the record:
 *
 *   schema           does the envelope look like a Foundation backup at all
 *   version          was it written by a build this one can read
 *   required models  are the sections it claims to carry actually present
 *   unknown fields   does a record carry keys its schema never declared
 *   invalid types    does a record fail its own model
 *   broken refs      does it point at an exercise or food that does not exist
 *   duplicate ids    do two records in one section share an id
 *   invalid dates    is a date field a date
 *   invalid goals    is a stored goal one the app knows
 *   corrupted        is a record an object at all
 *   empty            is a section present but empty
 *
 * Severity is the whole design here. An **error** stops a section from being
 * imported. A **warning** does not: a session referring to an exercise that
 * has since been removed from the database is still a session that happened,
 * and refusing it would lose real training history to protect a foreign key.
 * A record that fails its model is an error, because nothing downstream can
 * read it.
 *
 * Pure. No storage, no events, no clock.
 */

import { SECTIONS, fieldsOf } from './backup-schema.js';
import { ExerciseDB } from '../data/exercises/index.js';
import { FoodDB } from '../data/foods/index.js';
import { GOAL } from '../models/profile.js';
import { NUTRITION_GOAL, GOAL_ALIASES } from './constants.js';

/** What a finding can be. An error blocks; a warning is recorded and passed. */
export const SEVERITY = Object.freeze({ ERROR: 'error', WARNING: 'warning' });

/** The named checks, so a caller can ask which ran. */
export const CHECKS = Object.freeze([
  'schema', 'version', 'requiredModels', 'unknownFields', 'invalidTypes',
  'brokenReferences', 'duplicateIds', 'invalidDates', 'invalidGoals',
  'corruptedObjects', 'emptyCollections',
]);

const CATALOGUES = { exercise: ExerciseDB, food: FoodDB };

/** Every goal string the app recognises, in either vocabulary. */
const KNOWN_GOALS = new Set([
  ...Object.values(NUTRITION_GOAL),
  ...Object.keys(GOAL_ALIASES),
  ...(Array.isArray(GOAL) ? GOAL : Object.values(GOAL ?? {})),
]);

/** ISO calendar date, and a date that actually exists. */
function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** One finding, in the shape every check produces. */
const finding = (check, severity, section, message, evidence = {}) =>
  Object.freeze({ check, severity, section, message, evidence });

/* ── The envelope ───────────────────────────────────────────────────────── */

/**
 * Is this a Foundation backup, and can this build read it?
 *
 * @param {object} backup
 * @param {{appName: string, schemaVersion: number}} app
 * @returns {object[]} findings
 */
export function checkEnvelope(backup, app) {
  const findings = [];

  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return [finding('schema', SEVERITY.ERROR, null,
      'The file is not an object, so there is nothing to read.', { received: typeof backup })];
  }

  if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
    findings.push(finding('schema', SEVERITY.ERROR, null,
      'The file has no "data" object. Every Foundation backup carries its sections under that key.',
      { keys: Object.keys(backup) }));
  }

  if (backup.app && backup.app !== app.appName) {
    findings.push(finding('schema', SEVERITY.ERROR, null,
      `The file says it was written by "${backup.app}", not by ${app.appName}.`,
      { declared: backup.app, expected: app.appName }));
  }

  const schemaVersion = Number(backup.schemaVersion);

  if (!Number.isFinite(schemaVersion)) {
    findings.push(finding('version', SEVERITY.WARNING, null,
      'The file carries no schema version, so it is treated as the oldest one this build knows and migrated forward.',
      { declared: backup.schemaVersion ?? null }));
  } else if (schemaVersion > app.schemaVersion) {
    findings.push(finding('version', SEVERITY.ERROR, null,
      `The file was written against schema version ${schemaVersion}; this build understands up to ${app.schemaVersion}. Importing it would silently drop whatever the newer version added.`,
      { fileVersion: schemaVersion, appVersion: app.schemaVersion }));
  }

  return findings;
}

/* ── The sections ───────────────────────────────────────────────────────── */

/**
 * Check one section's records against their own model.
 *
 * @param {string} section
 * @param {*} incoming        whatever the file carried under that key
 * @param {{required?: boolean}} [options]
 * @returns {{findings: object[], valid: object[], rejected: object[]}}
 */
export function checkSection(section, incoming, { required = false } = {}) {
  const definition = SECTIONS[section];
  const findings = [];

  if (!definition) {
    return {
      findings: [finding('schema', SEVERITY.WARNING, section,
        `The file carries a section called "${section}" that this build has no model for. It is ignored rather than guessed at.`,
        { section })],
      valid: [], rejected: [],
    };
  }

  if (incoming === undefined || incoming === null) {
    return {
      findings: required
        ? [finding('requiredModels', SEVERITY.ERROR, section,
          `The file claims to be a ${definition.label} backup but carries no ${section}.`, { section })]
        : [],
      valid: [], rejected: [],
    };
  }

  return definition.kind === 'document'
    ? checkDocument(section, definition, incoming, findings)
    : checkCollection(section, definition, incoming, findings);
}

function checkDocument(section, definition, incoming, findings) {
  if (typeof incoming !== 'object' || Array.isArray(incoming)) {
    findings.push(finding('corruptedObjects', SEVERITY.ERROR, section,
      `${definition.label} should be a single object; the file carries ${Array.isArray(incoming) ? 'a list' : typeof incoming}.`,
      { received: Array.isArray(incoming) ? 'array' : typeof incoming }));
    return { findings, valid: [], rejected: [incoming] };
  }

  findings.push(...unknownFields(section, incoming, 0));
  findings.push(...badDates(section, incoming, 0));
  findings.push(...badGoals(section, incoming, 0));

  const check = definition.model.isValid(incoming, { partial: true });

  if (!check.valid) {
    findings.push(finding('invalidTypes', SEVERITY.ERROR, section,
      `${definition.label} does not pass its own model: ${Object.keys(check.errors).join(', ')}.`,
      { fields: check.errors }));
    return { findings, valid: [], rejected: [incoming] };
  }

  findings.push(...brokenReferences(section, definition, [incoming]));
  return { findings, valid: [incoming], rejected: [] };
}

function checkCollection(section, definition, incoming, findings) {
  if (!Array.isArray(incoming)) {
    findings.push(finding('corruptedObjects', SEVERITY.ERROR, section,
      `${definition.label} should be a list; the file carries ${typeof incoming}.`,
      { received: typeof incoming }));
    return { findings, valid: [], rejected: [] };
  }

  if (!incoming.length) {
    findings.push(finding('emptyCollections', SEVERITY.WARNING, section,
      `${definition.label} is present but empty. On a replace this clears whatever is there now, which may be what was intended.`,
      { section }));
    return { findings, valid: [], rejected: [] };
  }

  const valid = [];
  const rejected = [];
  const seen = new Map();

  incoming.forEach((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      findings.push(finding('corruptedObjects', SEVERITY.ERROR, section,
        `Record ${index} of ${definition.label} is ${record === null ? 'null' : typeof record}, not an object.`,
        { index, received: record === null ? 'null' : typeof record }));
      rejected.push(record);
      return;
    }

    if (record.id !== undefined && record.id !== null) {
      const first = seen.get(record.id);
      if (first !== undefined) {
        findings.push(finding('duplicateIds', SEVERITY.ERROR, section,
          `Records ${first} and ${index} of ${definition.label} share the id "${record.id}". Importing both would make one of them unreachable.`,
          { id: record.id, first, duplicate: index }));
        rejected.push(record);
        return;
      }
      seen.set(record.id, index);
    }

    findings.push(...unknownFields(section, record, index));

    const dateFindings = badDates(section, record, index);
    findings.push(...dateFindings);

    const check = definition.model.isValid(record);

    if (!check.valid) {
      findings.push(finding('invalidTypes', SEVERITY.ERROR, section,
        `Record ${index} of ${definition.label} does not pass its own model: ${Object.keys(check.errors).join(', ')}.`,
        { index, id: record.id ?? null, fields: check.errors }));
      rejected.push(record);
      return;
    }

    if (dateFindings.some((item) => item.severity === SEVERITY.ERROR)) {
      rejected.push(record);
      return;
    }

    valid.push(record);
  });

  findings.push(...brokenReferences(section, definition, valid));

  return { findings, valid, rejected };
}

/* ── The individual checks ──────────────────────────────────────────────── */

/**
 * Keys the schema never declared.
 *
 * A warning, not an error: a schema silently drops what it does not declare,
 * so an unknown key is data that will be lost rather than data that will
 * break anything — and saying so is more useful than refusing the record.
 */
function unknownFields(section, record, index) {
  const known = new Set(fieldsOf(section));
  const unknown = Object.keys(record).filter((key) => !known.has(key));

  if (!unknown.length) return [];

  return [finding('unknownFields', SEVERITY.WARNING, section,
    `Record ${index} carries ${unknown.length} field${unknown.length === 1 ? '' : 's'} this build does not know: ${unknown.join(', ')}. They are dropped on import, because a schema keeps only what it declares.`,
    { index, unknown })];
}

/** Any field whose name says date and whose value is not one. */
function badDates(section, record, index) {
  const findings = [];

  for (const [key, value] of Object.entries(record)) {
    if (!/^date$|Date$/.test(key) || value === null || value === undefined) continue;

    /* createdAt and updatedAt are timestamps, not calendar dates. */
    if (key === 'createdAt' || key === 'updatedAt') continue;

    if (!isIsoDate(value)) {
      findings.push(finding('invalidDates', SEVERITY.ERROR, section,
        `Record ${index} has "${key}" set to ${JSON.stringify(value)}, which is not a real calendar date. Every engine that reads this app sorts and groups by date, so an unparseable one corrupts far more than its own record.`,
        { index, field: key, value }));
    }
  }

  return findings;
}

/** A goal string the app does not recognise, in either vocabulary. */
function badGoals(section, record, index) {
  const goal = record?.goal;
  if (goal === undefined || goal === null || goal === '') return [];

  if (KNOWN_GOALS.has(goal)) return [];

  return [finding('invalidGoals', SEVERITY.ERROR, section,
    `Record ${index} has a goal of "${goal}", which is not one this build knows. The nutrition engine branches on the goal, so an unknown one produces a plan built on nothing.`,
    { index, goal, known: [...KNOWN_GOALS] })];
}

/**
 * References into the exercise and food databases.
 *
 * Warnings by default, and deliberately so. The databases ship with the app
 * and change between versions; a session naming an exercise that has since
 * been renamed is still a session that was performed, and dropping it to
 * preserve a foreign key would destroy the more valuable of the two.
 */
function brokenReferences(section, definition, records) {
  const references = definition.references ?? [];
  if (!references.length) return [];

  const findings = [];

  for (const reference of references) {
    const catalogue = CATALOGUES[reference.catalogue];
    if (!catalogue) continue;

    const missing = new Set();

    for (const record of records) {
      for (const id of reference.collect(record) ?? []) {
        if (typeof id === 'string' && id && !catalogue.has(id)) missing.add(id);
      }
    }

    if (missing.size) {
      findings.push(finding('brokenReferences',
        reference.severity === SEVERITY.ERROR ? SEVERITY.ERROR : SEVERITY.WARNING,
        section,
        `${missing.size} ${reference.catalogue} id${missing.size === 1 ? '' : 's'} in ${reference.field} are not in this build's database: ${[...missing].slice(0, 10).join(', ')}. The records are kept — a workout that happened is worth more than a foreign key — but anything looking those ids up will find nothing.`,
        { field: reference.field, catalogue: reference.catalogue, missing: [...missing] }));
    }
  }

  return findings;
}

/* ── Integrity across sections ──────────────────────────────────────────── */

/**
 * Relations between sections, which no single section can check.
 *
 * @param {Record<string, object[]|object>} data  the sections, already checked
 * @returns {object[]} findings
 */
export function checkIntegrity(data) {
  const findings = [];

  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const sets = Array.isArray(data.workouts) ? data.workouts : [];

  /* A logged set naming a session that is not in the file. Not an error: sets
     were logged without sessions for the app's first eleven phases, and every
     one of those records is still legitimate. */
  const sessionIds = new Set(sessions.map((session) => session?.id).filter(Boolean));
  const orphaned = sets
    .filter((row) => row?.sessionId && !sessionIds.has(row.sessionId))
    .map((row) => row.sessionId);

  if (orphaned.length) {
    findings.push(finding('brokenRelations', SEVERITY.WARNING, 'workouts',
      `${orphaned.length} logged set${orphaned.length === 1 ? '' : 's'} name a session that is not in this file. Sets have been logged without a session since before sessions existed, so they are kept as free-standing records.`,
      { count: orphaned.length, sessionIds: [...new Set(orphaned)].slice(0, 10) }));
  }

  /* Two records of the same thing on the same day is usually a double import
     rather than a genuine duplicate, and is worth naming before it doubles
     someone's tonnage for the week. */
  for (const [section, rows] of Object.entries(data)) {
    if (!Array.isArray(rows) || rows.length < 2) continue;

    const counts = new Map();
    for (const row of rows) {
      if (!row?.date) continue;
      const key = `${row.date}|${row.exercise ?? row.type ?? row.name ?? ''}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const repeated = [...counts.entries()].filter(([, count]) => count > 1);

    if (repeated.length > 0 && section === 'nutrition') {
      findings.push(finding('duplicateRecords', SEVERITY.WARNING, section,
        `${repeated.length} date${repeated.length === 1 ? ' has' : 's have'} more than one nutrition record. One day is meant to carry one, so the engines will read only the first and the rest become invisible.`,
        { dates: repeated.map(([key]) => key.split('|')[0]).slice(0, 10) }));
    }
  }

  return findings;
}
