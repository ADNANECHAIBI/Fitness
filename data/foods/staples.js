/** Grains, legumes and starches — the base of most Moroccan meals. */

import { food } from '../food-schema.js';
import { FOOD_GROUP as G, MEAL_TYPE as M, AVAILABILITY as A } from '../taxonomy.js';

const veg = { vegetarian: true, vegan: true };

export const stapleFoods = [
  food({ id: 'lentils', name: 'Lentils (dry)', group: G.LEGUME, kcal: 353, p: 24.6, c: 60, f: 1.1, fiber: 10.7,
    price: 18, availability: A.EVERYWHERE, ...veg, cookingMin: 35, servingG: 80,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['cheap-protein', 'staple', 'batch-cooking', 'fibre'] }),

  food({ id: 'chickpeas', name: 'Chickpeas (dry)', group: G.LEGUME, kcal: 364, p: 19.3, c: 61, f: 6, fiber: 17,
    price: 20, availability: A.EVERYWHERE, ...veg, cookingMin: 60, servingG: 80,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['cheap-protein', 'staple', 'fibre', 'soak-overnight'] }),

  food({ id: 'white-beans', name: 'White Beans (dry)', group: G.LEGUME, kcal: 333, p: 23, c: 60, f: 0.8, fiber: 15,
    price: 18, availability: A.EVERYWHERE, ...veg, cookingMin: 60, servingG: 80,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['cheap-protein', 'loubia', 'soak-overnight'] }),

  food({ id: 'fava-beans', name: 'Fava Beans (dry)', group: G.LEGUME, kcal: 341, p: 26, c: 58, f: 1.5, fiber: 25,
    price: 16, availability: A.COMMON, ...veg, cookingMin: 50, servingG: 80,
    mealTypes: [M.BREAKFAST, M.LUNCH], tags: ['cheap-protein', 'bissara'] }),

  food({ id: 'split-peas', name: 'Split Peas (dry)', group: G.LEGUME, kcal: 341, p: 24.5, c: 60, f: 1.2, fiber: 25,
    price: 18, availability: A.COMMON, ...veg, cookingMin: 40, servingG: 80,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['cheap-protein', 'bissara'] }),

  food({ id: 'oats', name: 'Rolled Oats', group: G.GRAIN, kcal: 389, p: 16.9, c: 66.3, f: 6.9, fiber: 10.6,
    price: 22, availability: A.EVERYWHERE, ...veg, cookingMin: 5, servingG: 80,
    mealTypes: [M.BREAKFAST, M.PRE_WORKOUT, M.SNACK], tags: ['cheap-carbs', 'staple', 'fast'] }),

  food({ id: 'white-rice', name: 'White Rice (dry)', group: G.GRAIN, kcal: 365, p: 7.1, c: 80, f: 0.7, fiber: 1.3,
    price: 14, availability: A.EVERYWHERE, ...veg, cookingMin: 18, servingG: 90,
    mealTypes: [M.LUNCH, M.DINNER, M.POST_WORKOUT], tags: ['cheap-carbs', 'easy-digestion'] }),

  food({ id: 'couscous', name: 'Couscous (dry)', group: G.GRAIN, kcal: 376, p: 12.8, c: 77, f: 0.6, fiber: 5,
    price: 14, availability: A.EVERYWHERE, ...veg, cookingMin: 12, servingG: 90,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['staple', 'friday'] }),

  food({ id: 'pasta', name: 'Pasta (dry)', group: G.GRAIN, kcal: 371, p: 13, c: 75, f: 1.5, fiber: 3.2,
    price: 12, availability: A.EVERYWHERE, ...veg, cookingMin: 10, servingG: 100,
    mealTypes: [M.LUNCH, M.DINNER, M.PRE_WORKOUT], tags: ['cheap-carbs', 'fast'] }),

  food({ id: 'khobz', name: 'Khobz (white bread)', group: G.GRAIN, kcal: 265, p: 9, c: 49, f: 3.2, fiber: 2.7,
    price: 7, availability: A.EVERYWHERE, ...veg, cookingMin: 0, servingG: 90,
    servingLabel: 'half a round loaf', mealTypes: [M.BREAKFAST, M.LUNCH, M.DINNER, M.SNACK],
    tags: ['cheapest-carbs', 'staple', 'no-cook'] }),

  food({ id: 'whole-wheat-bread', name: 'Whole Wheat Bread', group: G.GRAIN, kcal: 247, p: 13, c: 41, f: 3.4, fiber: 7,
    price: 10, availability: A.EVERYWHERE, ...veg, cookingMin: 0, servingG: 90,
    mealTypes: [M.BREAKFAST, M.LUNCH, M.SNACK], tags: ['fibre', 'no-cook'] }),

  food({ id: 'semolina', name: 'Semolina', group: G.GRAIN, kcal: 360, p: 12.7, c: 73, f: 1, fiber: 3.9,
    price: 12, availability: A.EVERYWHERE, ...veg, cookingMin: 10, servingG: 80,
    mealTypes: [M.BREAKFAST], tags: ['harcha', 'cheap-carbs'] }),

  food({ id: 'barley', name: 'Barley (belboula)', group: G.GRAIN, kcal: 352, p: 9.9, c: 77.7, f: 1.2, fiber: 15.6,
    price: 15, availability: A.COMMON, ...veg, cookingMin: 40, servingG: 80,
    mealTypes: [M.BREAKFAST, M.DINNER], tags: ['fibre', 'traditional'] }),

  food({ id: 'potato', name: 'Potato', group: G.VEGETABLE, kcal: 77, p: 2, c: 17, f: 0.1, fiber: 2.2,
    price: 6, availability: A.EVERYWHERE, ...veg, cookingMin: 25, servingG: 250,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['cheap-carbs', 'filling', 'staple'] }),

  food({ id: 'sweet-potato', name: 'Sweet Potato', group: G.VEGETABLE, kcal: 86, p: 1.6, c: 20, f: 0.1, fiber: 3,
    price: 12, availability: A.COMMON, ...veg, cookingMin: 30, servingG: 250,
    mealTypes: [M.LUNCH, M.DINNER, M.PRE_WORKOUT], tags: ['vitamin-a'] }),
];
