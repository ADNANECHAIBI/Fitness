/**
 * FoodDB — the query surface over the food records.
 *
 * This is the contract a future Nutrition Engine will use. It asks for
 * properties — "cheap protein I can eat without cooking" — and the database
 * answers. The engine never needs to know that the answer is a tin of sardines.
 *
 * Pure and synchronous. No storage, no events, no DOM.
 */

import { Food } from '../food-schema.js';
import { proteinFoods } from './proteins.js';
import { stapleFoods } from './staples.js';
import { dairyFatFoods } from './dairy-fats.js';
import { produceFoods } from './produce.js';

const RECORDS = [...proteinFoods, ...stapleFoods, ...dairyFatFoods, ...produceFoods];
const BY_ID = new Map(RECORDS.map((record) => [record.id, record]));

const asList = (value) => (Array.isArray(value) ? value : [value]);

export const FoodDB = Object.freeze({
  all() { return RECORDS; },
  byId(id) { return BY_ID.get(id) ?? null; },
  has(id) { return BY_ID.has(id); },
  count() { return RECORDS.length; },

  /**
   * @param {object} [criteria] every field optional
   * @param {string|string[]} [criteria.group]
   * @param {string|string[]} [criteria.mealType]
   * @param {string|string[]} [criteria.availability]
   * @param {string|string[]} [criteria.tags]
   * @param {boolean} [criteria.moroccan]
   * @param {boolean} [criteria.vegetarian]
   * @param {boolean} [criteria.vegan]
   * @param {number} [criteria.maxCookingMin]
   * @param {number} [criteria.maxPriceMadPerKg]
   * @param {number} [criteria.minProteinG]      per 100 g
   * @param {number} [criteria.maxCalories]      per 100 g
   * @param {string[]} [criteria.exclude]
   * @returns {object[]}
   */
  query(criteria = {}) {
    const {
      group, mealType, availability, tags, moroccan, vegetarian, vegan,
      maxCookingMin, maxPriceMadPerKg, minProteinG, maxCalories, exclude = [],
    } = criteria;

    return RECORDS.filter((food) => {
      if (exclude.includes(food.id)) return false;
      if (group !== undefined && !asList(group).includes(food.group)) return false;
      if (availability !== undefined && !asList(availability).includes(food.availability)) return false;
      if (mealType !== undefined && !asList(mealType).some((m) => food.mealTypes.includes(m))) return false;
      if (tags !== undefined && !asList(tags).some((t) => food.tags.includes(t))) return false;

      if (moroccan !== undefined && food.moroccan !== moroccan) return false;
      if (vegetarian === true && !food.vegetarian) return false;
      if (vegan === true && !food.vegan) return false;

      if (maxCookingMin !== undefined && food.cookingMin > maxCookingMin) return false;
      if (minProteinG !== undefined && food.proteinG < minProteinG) return false;
      if (maxCalories !== undefined && food.calories > maxCalories) return false;

      if (maxPriceMadPerKg !== undefined) {
        // A food with no price on record cannot be shown to be within budget.
        if (food.priceMadPerKg === null || food.priceMadPerKg > maxPriceMadPerKg) return false;
      }

      return true;
    });
  },

  find(criteria = {}) { return this.query(criteria)[0] ?? null; },

  /**
   * Macros for a real portion.
   * @param {string} id
   * @param {number} [grams] defaults to the record's typical serving
   * @returns {{grams, calories, proteinG, carbsG, fatG, fiberG, priceMad}|null}
   */
  portion(id, grams = null) {
    const food = this.byId(id);
    if (!food) return null;

    const weight = grams ?? food.servingG;
    if (!Number.isFinite(weight) || weight <= 0) return null;

    const scale = weight / 100;
    const round1 = (n) => Math.round(n * 10) / 10;

    return {
      id: food.id,
      name: food.name,
      grams: weight,
      calories: Math.round(food.calories * scale),
      proteinG: round1(food.proteinG * scale),
      carbsG: round1(food.carbsG * scale),
      fatG: round1(food.fatG * scale),
      fiberG: round1(food.fiberG * scale),
      priceMad: food.priceMadPerKg === null
        ? null
        : round1((food.priceMadPerKg * weight) / 1000),
      priceConfidence: food.priceConfidence,
    };
  },

  /**
   * Cost of protein, in dirham per 100 g of protein — the number that actually
   * matters on a budget. Foods with no protein or no price are excluded.
   * @returns {{id, name, madPer100gProtein}[]} cheapest first
   */
  proteinValue(criteria = {}) {
    return this.query(criteria)
      .filter((food) => food.proteinG > 0 && food.priceMadPerKg !== null)
      .map((food) => ({
        id: food.id,
        name: food.name,
        proteinG: food.proteinG,
        priceMadPerKg: food.priceMadPerKg,
        // dirham per kg ÷ grams of protein per kg, scaled to 100 g of protein
        madPer100gProtein: Math.round(
          ((food.priceMadPerKg / (food.proteinG * 10)) * 100) * 100
        ) / 100,
      }))
      .sort((a, b) => a.madPer100gProtein - b.madPer100gProtein);
  },

  /** Which values appear in the data, for building a filter UI. */
  facets() {
    const collect = (get) => [...new Set(RECORDS.flatMap(get))].sort();
    return {
      group: collect((f) => [f.group]),
      mealTypes: collect((f) => f.mealTypes),
      availability: collect((f) => [f.availability]),
      tags: collect((f) => f.tags),
    };
  },

  /**
   * How much of the price data has actually been checked against a shop.
   * Everything ships as an estimate; this is how the app stays honest about it.
   */
  priceReliability() {
    const withPrice = RECORDS.filter((f) => f.priceMadPerKg !== null);
    const checked = withPrice.filter((f) => f.priceConfidence === 'checked');
    return {
      total: RECORDS.length,
      priced: withPrice.length,
      checked: checked.length,
      estimated: withPrice.length - checked.length,
    };
  },

  /** Validate every record. Called by the test suite, not at import. */
  validateAll() {
    const errors = [];
    for (const record of RECORDS) {
      const result = Food.isValid(record);
      if (!result.valid) errors.push({ id: record.id, fields: result.errors });
    }
    return { valid: errors.length === 0, errors };
  },
});
