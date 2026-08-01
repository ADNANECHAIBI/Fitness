/**
 * OnboardingRepository — the wizard's draft answers.
 *
 * Kept apart from Profile so a half-finished wizard never writes an
 * incomplete profile. Every field is optional; the wizard validates each
 * answer before it lands here, and the draft is deleted once the profile is
 * created.
 */

import { createDocumentRepository } from './base-repository.js';
import { createModel } from '../models/base-model.js';
import { defineSchema, rules } from '../validators/index.js';
import { KEYS } from '../scripts/config.js';
import { SEX, ACTIVITY, GOAL, WEEKDAYS } from '../models/profile.js';

const OnboardingSchema = defineSchema('OnboardingDraft', {
  step:          { rule: rules.number({ min: 0, max: 50, integer: true }), default: 0 },
  weightKg:      { rule: rules.number({ min: 25, max: 300 }) },
  heightCm:      { rule: rules.number({ min: 100, max: 250 }) },
  age:           { rule: rules.number({ min: 10, max: 100, integer: true }) },
  sex:           { rule: rules.oneOf(SEX) },
  goal:          { rule: rules.oneOf(GOAL) },
  goalWeightKg:  { rule: rules.number({ min: 25, max: 300 }) },
  activityLevel: { rule: rules.oneOf(ACTIVITY) },
  trainingDays:  { rule: rules.number({ min: 1, max: 7, integer: true }) },
  availableDays: { rule: rules.list(rules.oneOf(WEEKDAYS), { max: 7 }) },
  sessionStart:  { rule: rules.string({ min: 4, max: 5 }) },
  sessionEnd:    { rule: rules.string({ min: 4, max: 5 }) },
  sleepHours:    { rule: rules.number({ min: 3, max: 14 }) },
  appetite:      { rule: rules.oneOf(['low', 'normal', 'high']) },
  budgetLevel:   { rule: rules.oneOf(['low', 'medium', 'high']) },
  injuries:      { rule: rules.string({ max: 400 }) },
  runsPerWeek:   { rule: rules.number({ min: 0, max: 14, integer: true }) },
});

export const OnboardingDraft = createModel(OnboardingSchema, { idPrefix: 'draft' });

export const OnboardingRepository = createDocumentRepository({
  key: KEYS.ONBOARDING,
  model: OnboardingDraft,
});
