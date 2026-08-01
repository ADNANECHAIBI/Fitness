/** Tests for the food database. */

import { describe, it, expect } from './runner.js';
import { FoodDB } from '../data/foods/index.js';
import { FOOD_GROUP, MEAL_TYPE } from '../data/taxonomy.js';

describe('FoodDB — integrity', () => {
  it('holds records', () => {
    expect(FoodDB.count()).toBeGreaterThan(40);
  });

  it('validates every record against the schema', () => {
    const result = FoodDB.validateAll();
    expect(result.valid, `invalid: ${JSON.stringify(result.errors)}`).toBeTruthy();
  });

  it('has no duplicate ids', () => {
    const ids = FoodDB.all().map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps macros roughly consistent with the calorie figure', () => {
    // Atwater factors, with fibre counted at 2 kcal/g rather than 4 — treating
    // fibre as ordinary carbohydrate over-counts every plant food.
    // Reference tables use food-specific factors, so a small gap remains:
    // allowed up to 15%, or 8 kcal for foods too light for a percentage to
    // mean anything.
    const off = FoodDB.all().filter((food) => {
      if (food.calories < 30) return false;

      const digestibleCarbs = Math.max(0, food.carbsG - food.fiberG);
      const fromMacros =
        food.proteinG * 4 + digestibleCarbs * 4 + food.fiberG * 2 + food.fatG * 9;

      const gap = Math.abs(fromMacros - food.calories);
      return gap > 8 && gap / food.calories > 0.15;
    });

    expect(off.length, `inconsistent: ${off.map((f) => `${f.id}`)}`).toBe(0);
  });

  it('marks every food as vegetarian if it is vegan', () => {
    const wrong = FoodDB.all().filter((f) => f.vegan && !f.vegetarian);
    expect(wrong.length).toBe(0);
  });

  it('labels every price as an estimate until someone checks it', () => {
    const reliability = FoodDB.priceReliability();
    expect(reliability.priced).toBe(FoodDB.count());
    expect(reliability.checked + reliability.estimated).toBe(reliability.priced);
  });
});

describe('FoodDB — query', () => {
  it('finds cheap protein under a budget', () => {
    const cheap = FoodDB.query({ minProteinG: 15, maxPriceMadPerKg: 30 });
    expect(cheap.length).toBeGreaterThan(2);
    expect(cheap.every((f) => f.proteinG >= 15 && f.priceMadPerKg <= 30)).toBeTruthy();
  });

  it('finds food that needs no cooking', () => {
    const noCook = FoodDB.query({ maxCookingMin: 0 });
    expect(noCook.every((f) => f.cookingMin === 0)).toBeTruthy();
    expect(noCook.some((f) => f.id === 'canned-sardine')).toBeTruthy();
  });

  it('filters by meal', () => {
    const breakfast = FoodDB.query({ mealType: MEAL_TYPE.BREAKFAST });
    expect(breakfast.every((f) => f.mealTypes.includes(MEAL_TYPE.BREAKFAST))).toBeTruthy();
  });

  it('filters by diet', () => {
    const vegan = FoodDB.query({ vegan: true });
    expect(vegan.every((f) => f.vegan && f.vegetarian)).toBeTruthy();
    expect(vegan.some((f) => f.group === FOOD_GROUP.PROTEIN && f.id === 'egg')).toBeFalsy();
  });

  it('excludes unpriced foods from a budget query rather than guessing', () => {
    const cheap = FoodDB.query({ maxPriceMadPerKg: 10 });
    expect(cheap.every((f) => f.priceMadPerKg !== null)).toBeTruthy();
  });

  it('returns an empty list rather than throwing', () => {
    expect(FoodDB.query({ group: 'nonsense' })).toEqual([]);
    expect(FoodDB.query({ minProteinG: 999 })).toEqual([]);
  });
});

describe('FoodDB — portions and value', () => {
  it('scales macros to a real portion', () => {
    const three = FoodDB.portion('egg', 165);
    expect(three.grams).toBe(165);
    expect(three.calories).toBe(236);
    expect(three.proteinG).toBeCloseTo(20.8, 1);
  });

  it('defaults to the record serving', () => {
    const one = FoodDB.portion('egg');
    expect(one.grams).toBe(FoodDB.byId('egg').servingG);
  });

  it('refuses a nonsensical portion', () => {
    expect(FoodDB.portion('egg', 0)).toBeNull();
    expect(FoodDB.portion('egg', -50)).toBeNull();
    expect(FoodDB.portion('does-not-exist')).toBeNull();
  });

  it('ranks foods by the cost of their protein', () => {
    const ranked = FoodDB.proteinValue({ minProteinG: 10 });
    expect(ranked.length).toBeGreaterThan(5);

    // Sorted cheapest first.
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i].madPer100gProtein).toBeGreaterThan(ranked[i - 1].madPer100gProtein - 0.001);
    }

    // Sanity: lentils at 18 MAD/kg and 24.6 g protein ≈ 7.3 MAD per 100 g protein.
    const lentils = ranked.find((f) => f.id === 'lentils');
    expect(lentils.madPer100gProtein).toBeCloseTo(7.32, 1);
  });

  it('leaves out foods with no protein or no price', () => {
    const ranked = FoodDB.proteinValue();
    expect(ranked.every((f) => f.proteinG > 0)).toBeTruthy();
    expect(ranked.some((f) => f.id === 'olive-oil')).toBeFalsy();
  });
});

describe('FoodDB — coverage a nutrition engine would need', () => {
  const needed = [
    ['breakfast options', { mealType: MEAL_TYPE.BREAKFAST }],
    ['post-workout options', { mealType: MEAL_TYPE.POST_WORKOUT }],
    ['Moroccan staples', { moroccan: true }],
    ['vegetarian protein', { vegetarian: true, minProteinG: 10 }],
    ['fast food under 10 minutes', { maxCookingMin: 10 }],
  ];

  for (const [name, criteria] of needed) {
    it(`can supply ${name}`, () => {
      expect(FoodDB.query(criteria).length).toBeGreaterThan(0);
    });
  }
});
