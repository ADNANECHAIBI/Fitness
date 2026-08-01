/** Dairy, fats and nuts. */

import { food } from '../food-schema.js';
import { FOOD_GROUP as G, MEAL_TYPE as M, AVAILABILITY as A } from '../taxonomy.js';

const veg = { vegetarian: true };
const vegan = { vegetarian: true, vegan: true };

export const dairyFatFoods = [
  food({ id: 'whole-milk', name: 'Whole Milk', group: G.DAIRY, kcal: 61, p: 3.2, c: 4.8, f: 3.3,
    price: 9, availability: A.EVERYWHERE, ...veg, cookingMin: 0, servingG: 250,
    servingLabel: '1 glass', mealTypes: [M.BREAKFAST, M.SNACK, M.POST_WORKOUT],
    tags: ['cheap-protein', 'easy-calories', 'staple'] }),

  food({ id: 'skimmed-milk', name: 'Skimmed Milk', group: G.DAIRY, kcal: 34, p: 3.4, c: 5, f: 0.1,
    price: 9, availability: A.EVERYWHERE, ...veg, cookingMin: 0, servingG: 250,
    mealTypes: [M.BREAKFAST, M.SNACK], tags: ['lean-protein'] }),

  food({ id: 'yogurt-plain', name: 'Plain Yogurt', group: G.DAIRY, kcal: 61, p: 3.5, c: 4.7, f: 3.3,
    price: 16, availability: A.EVERYWHERE, ...veg, cookingMin: 0, servingG: 125,
    servingLabel: '1 pot', mealTypes: [M.BREAKFAST, M.SNACK], tags: ['no-cook', 'probiotic'] }),

  food({ id: 'raib', name: 'Raib (fermented milk)', group: G.DAIRY, kcal: 65, p: 3.3, c: 5, f: 3.5,
    price: 13, availability: A.EVERYWHERE, ...veg, cookingMin: 0, servingG: 200,
    mealTypes: [M.BREAKFAST, M.SNACK], tags: ['traditional', 'no-cook'] }),

  food({ id: 'lben', name: 'Lben (buttermilk)', group: G.DAIRY, kcal: 40, p: 3.3, c: 4.8, f: 0.9,
    price: 10, availability: A.EVERYWHERE, ...veg, cookingMin: 0, servingG: 250,
    mealTypes: [M.LUNCH, M.SNACK], tags: ['traditional', 'hydrating'] }),

  food({ id: 'jben', name: 'Jben (fresh cheese)', group: G.DAIRY, kcal: 98, p: 11, c: 3, f: 4.3,
    price: 45, availability: A.COMMON, ...veg, cookingMin: 0, servingG: 60,
    mealTypes: [M.BREAKFAST, M.SNACK], tags: ['traditional', 'no-cook'] }),

  food({ id: 'hard-cheese', name: 'Hard Cheese (edam / gouda)', group: G.DAIRY, kcal: 356, p: 25, c: 1.4, f: 27,
    price: 100, availability: A.COMMON, ...veg, cookingMin: 0, servingG: 30,
    mealTypes: [M.BREAKFAST, M.SNACK], tags: ['calorie-dense', 'expensive'] }),

  food({ id: 'olive-oil', name: 'Olive Oil', group: G.FAT, kcal: 884, p: 0, c: 0, f: 100,
    price: 80, availability: A.EVERYWHERE, ...vegan, cookingMin: 0, servingG: 14,
    servingLabel: '1 tablespoon', mealTypes: [M.BREAKFAST, M.LUNCH, M.DINNER],
    tags: ['calorie-dense', 'staple', 'easy-calories'] }),

  food({ id: 'argan-oil', name: 'Argan Oil (culinary)', group: G.FAT, kcal: 884, p: 0, c: 0, f: 100,
    price: 600, availability: A.SPECIALTY, ...vegan, cookingMin: 0, servingG: 14,
    mealTypes: [M.BREAKFAST], tags: ['traditional', 'expensive'] }),

  food({ id: 'butter', name: 'Butter', group: G.FAT, kcal: 717, p: 0.9, c: 0.1, f: 81,
    price: 120, availability: A.EVERYWHERE, ...veg, cookingMin: 0, servingG: 10,
    mealTypes: [M.BREAKFAST], tags: ['calorie-dense'] }),

  food({ id: 'almonds', name: 'Almonds', group: G.FAT, kcal: 579, p: 21, c: 22, f: 50, fiber: 12.5,
    price: 140, availability: A.EVERYWHERE, ...vegan, cookingMin: 0, servingG: 30,
    servingLabel: 'a small handful', mealTypes: [M.SNACK, M.BREAKFAST],
    tags: ['calorie-dense', 'no-cook', 'expensive'] }),

  food({ id: 'peanuts', name: 'Peanuts', group: G.FAT, kcal: 567, p: 26, c: 16, f: 49, fiber: 8.5,
    price: 45, availability: A.EVERYWHERE, ...vegan, cookingMin: 0, servingG: 30,
    mealTypes: [M.SNACK], tags: ['cheap-calories', 'calorie-dense', 'no-cook'] }),

  food({ id: 'peanut-butter', name: 'Peanut Butter', group: G.FAT, kcal: 588, p: 25, c: 20, f: 50, fiber: 6,
    price: 70, availability: A.COMMON, ...vegan, cookingMin: 0, servingG: 32,
    servingLabel: '2 tablespoons', mealTypes: [M.BREAKFAST, M.SNACK, M.PRE_WORKOUT],
    tags: ['easy-calories', 'no-cook', 'bulking'] }),

  food({ id: 'walnuts', name: 'Walnuts', group: G.FAT, kcal: 654, p: 15, c: 14, f: 65, fiber: 6.7,
    price: 130, availability: A.COMMON, ...vegan, cookingMin: 0, servingG: 30,
    mealTypes: [M.SNACK], tags: ['omega-3', 'calorie-dense'] }),

  food({ id: 'tahini', name: 'Tahini (sesame paste)', group: G.FAT, kcal: 595, p: 17, c: 21, f: 53, fiber: 9.3,
    price: 65, availability: A.COMMON, ...vegan, cookingMin: 0, servingG: 30,
    mealTypes: [M.BREAKFAST, M.SNACK], tags: ['calcium', 'easy-calories'] }),

  food({ id: 'avocado', name: 'Avocado', group: G.FAT, kcal: 160, p: 2, c: 9, f: 15, fiber: 6.7,
    price: 30, availability: A.SEASONAL, ...vegan, cookingMin: 0, servingG: 150,
    mealTypes: [M.BREAKFAST, M.SNACK], tags: ['no-cook', 'easy-calories'] }),

  food({ id: 'olives', name: 'Green Olives', group: G.FAT, kcal: 145, p: 1, c: 3.8, f: 15, fiber: 3.3,
    price: 28, availability: A.EVERYWHERE, ...vegan, cookingMin: 0, servingG: 40,
    mealTypes: [M.LUNCH, M.DINNER, M.SNACK], tags: ['traditional', 'no-cook'] }),

  food({ id: 'honey', name: 'Honey', group: G.FAT, kcal: 304, p: 0.3, c: 82, f: 0,
    price: 160, availability: A.EVERYWHERE, ...veg, cookingMin: 0, servingG: 21,
    servingLabel: '1 tablespoon', mealTypes: [M.BREAKFAST, M.PRE_WORKOUT],
    tags: ['fast-carbs', 'traditional'] }),
];
