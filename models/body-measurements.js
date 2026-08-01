/**
 * BodyMeasurements — one record per measuring session. All values in cm.
 * Every field is optional: a session may cover only some sites.
 */

import { defineSchema, rules } from '../validators/index.js';
import { createModel, today } from './base-model.js';

const cm = (min, max) => rules.number({ min, max, unit: 'cm' });

export const BodyMeasurementsSchema = defineSchema('BodyMeasurements', {
  date:     { rule: rules.isoDate(), required: true, default: today, label: 'Date' },
  chestCm:    { rule: cm(50, 200), label: 'Chest', unit: 'cm' },
  shoulderCm: { rule: cm(60, 200), label: 'Shoulder', unit: 'cm' },
  armCm:      { rule: cm(15, 80),  label: 'Arm', unit: 'cm' },
  waistCm:    { rule: cm(40, 200), label: 'Waist', unit: 'cm' },
  thighCm:    { rule: cm(30, 120), label: 'Thigh', unit: 'cm' },
  calfCm:     { rule: cm(20, 80),  label: 'Calf', unit: 'cm' },
  neckCm:     { rule: cm(25, 70),  label: 'Neck', unit: 'cm' },
  notes:      { rule: rules.string({ max: 400 }), label: 'Notes' },
});

export const BodyMeasurements = createModel(BodyMeasurementsSchema, { idPrefix: 'body' });
