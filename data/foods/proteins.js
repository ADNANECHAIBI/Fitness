/** Protein sources. Macros per 100 g raw edible portion unless noted. */

import { food } from '../food-schema.js';
import { FOOD_GROUP as G, MEAL_TYPE as M, AVAILABILITY as A } from '../taxonomy.js';

export const proteinFoods = [
  food({ id: 'egg', name: 'Egg', group: G.PROTEIN, kcal: 143, p: 12.6, c: 0.7, f: 9.5,
    price: 26, availability: A.EVERYWHERE, vegetarian: true, cookingMin: 8, servingG: 55,
    servingLabel: '1 medium egg', mealTypes: [M.BREAKFAST, M.LUNCH, M.DINNER, M.SNACK],
    tags: ['cheap-protein', 'complete-protein', 'staple'] }),

  food({ id: 'egg-white', name: 'Egg White', group: G.PROTEIN, kcal: 52, p: 10.9, c: 0.7, f: 0.2,
    price: 26, availability: A.EVERYWHERE, vegetarian: true, cookingMin: 6, servingG: 33,
    mealTypes: [M.BREAKFAST, M.POST_WORKOUT], tags: ['lean-protein'] }),

  food({ id: 'chicken-breast', name: 'Chicken Breast', group: G.PROTEIN, kcal: 120, p: 22.5, c: 0, f: 2.6,
    price: 60, availability: A.EVERYWHERE, cookingMin: 20, servingG: 150,
    mealTypes: [M.LUNCH, M.DINNER, M.POST_WORKOUT], tags: ['lean-protein', 'staple'] }),

  food({ id: 'chicken-thigh', name: 'Chicken Thigh', group: G.PROTEIN, kcal: 145, p: 18.6, c: 0, f: 7.5,
    price: 35, availability: A.EVERYWHERE, cookingMin: 30, servingG: 150,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['cheap-protein', 'tagine'] }),

  food({ id: 'whole-chicken', name: 'Whole Chicken', group: G.PROTEIN, kcal: 167, p: 19.5, c: 0, f: 9.5,
    price: 30, availability: A.EVERYWHERE, cookingMin: 60, servingG: 200,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['cheap-protein', 'batch-cooking'] }),

  food({ id: 'sardine', name: 'Fresh Sardine', group: G.PROTEIN, kcal: 208, p: 24.6, c: 0, f: 11.5,
    price: 18, availability: A.EVERYWHERE, cookingMin: 15, servingG: 150,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['cheap-protein', 'omega-3', 'staple', 'coastal'] }),

  food({ id: 'canned-sardine', name: 'Canned Sardine in Oil (drained)', group: G.PROTEIN, kcal: 208, p: 24.6, c: 0, f: 11.5,
    price: 45, availability: A.EVERYWHERE, cookingMin: 0, servingG: 90,
    servingLabel: '1 tin, drained', mealTypes: [M.LUNCH, M.DINNER, M.SNACK],
    tags: ['no-cook', 'omega-3', 'shelf-stable'] }),

  food({ id: 'canned-tuna', name: 'Canned Tuna in Water', group: G.PROTEIN, kcal: 116, p: 25.5, c: 0, f: 0.8,
    price: 90, availability: A.EVERYWHERE, cookingMin: 0, servingG: 80,
    mealTypes: [M.LUNCH, M.SNACK, M.POST_WORKOUT], tags: ['no-cook', 'lean-protein', 'shelf-stable'] }),

  food({ id: 'mackerel', name: 'Mackerel', group: G.PROTEIN, kcal: 205, p: 19, c: 0, f: 13.9,
    price: 25, availability: A.COMMON, cookingMin: 18, servingG: 150,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['omega-3', 'cheap-protein'] }),

  food({ id: 'whiting', name: 'Whiting (merlan)', group: G.PROTEIN, kcal: 90, p: 18.3, c: 0, f: 1.3,
    price: 40, availability: A.COMMON, cookingMin: 15, servingG: 150,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['lean-protein'] }),

  food({ id: 'beef-lean', name: 'Lean Beef', group: G.PROTEIN, kcal: 176, p: 20.5, c: 0, f: 10,
    price: 100, availability: A.EVERYWHERE, cookingMin: 25, servingG: 150,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['iron', 'expensive'] }),

  food({ id: 'minced-beef', name: 'Minced Beef', group: G.PROTEIN, kcal: 217, p: 18.6, c: 0, f: 15.4,
    price: 90, availability: A.EVERYWHERE, cookingMin: 15, servingG: 150,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['versatile'] }),

  food({ id: 'beef-liver', name: 'Beef Liver', group: G.PROTEIN, kcal: 135, p: 20.4, c: 3.9, f: 3.6,
    price: 60, availability: A.COMMON, cookingMin: 12, servingG: 120,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['cheap-protein', 'iron', 'vitamin-a', 'nutrient-dense'] }),

  food({ id: 'turkey-breast', name: 'Turkey Breast', group: G.PROTEIN, kcal: 111, p: 24, c: 0, f: 1,
    price: 55, availability: A.COMMON, cookingMin: 20, servingG: 150,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['lean-protein'] }),

  food({ id: 'whey-protein', name: 'Whey Protein Powder', group: G.SUPPLEMENT, kcal: 400, p: 80, c: 8, f: 6,
    price: 350, availability: A.SPECIALTY, moroccan: false, vegetarian: true, cookingMin: 1,
    servingG: 30, servingLabel: '1 scoop', mealTypes: [M.POST_WORKOUT, M.SNACK],
    tags: ['convenient', 'expensive', 'optional'] }),

  food({ id: 'creatine', name: 'Creatine Monohydrate', group: G.SUPPLEMENT, kcal: 0, p: 0, c: 0, f: 0,
    price: 400, availability: A.SPECIALTY, moroccan: false, vegetarian: true, vegan: true,
    cookingMin: 1, servingG: 5, servingLabel: '1 teaspoon',
    mealTypes: [M.POST_WORKOUT, M.BREAKFAST], tags: ['supplement', 'evidence-backed'] }),
];
