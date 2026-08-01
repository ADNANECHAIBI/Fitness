/**
 * forms.js — what a form asks for, described once.
 *
 * The UI must not import models or validators directly, so the descriptors
 * live here: field name, label, type, unit, options and the validation rule
 * the model already declares. A form is built from a descriptor and submitted
 * through a service — the UI never writes storage.
 */

import { ProfileRepository, SettingsRepository } from '../repositories/index.js';
import { WeightService } from '../services/weight-service.js';
import { ProgressRepository } from '../repositories/index.js';
import { rules } from '../validators/index.js';
import { SEX, ACTIVITY, GOAL, WEEKDAYS, LEVELS } from '../models/profile.js';
import { EQUIPMENT } from '../data/taxonomy.js';
import { NUTRITION_GOAL } from '../engines/constants.js';

/**
 * Every field names a translation key alongside its English label. The label
 * stays because it is the fallback, and because the model's validation
 * messages are built from the model's own labels — translating those would
 * change what a rejection says, which is not this phase's business.
 */
const field = (key, label, rule, extra = {}) =>
  ({ key, label, labelKey: `ui.field.${key}`, rule, type: 'number', ...extra });
const choice = (key, label, options, extra = {}) =>
  ({ key, label, labelKey: `ui.field.${key}`, type: 'choice', options, ...extra });

/** Turn a machine value into something readable. */
const humanise = (value) => String(value).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const asOptions = (values) => values.map((value) => ({ value, label: humanise(value) }));

/* ── Descriptors ────────────────────────────────────────────────────────── */

