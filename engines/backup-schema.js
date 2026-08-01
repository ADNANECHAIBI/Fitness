/**
 * backup-schema.js — what a backup file contains, declared once.
 *
 * Every section of a `BackupSnapshot` is named here alongside the model that
 * owns its records, whether it holds one document or many, which group it
 * belongs to for a partial export, and where inside it any cross-references
 * live. Export, import, validation, integrity checking and migration all read
 * this one table, which is why adding a section is a single edit rather than
 * five.
 *
 * **This is not a second copy of the repository registry.** The engine layer
 * may not import repositories — that boundary has held since phase 3 — so the
 * mapping from a section name to its *model* lives here and the mapping from
 * a section name to its *storage* stays in `repositories/index.js`. The two
 * lists must agree on their keys, and a test asserts exactly that, so a
 * repository added without a section here fails the suite rather than
 * silently dropping out of every backup.
 *
 * **No validation rule is written here.** A section names its model; the
 * model's schema is what a record is checked against. Nothing in the backup
 * layer knows what a valid weight in kilograms is, and it never will.
 *
 * Pure data. No storage, no events, no clock.
 */

import {
  Profile, Settings, Goals, Schedule, BodyMeasurements, Running, Gym,
  Nutrition, Supplements, WeeklyReport, WorkoutSession, Notification,
  PlanSnapshot,
} from '../models/index.js';

/** The groups a partial export can ask for. */
export const BACKUP_SCOPE = Object.freeze({
  FULL: 'full',
  PROFILE: 'profile',
  TRAINING: 'training',
  NUTRITION: 'nutrition',
  SETTINGS: 'settings',
});

/** How an import treats what is already there. */
export const IMPORT_MODE = Object.freeze({
  /** Incoming records are added; existing ones with the same id win. */
  MERGE: 'merge',
  /** The file becomes the truth: each section it carries is overwritten. */
  REPLACE: 'replace',
});

/**
 * The sections, in the order a backup writes them.
 *
 * `groups` decides which partial exports include the section. `references`
 * describes where a section points at something outside itself, so integrity
 * can be checked without any part of the engine knowing what a session looks
 * like. Each entry gives a `collect` that pulls the ids out of one record,
 * and the catalogue they must exist in.
 */
export const SECTIONS = Object.freeze({
  profile: {
    model: Profile,
    kind: 'document',
    groups: [BACKUP_SCOPE.PROFILE],
    label: 'Profile',
  },

  settings: {
    model: Settings,
    kind: 'document',
    groups: [BACKUP_SCOPE.SETTINGS],
    label: 'Settings',
    references: [
      { field: 'excludedFoods', catalogue: 'food', severity: 'warning',
        collect: (record) => record?.excludedFoods ?? [] },
      { field: 'excludedExercises', catalogue: 'exercise', severity: 'warning',
        collect: (record) => record?.excludedExercises ?? [] },
    ],
  },

  goals: {
    model: Goals,
    kind: 'collection',
    groups: [BACKUP_SCOPE.PROFILE],
    label: 'Goals',
  },

  schedule: {
    model: Schedule,
    kind: 'collection',
    groups: [BACKUP_SCOPE.TRAINING],
    label: 'Schedule',
  },

  measurements: {
    model: BodyMeasurements,
    kind: 'collection',
    groups: [BACKUP_SCOPE.PROFILE],
    label: 'Body measurements',
  },

  runs: {
    model: Running,
    kind: 'collection',
    groups: [BACKUP_SCOPE.TRAINING],
    label: 'Runs',
  },

  workouts: {
    model: Gym,
    kind: 'collection',
    groups: [BACKUP_SCOPE.TRAINING],
    label: 'Logged sets',
  },

  nutrition: {
    model: Nutrition,
    kind: 'collection',
    groups: [BACKUP_SCOPE.NUTRITION],
    label: 'Nutrition',
  },

  supplements: {
    model: Supplements,
    kind: 'collection',
    groups: [BACKUP_SCOPE.NUTRITION],
    label: 'Supplements',
  },

  weeklyReports: {
    model: WeeklyReport,
    kind: 'collection',
    groups: [BACKUP_SCOPE.TRAINING],
    label: 'Weekly reports',
  },

  sessions: {
    model: WorkoutSession,
    kind: 'collection',
    groups: [BACKUP_SCOPE.TRAINING],
    label: 'Sessions',
    references: [
      { field: 'exercises[].exerciseId', catalogue: 'exercise', severity: 'warning',
        collect: (record) => (record?.exercises ?? []).map((entry) => entry?.exerciseId) },
      { field: 'records[].exerciseId', catalogue: 'exercise', severity: 'warning',
        collect: (record) => (record?.records ?? []).map((entry) => entry?.exerciseId) },
    ],
  },

  notifications: {
    model: Notification,
    kind: 'collection',
    groups: [BACKUP_SCOPE.SETTINGS],
    label: 'Notifications',
  },

  planSnapshots: {
    model: PlanSnapshot,
    kind: 'collection',
    groups: [BACKUP_SCOPE.TRAINING],
    label: 'Plan snapshots',
  },
});

/** Section names, in backup order. */
export const SECTION_NAMES = Object.freeze(Object.keys(SECTIONS));

/**
 * Which sections a scope covers.
 * `full` is every section; anything else is the sections listing that group.
 *
 * @param {string|string[]} scope one scope, or several
 * @returns {string[]} section names
 */
export function sectionsFor(scope = BACKUP_SCOPE.FULL) {
  const wanted = (Array.isArray(scope) ? scope : [scope]).filter(Boolean);

  if (!wanted.length || wanted.includes(BACKUP_SCOPE.FULL)) return [...SECTION_NAMES];

  /* A scope naming a section directly is honoured too — "just the runs" is a
     reasonable thing to ask for and needs no group of its own. */
  return SECTION_NAMES.filter((name) =>
    wanted.some((item) => item === name || SECTIONS[name].groups.includes(item)));
}

/** The declared fields of a section's model, for spotting unknown ones. */
export function fieldsOf(section) {
  const model = SECTIONS[section]?.model;
  if (!model) return [];

  /* id and the timestamps are added by the model factory rather than
     declared in the schema, so they are known fields that the schema does
     not list. Treating them as unknown would flag every record ever saved. */
  return [...Object.keys(model.schema.fields), 'id', 'createdAt', 'updatedAt'];
}
