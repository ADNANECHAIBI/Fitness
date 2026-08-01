/**
 * Settings — app preferences. A document, not a list.
 * The theme and the language live here too, so a restore brings appearance
 * and the interface language back with the data.
 */

import { defineSchema, rules } from '../validators/index.js';
import { createModel } from './base-model.js';
import { EQUIPMENT, MOVEMENT } from '../data/taxonomy.js';

export const WEIGHT_UNIT = ['kg', 'lb'];
export const DISTANCE_UNIT = ['km', 'mi'];
export const THEME_MODE = ['system', 'dark', 'light'];

/**
 * Interface languages. Kept as a literal, like THEME_MODE: the schema is a
 * contract about what may be stored, and it must not change shape because
 * something registered a language at run time.
 */
export const LANGUAGE = ['en', 'ar'];

export const SettingsSchema = defineSchema('Settings', {
  weightUnit:   { rule: rules.oneOf(WEIGHT_UNIT), default: 'kg', label: 'Weight unit', options: WEIGHT_UNIT },
  distanceUnit: { rule: rules.oneOf(DISTANCE_UNIT), default: 'km', label: 'Distance unit', options: DISTANCE_UNIT },
  theme:        { rule: rules.oneOf(THEME_MODE), default: 'system', label: 'Theme', options: THEME_MODE },
  language:     { rule: rules.oneOf(LANGUAGE), default: 'en', label: 'Language', options: LANGUAGE },
  weighInDay:   { rule: rules.oneOf(['mon','tue','wed','thu','fri','sat','sun']), default: 'sat', label: 'Weigh-in day' },
  sleepHours:   { rule: rules.number({ min: 3, max: 14 }), default: 8, label: 'Sleep', unit: 'h' },
  appetite:     { rule: rules.oneOf(['low', 'normal', 'high']), default: 'normal', label: 'Appetite' },
  budgetLevel:  { rule: rules.oneOf(['low', 'medium', 'high']), default: 'medium', label: 'Budget' },

  /**
   * An explicit food budget in dirham. Optional: without it the meal engine
   * falls back to a figure for the stated budget level, and says so.
   */
  budgetMadPerDay:   { rule: rules.number({ min: 0, max: 2000 }), label: 'Budget per day' },
  budgetMadPerMonth: { rule: rules.number({ min: 0, max: 60000 }), label: 'Budget per month' },

  /** Minutes available for cooking on a normal day. */
  cookingMinutesPerDay: { rule: rules.number({ min: 0, max: 300, integer: true }), label: 'Cooking time' },

  /** Food ids the person will not eat. */
  excludedFoods: { rule: rules.list(rules.string({ max: 60 }), { max: 100 }), default: () => [], label: 'Excluded foods' },

  /** Diet constraints the meal engine must respect. */
  vegetarian: { rule: rules.boolean(), default: false, label: 'Vegetarian' },
  vegan:      { rule: rules.boolean(), default: false, label: 'Vegan' },
  injuries:     { rule: rules.string({ max: 400 }), default: '', label: 'Injuries' },

  /**
   * What is actually available to train with. Empty means "not stated" — the
   * workout engine then assumes a standard gym and says so in its reasons.
   */
  availableEquipment: {
    rule: rules.list(rules.oneOf(Object.values(EQUIPMENT)), { max: 20 }),
    default: () => [], label: 'Available equipment',
  },

  /** Movement patterns to leave out entirely, e.g. after an injury. */
  restrictedMovements: {
    rule: rules.list(rules.oneOf(Object.values(MOVEMENT)), { max: 14 }),
    default: () => [], label: 'Restricted movements',
  },

  /** Specific exercise ids the person cannot or will not do. */
  excludedExercises: {
    rule: rules.list(rules.string({ max: 60 }), { max: 50 }),
    default: () => [], label: 'Excluded exercises',
  },

  /** Corrective tags to work on, e.g. 'rounded-shoulders'. */
  correctiveNeeds: {
    rule: rules.list(rules.string({ max: 40 }), { max: 8 }),
    default: () => [], label: 'Corrective needs',
  },
  onboarded:    { rule: rules.boolean(), default: false, label: 'Onboarding complete' },
});

export const Settings = createModel(SettingsSchema, { idPrefix: 'settings' });
