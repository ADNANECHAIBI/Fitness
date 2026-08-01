/**
 * food-schema.js — the shape of one food record.
 *
 * ── On the numbers ────────────────────────────────────────────────────────
 * Macros are per 100 g of the edible portion, taken from standard food
 * composition reference values (USDA FoodData Central and equivalents). They
 * are reference figures, not measurements of the specific item you bought:
 * a chicken breast varies by a few percent, and a "medium" anything varies by
 * more. Good enough to plan with, not precise enough to argue over.
 *
 * Prices are ESTIMATES in Moroccan dirham per kilo, and they are the least
 * reliable field in this file. They move with season, city and souk versus
 * supermarket. Every record carries `priceConfidence` and `priceUpdated` so
 * the app can be honest about it — and so you can correct them in one place.
 */

import { defineSchema, rules } from '../validators/index.js';
import { createModel } from '../models/base-model.js';
import { FOOD_GROUP, MEAL_TYPE, AVAILABILITY, valuesOf } from './taxonomy.js';

export const FoodSchema = defineSchema('Food', {
  id: { rule: rules.string({ min: 2, max: 60 }), required: true, label: 'Id' },
  name: { rule: rules.string({ min: 2, max: 80 }), required: true, label: 'Name' },
  group: { rule: rules.oneOf(valuesOf(FOOD_GROUP)), required: true, label: 'Group' },

  /* Per 100 g, edible portion. */
  calories: { rule: rules.number({ min: 0, max: 950 }), required: true, label: 'Calories' },
  proteinG: { rule: rules.number({ min: 0, max: 100 }), required: true, label: 'Protein' },
  carbsG: { rule: rules.number({ min: 0, max: 100 }), required: true, label: 'Carbs' },
  fatG: { rule: rules.number({ min: 0, max: 100 }), required: true, label: 'Fat' },
  fiberG: { rule: rules.number({ min: 0, max: 80 }), default: 0, label: 'Fibre' },

  /** Rough retail price, dirham per kilogram. See the note above. */
  priceMadPerKg: { rule: rules.number({ min: 0, max: 5000 }), label: 'Price' },
  priceConfidence: { rule: rules.oneOf(['estimate', 'checked']), default: 'estimate', label: 'Price confidence' },
  priceUpdated: { rule: rules.isoDate(), label: 'Price updated' },

  availability: { rule: rules.oneOf(valuesOf(AVAILABILITY)), default: 'common', label: 'Availability' },
  moroccan: { rule: rules.boolean(), default: true, label: 'Moroccan staple' },
  vegetarian: { rule: rules.boolean(), default: false, label: 'Vegetarian' },
  vegan: { rule: rules.boolean(), default: false, label: 'Vegan' },

  mealTypes: { rule: rules.list(rules.oneOf(valuesOf(MEAL_TYPE)), { max: 6 }), default: () => [], label: 'Meal types' },

  /** Minutes of preparation. Zero means it is eaten as it is. */
  cookingMin: { rule: rules.number({ min: 0, max: 240, integer: true }), default: 0, label: 'Cooking time' },

  /** A typical portion in grams — for turning macros into something real. */
  servingG: { rule: rules.number({ min: 1, max: 1000 }), default: 100, label: 'Serving' },
  servingLabel: { rule: rules.string({ max: 60 }), label: 'Serving label' },

  tags: { rule: rules.list(rules.string({ max: 40 }), { max: 10 }), default: () => [], label: 'Tags' },
});

export const Food = createModel(FoodSchema, { idPrefix: 'food', timestamps: false });

/**
 * Compact record builder. Records are written with short macro keys so a file
 * of fifty foods stays readable; this expands them.
 */
export function food({ p = 0, c = 0, f = 0, fiber = 0, kcal, price = null, ...rest }) {
  return {
    calories: kcal,
    proteinG: p,
    carbsG: c,
    fatG: f,
    fiberG: fiber,
    priceMadPerKg: price,
    priceConfidence: 'estimate',
    priceUpdated: null,
    availability: 'common',
    moroccan: true,
    vegetarian: false,
    vegan: false,
    mealTypes: [],
    cookingMin: 0,
    servingG: 100,
    servingLabel: null,
    tags: [],
    ...rest,
  };
}
