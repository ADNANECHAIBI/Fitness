/**
 * repositories/index.js — barrel export.
 *
 * Pages and services import from here. Nothing outside this folder may import
 * scripts/storage.js — that is the rule the whole layer rests on.
 */

export { createCollectionRepository, createDocumentRepository } from './base-repository.js';

export { ProfileRepository } from './profile-repository.js';
export { SettingsRepository } from './settings-repository.js';
export { RunningRepository } from './running-repository.js';
export { WorkoutRepository } from './workout-repository.js';
export { NutritionRepository } from './nutrition-repository.js';
export { SupplementsRepository } from './supplements-repository.js';
export { ScheduleRepository } from './schedule-repository.js';
export { GoalsRepository, activeGoals } from './goals-repository.js';
export { OnboardingRepository, OnboardingDraft } from './onboarding-repository.js';
export { SessionRepository, activeSession } from './session-repository.js';
export { NotificationRepository, unreadNotifications, trimNotifications } from './notification-repository.js';
export { PlanSnapshotRepository, snapshotFor, consecutiveDeficitWeeks } from './plan-snapshot-repository.js';
export {
  ProgressRepository,
  MeasurementsRepository,
  WeeklyReportRepository,
} from './progress-repository.js';

import { ProfileRepository } from './profile-repository.js';
import { SettingsRepository } from './settings-repository.js';
import { RunningRepository } from './running-repository.js';
import { WorkoutRepository } from './workout-repository.js';
import { NutritionRepository } from './nutrition-repository.js';
import { SupplementsRepository } from './supplements-repository.js';
import { ScheduleRepository } from './schedule-repository.js';
import { GoalsRepository } from './goals-repository.js';
import { MeasurementsRepository, WeeklyReportRepository } from './progress-repository.js';
import { SessionRepository } from './session-repository.js';
import { NotificationRepository } from './notification-repository.js';
import { PlanSnapshotRepository } from './plan-snapshot-repository.js';

/**
 * Every repository, keyed by the name used in a backup file.
 * Export, import and reset iterate this — add a repository here once and all
 * three keep working.
 */
export const ALL_REPOSITORIES = Object.freeze({
  profile:       { repo: ProfileRepository,      kind: 'document' },
  settings:      { repo: SettingsRepository,     kind: 'document' },
  goals:         { repo: GoalsRepository,        kind: 'collection' },
  schedule:      { repo: ScheduleRepository,     kind: 'collection' },
  measurements:  { repo: MeasurementsRepository, kind: 'collection' },
  runs:          { repo: RunningRepository,      kind: 'collection' },
  workouts:      { repo: WorkoutRepository,      kind: 'collection' },
  nutrition:     { repo: NutritionRepository,    kind: 'collection' },
  supplements:   { repo: SupplementsRepository,  kind: 'collection' },
  weeklyReports: { repo: WeeklyReportRepository, kind: 'collection' },
  sessions:      { repo: SessionRepository,      kind: 'collection' },
  notifications: { repo: NotificationRepository, kind: 'collection' },
  planSnapshots: { repo: PlanSnapshotRepository, kind: 'collection' },
});
