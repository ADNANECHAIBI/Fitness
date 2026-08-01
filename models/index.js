/**
 * models/index.js — barrel export.
 * A model declares shape and rules. It never reads storage and never emits
 * events — that is the repository's job.
 */

export { createModel, makeId, today } from './base-model.js';

export { Profile, ProfileSchema, SEX, ACTIVITY, GOAL, WEEKDAYS } from './profile.js';
export { BodyMeasurements, BodyMeasurementsSchema } from './body-measurements.js';
export { Running, RunningSchema, DIFFICULTY } from './running.js';
export { Gym, GymSchema, MUSCLES } from './gym.js';
export { Nutrition, NutritionSchema } from './nutrition.js';
export { Supplements, SupplementsSchema, TIMING } from './supplements.js';
export { Schedule, ScheduleSchema, SESSION_TYPE } from './schedule.js';
export { Goals, GoalsSchema, METRIC, STATUS } from './goals.js';
export { Settings, SettingsSchema, WEIGHT_UNIT, DISTANCE_UNIT, THEME_MODE } from './settings.js';
export { WeeklyReport, WeeklyReportSchema } from './weekly-report.js';
export { WorkoutSession, WorkoutSessionSchema } from './workout-session.js';
export { Notification, NotificationSchema } from './notification.js';
export { PlanSnapshot, PlanSnapshotSchema } from './plan-snapshot.js';
