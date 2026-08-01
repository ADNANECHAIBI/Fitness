/**
 * Profile — who the athlete is. One record per app (a document, not a list).
 * Bounds are physical limits, not opinions: they reject nonsense only.
 */

import { defineSchema, rules } from '../validators/index.js';
import { EXPERIENCE } from '../engines/constants.js';
import { createModel, today } from './base-model.js';

export const SEX = ['male', 'female'];
export const ACTIVITY = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
/**
 * The original four are kept so stored profiles stay valid; the nutrition
 * phase added the longer names. GOAL_ALIASES in constants.js maps old to new.
 */
export const GOAL = [
  'bulk', 'cut', 'recomp', 'maintain',
  'lean_bulk', 'maintenance', 'recomposition', 'fat_loss', 'aggressive_cut',
];
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const LEVELS = Object.values(EXPERIENCE);

export const ProfileSchema = defineSchema('Profile', {
  name:          { rule: rules.string({ max: 60 }), label: 'Name' },
  age:           { rule: rules.number({ min: 10, max: 100, integer: true }), required: true, label: 'Age', unit: 'years' },
  sex:           { rule: rules.oneOf(SEX), required: true, label: 'Sex', options: SEX },
  heightCm:      { rule: rules.number({ min: 100, max: 250, unit: 'cm' }), required: true, label: 'Height', unit: 'cm' },
  weightKg:      { rule: rules.number({ min: 25, max: 300, unit: 'kg' }), required: true, label: 'Weight', unit: 'kg' },
  goalWeightKg:  { rule: rules.number({ min: 25, max: 300, unit: 'kg' }), label: 'Goal weight', unit: 'kg' },
  // Set once, at onboarding. Never updated — progress is measured from it.
  startWeightKg: { rule: rules.number({ min: 25, max: 300, unit: 'kg' }), label: 'Starting weight', unit: 'kg' },
  activityLevel: { rule: rules.oneOf(ACTIVITY), default: 'moderate', label: 'Activity level', options: ACTIVITY },
  /** Training age, not athleticism. It caps exercise difficulty and volume. */
  experienceLevel: { rule: rules.oneOf(LEVELS), default: 'beginner', label: 'Experience', options: LEVELS },
  goal:          { rule: rules.oneOf(GOAL), default: 'bulk', label: 'Goal', options: GOAL },
  startDate:     { rule: rules.isoDate(), default: today, label: 'Start date' },
  trainingDays:  { rule: rules.number({ min: 1, max: 7, integer: true }), default: 4, label: 'Training days per week' },
  availableDays: { rule: rules.list(rules.oneOf(WEEKDAYS), { max: 7 }), default: () => [], label: 'Available days', options: WEEKDAYS },
  sessionStart:  { rule: rules.string({ min: 4, max: 5 }), default: '18:00', label: 'Session start' },
  sessionEnd:    { rule: rules.string({ min: 4, max: 5 }), default: '19:30', label: 'Session end' },
});

export const Profile = createModel(ProfileSchema, { idPrefix: 'profile' });
