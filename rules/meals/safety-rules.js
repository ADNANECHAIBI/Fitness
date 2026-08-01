/**
 * safety-rules.js — what a finished day is not allowed to be.
 *
 * These do not build anything. They inspect a completed day and report what
 * is wrong with it, so the engine can act and the person can see it.
 */

import { defineRule } from '../rule.js';
import { round, percentOf } from '../../engines/calculation-engine.js';
import { MEAL_PLANNING } from '../../engines/constants.js';

export const mealSafetyRules = [
  defineRule({
    id: 'meal-safety.protein-shortfall',
    name: 'Protein below target',
    scope: 'day',
    priority: 100,
    when: (context) => context.actual.proteinG < context.targets.proteinG * 0.9,
    apply: (context) => ({
      patch: { proteinShortfall: true },
      message: `The day lands at ${context.actual.proteinG} g of protein against a target of ${context.targets.proteinG} — ${round(context.targets.proteinG - context.actual.proteinG, 1)} g short. Protein is the one target worth hitting even if the others slip; add a portion of the cheapest protein source you have.`,
    }),
  }),

  defineRule({
    id: 'meal-safety.calorie-overshoot',
    name: 'Calories well over target',
    scope: 'day',
    priority: 95,
    when: (context) => context.actual.calories > context.targets.calories * 1.1,
    apply: (context) => ({
      patch: { calorieOvershoot: true },
      message: `The day comes to ${context.actual.calories} kcal against ${context.targets.calories} — ${percentOf(context.actual.calories - context.targets.calories, context.targets.calories)}% over. Portions were rounded to practical sizes, which is where most of that comes from; trim the largest carbohydrate portion if it matters.`,
    }),
  }),

  defineRule({
    id: 'meal-safety.calorie-shortfall',
    name: 'Calories well under target',
    scope: 'day',
    priority: 90,
    when: (context) => context.actual.calories < context.targets.calories * 0.9,
    apply: (context) => ({
      patch: { calorieShortfall: true },
      message: `The day comes to ${context.actual.calories} kcal against ${context.targets.calories}. On a surplus that gap is the difference between gaining and not, so it is worth closing with something calorie-dense rather than ignoring.`,
    }),
  }),

  defineRule({
    id: 'meal-safety.over-reliance',
    name: 'One food doing too much work',
    scope: 'day',
    priority: 85,
    when: (context) => {
      const counts = {};
      for (const meal of context.meals) {
        for (const food of meal.foods) counts[food.foodId] = (counts[food.foodId] ?? 0) + 1;
      }
      return Object.values(counts).some((count) => count > MEAL_PLANNING.MAX_DAILY_REPEATS);
    },
    apply: (context) => {
      const counts = {};
      for (const meal of context.meals) {
        for (const food of meal.foods) counts[food.foodId] = (counts[food.foodId] ?? 0) + 1;
      }
      const worst = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

      return {
        patch: { overReliance: worst[0] },
        message: `${worst[0].replace(/-/g, ' ')} appears ${worst[1]} times today. A plan built on one food is easy to write and hard to eat, and it narrows the range of what you get.`,
      };
    },
  }),

  defineRule({
    id: 'meal-safety.unbalanced-meal',
    name: 'A meal without protein',
    scope: 'day',
    priority: 80,
    when: (context) =>
      context.meals.some((meal) =>
        ['breakfast', 'lunch', 'dinner'].includes(meal.slot) &&
        meal.proteinG < meal.targets.proteinG * MEAL_PLANNING.MIN_MEAL_PROTEIN_SHARE),
    apply: (context) => {
      const thin = context.meals.filter((meal) =>
        ['breakfast', 'lunch', 'dinner'].includes(meal.slot) &&
        meal.proteinG < meal.targets.proteinG * MEAL_PLANNING.MIN_MEAL_PROTEIN_SHARE);

      return {
        patch: { unbalancedMeals: thin.map((meal) => meal.slot) },
        message: `${thin.map((meal) => meal.slot.replace(/_/g, ' ')).join(' and ')} came out light on protein. Spreading protein across meals works better than loading it into one.`,
      };
    },
  }),

  defineRule({
    id: 'meal-safety.impractical-preparation',
    name: 'Too much cooking',
    scope: 'day',
    priority: 75,
    when: (context) => context.prepMinutes > MEAL_PLANNING.MAX_PREP_MINUTES,
    apply: (context) => ({
      patch: { impractical: true },
      message: `The day needs about ${context.prepMinutes} minutes of cooking, which is more than most people will do. Batch-cook the legumes and grains once for several days, or set a lower cooking time in settings and the plan will favour quicker food.`,
    }),
  }),

  defineRule({
    id: 'meal-safety.sound',
    name: 'The day is sound',
    scope: 'day',
    priority: 10,
    when: (context, draft) => Object.keys(draft).length === 0,
    apply: () => ({
      patch: { sound: true },
      message: `The day hits its targets within tolerance, stays inside the budget, and is practical to prepare.`,
    }),
  }),
];
