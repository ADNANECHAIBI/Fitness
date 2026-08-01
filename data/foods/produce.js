/** Vegetables and fruit. */

import { food } from '../food-schema.js';
import { FOOD_GROUP as G, MEAL_TYPE as M, AVAILABILITY as A } from '../taxonomy.js';

const vegan = { vegetarian: true, vegan: true };

export const produceFoods = [
  food({ id: 'banana', name: 'Banana', group: G.FRUIT, kcal: 89, p: 1.1, c: 23, f: 0.3, fiber: 2.6,
    price: 14, availability: A.EVERYWHERE, ...vegan, cookingMin: 0, servingG: 120,
    servingLabel: '1 medium', mealTypes: [M.BREAKFAST, M.SNACK, M.PRE_WORKOUT, M.POST_WORKOUT],
    tags: ['no-cook', 'portable', 'fast-carbs'] }),

  food({ id: 'orange', name: 'Orange', group: G.FRUIT, kcal: 47, p: 0.9, c: 12, f: 0.1, fiber: 2.4,
    price: 7, availability: A.EVERYWHERE, ...vegan, cookingMin: 0, servingG: 150,
    mealTypes: [M.BREAKFAST, M.SNACK], tags: ['cheap', 'vitamin-c', 'no-cook'] }),

  food({ id: 'apple', name: 'Apple', group: G.FRUIT, kcal: 52, p: 0.3, c: 14, f: 0.2, fiber: 2.4,
    price: 15, availability: A.EVERYWHERE, ...vegan, cookingMin: 0, servingG: 150,
    mealTypes: [M.SNACK], tags: ['no-cook', 'portable'] }),

  food({ id: 'dates', name: 'Dates', group: G.FRUIT, kcal: 282, p: 2.5, c: 75, f: 0.4, fiber: 8,
    price: 55, availability: A.EVERYWHERE, ...vegan, cookingMin: 0, servingG: 40,
    mealTypes: [M.SNACK, M.PRE_WORKOUT], tags: ['fast-carbs', 'traditional', 'portable'] }),

  food({ id: 'watermelon', name: 'Watermelon', group: G.FRUIT, kcal: 30, p: 0.6, c: 7.6, f: 0.2, fiber: 0.4,
    price: 4, availability: A.SEASONAL, ...vegan, cookingMin: 0, servingG: 300,
    mealTypes: [M.SNACK], tags: ['hydrating', 'summer', 'cheap'] }),

  food({ id: 'grapes', name: 'Grapes', group: G.FRUIT, kcal: 69, p: 0.7, c: 18, f: 0.2, fiber: 0.9,
    price: 16, availability: A.SEASONAL, ...vegan, cookingMin: 0, servingG: 150,
    mealTypes: [M.SNACK], tags: ['no-cook'] }),

  food({ id: 'tomato', name: 'Tomato', group: G.VEGETABLE, kcal: 18, p: 0.9, c: 3.9, f: 0.2, fiber: 1.2,
    price: 8, availability: A.EVERYWHERE, ...vegan, cookingMin: 0, servingG: 150,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['staple', 'salad', 'tagine'] }),

  food({ id: 'onion', name: 'Onion', group: G.VEGETABLE, kcal: 40, p: 1.1, c: 9.3, f: 0.1, fiber: 1.7,
    price: 6, availability: A.EVERYWHERE, ...vegan, cookingMin: 10, servingG: 100,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['staple', 'base'] }),

  food({ id: 'carrot', name: 'Carrot', group: G.VEGETABLE, kcal: 41, p: 0.9, c: 10, f: 0.2, fiber: 2.8,
    price: 6, availability: A.EVERYWHERE, ...vegan, cookingMin: 15, servingG: 120,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['cheap', 'vitamin-a'] }),

  food({ id: 'courgette', name: 'Courgette', group: G.VEGETABLE, kcal: 17, p: 1.2, c: 3.1, f: 0.3, fiber: 1,
    price: 7, availability: A.EVERYWHERE, ...vegan, cookingMin: 12, servingG: 150,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['low-calorie', 'tagine'] }),

  food({ id: 'green-pepper', name: 'Green Pepper', group: G.VEGETABLE, kcal: 20, p: 0.9, c: 4.6, f: 0.2, fiber: 1.7,
    price: 9, availability: A.EVERYWHERE, ...vegan, cookingMin: 8, servingG: 100,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['salad', 'taktouka'] }),

  food({ id: 'cucumber', name: 'Cucumber', group: G.VEGETABLE, kcal: 15, p: 0.7, c: 3.6, f: 0.1, fiber: 0.5,
    price: 7, availability: A.EVERYWHERE, ...vegan, cookingMin: 0, servingG: 150,
    mealTypes: [M.LUNCH, M.DINNER, M.SNACK], tags: ['salad', 'no-cook', 'hydrating'] }),

  food({ id: 'spinach', name: 'Spinach', group: G.VEGETABLE, kcal: 23, p: 2.9, c: 3.6, f: 0.4, fiber: 2.2,
    price: 9, availability: A.COMMON, ...vegan, cookingMin: 6, servingG: 100,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['iron', 'low-calorie'] }),

  food({ id: 'pumpkin', name: 'Pumpkin', group: G.VEGETABLE, kcal: 26, p: 1, c: 6.5, f: 0.1, fiber: 0.5,
    price: 5, availability: A.SEASONAL, ...vegan, cookingMin: 20, servingG: 200,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['cheap', 'couscous'] }),

  food({ id: 'cabbage', name: 'Cabbage', group: G.VEGETABLE, kcal: 25, p: 1.3, c: 5.8, f: 0.1, fiber: 2.5,
    price: 5, availability: A.EVERYWHERE, ...vegan, cookingMin: 12, servingG: 150,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['cheap', 'fibre'] }),

  food({ id: 'turnip', name: 'Turnip', group: G.VEGETABLE, kcal: 28, p: 0.9, c: 6.4, f: 0.1, fiber: 1.8,
    price: 5, availability: A.EVERYWHERE, ...vegan, cookingMin: 20, servingG: 150,
    mealTypes: [M.LUNCH, M.DINNER], tags: ['cheap', 'couscous'] }),
];