export const FORMS = Object.freeze({
  profile: {
    id: 'profile',
    title: 'Profile',
    titleKey: 'ui.form.profile.title',
    descriptionKey: 'ui.form.profile.description',
    description: 'The numbers every target is calculated from.',
    fields: [
      field('age', 'Age', rules.number({ min: 10, max: 100, integer: true }), { unit: 'years' }),
      choice('sex', 'Sex', asOptions(SEX)),
      field('heightCm', 'Height', rules.number({ min: 100, max: 250 }), { unit: 'cm' }),
      field('weightKg', 'Weight', rules.number({ min: 25, max: 300 }), { unit: 'kg' }),
      field('goalWeightKg', 'Goal weight', rules.number({ min: 25, max: 300 }), { unit: 'kg', optional: true }),
      choice('experienceLevel', 'Training experience', asOptions(LEVELS)),
      choice('activityLevel', 'Daily activity', asOptions(ACTIVITY)),
    ],
    load: () => ProfileRepository.get() ?? ProfileRepository.defaults(),
    submit: (values) => ProfileRepository.patch(values),
  },

  goals: {
    id: 'goals',
    title: 'Goal',
    titleKey: 'ui.form.goals.title',
    descriptionKey: 'ui.form.goals.description',
    description: 'What the training and the food are aimed at.',
    fields: [
      choice('goal', 'Goal', asOptions(Object.values(NUTRITION_GOAL))),
      field('goalWeightKg', 'Goal weight', rules.number({ min: 25, max: 300 }), { unit: 'kg', optional: true }),
      field('trainingDays', 'Training days per week', rules.number({ min: 1, max: 7, integer: true })),
    ],
    load: () => ProfileRepository.get() ?? ProfileRepository.defaults(),
    submit: (values) => ProfileRepository.patch(values),
  },

  weight: {
    id: 'weight',
    title: 'Log weight',
    titleKey: 'ui.form.weight.title',
    descriptionKey: 'ui.form.weight.description',
    description: 'Weigh yourself at the same time of day, before eating.',
    fields: [
      field('weightKg', 'Weight', rules.number({ min: 25, max: 300 }), { unit: 'kg' }),
    ],
    load: () => ({ weightKg: WeightService.current() ?? '' }),
    submit: (values) => WeightService.log(values.weightKg),
  },

  measurements: {
    id: 'measurements',
    title: 'Measurements',
    titleKey: 'ui.form.measurements.title',
    descriptionKey: 'ui.form.measurements.description',
    description: 'Every field is optional — record what you measured.',
    fields: [
      field('chestCm', 'Chest', rules.number({ min: 50, max: 200 }), { unit: 'cm', optional: true }),
      field('shoulderCm', 'Shoulder', rules.number({ min: 60, max: 200 }), { unit: 'cm', optional: true }),
      field('armCm', 'Arm', rules.number({ min: 15, max: 80 }), { unit: 'cm', optional: true }),
      field('waistCm', 'Waist', rules.number({ min: 40, max: 200 }), { unit: 'cm', optional: true }),
      field('thighCm', 'Thigh', rules.number({ min: 30, max: 120 }), { unit: 'cm', optional: true }),
      field('calfCm', 'Calf', rules.number({ min: 20, max: 80 }), { unit: 'cm', optional: true }),
      field('neckCm', 'Neck', rules.number({ min: 25, max: 70 }), { unit: 'cm', optional: true }),
    ],
    load: () => ProgressRepository.latestMeasurement() ?? {},
    submit: (values) => ProgressRepository.measurements.create(values),
  },

  budget: {
    id: 'budget',
    title: 'Budget',
    titleKey: 'ui.form.budget.title',
    descriptionKey: 'ui.form.budget.description',
    description: 'What the meal planner has to work within.',
    fields: [
      choice('budgetLevel', 'Budget level', asOptions(['low', 'medium', 'high'])),
      field('budgetMadPerMonth', 'Monthly food budget', rules.number({ min: 0, max: 60000 }), { unit: 'MAD', optional: true }),
      field('cookingMinutesPerDay', 'Cooking time per day', rules.number({ min: 0, max: 300, integer: true }), { unit: 'min', optional: true }),
    ],
    load: () => SettingsRepository.get() ?? SettingsRepository.defaults(),
    submit: (values) => SettingsRepository.patch(values),
  },

  preferences: {
    id: 'preferences',
    title: 'Preferences',
    titleKey: 'ui.form.preferences.title',
    descriptionKey: 'ui.form.preferences.description',
    description: 'What you eat, and what the plan should avoid.',
    fields: [
      choice('appetite', 'Appetite', asOptions(['low', 'normal', 'high'])),
      field('sleepHours', 'Sleep', rules.number({ min: 3, max: 14 }), { unit: 'hours' }),
      choice('vegetarian', 'Vegetarian', [{ value: false, label: 'No' }, { value: true, label: 'Yes' }]),
      choice('vegan', 'Vegan', [{ value: false, label: 'No' }, { value: true, label: 'Yes' }]),
    ],
    load: () => SettingsRepository.get() ?? SettingsRepository.defaults(),
    submit: (values) => SettingsRepository.patch(values),
  },

  availability: {
    id: 'availability',
    title: 'Schedule',
    titleKey: 'ui.form.availability.title',
    descriptionKey: 'ui.form.availability.description',
    description: 'Which days you can train, and for how long.',
    fields: [
      { key: 'availableDays', label: 'Training days', labelKey: 'ui.field.availableDays', type: 'choice', multiple: true, options: asOptions(WEEKDAYS) },
      { key: 'sessionStart', label: 'Session starts', labelKey: 'ui.field.sessionStart', type: 'time', rule: rules.string({ min: 4, max: 5 }) },
      { key: 'sessionEnd', label: 'Session ends', labelKey: 'ui.field.sessionEnd', type: 'time', rule: rules.string({ min: 4, max: 5 }) },
    ],
    load: () => ProfileRepository.get() ?? ProfileRepository.defaults(),
    submit: (values) => ProfileRepository.patch(values),
  },

  equipment: {
    id: 'equipment',
    title: 'Equipment',
    titleKey: 'ui.form.equipment.title',
    descriptionKey: 'ui.form.equipment.description',
    description: 'Leave empty and a standard gym is assumed.',
    fields: [
      { key: 'availableEquipment', label: 'Available equipment', labelKey: 'ui.field.availableEquipment', type: 'choice', multiple: true, options: asOptions(Object.values(EQUIPMENT)) },
    ],
    load: () => SettingsRepository.get() ?? SettingsRepository.defaults(),
    submit: (values) => SettingsRepository.patch(values),
  },
});

export const Forms = Object.freeze({
  /** A descriptor by id. @returns {object|null} */
  get(id) { return FORMS[id] ?? null; },

  /** Every descriptor. */
  all() { return Object.values(FORMS); },

  /** Current values for a form. */
  values(id) {
    const form = FORMS[id];
    return form ? form.load() : {};
  },

  /**
   * Save a form. Validation happens in the model, through the repository —
   * this only routes the values there.
   *
   * @returns {{ok: boolean, error: object|null, saved: object|null}}
   */
  save(id, values) {
    const form = FORMS[id];
    if (!form) return { ok: false, error: { message: `No form called "${id}".` }, saved: null };

    try {
      return { ok: true, error: null, saved: form.submit(values) };
    } catch (error) {
      return { ok: false, error: { message: error.message, fields: error.fields ?? null }, saved: null };
    }
  },
});
