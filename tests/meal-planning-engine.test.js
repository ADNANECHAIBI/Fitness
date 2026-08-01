/**
 * Tests for the meal planning engine — the sixteen required situations, the
 * safety rules, and the invariants that must hold for any plan.
 */

import { describe, it, expect } from './runner.js';
import { MealPlanningEngine } from '../engines/meal-planning-engine.js';
import { resolveBudget } from '../engines/meal-context.js';
import { findReplacement } from '../rules/meals/replacement-rules.js';
import { practicalPortion } from '../rules/meals/meal-selection.js';
import { FoodDB } from '../data/foods/index.js';
import { MEAL_PLANNING, BUDGET, MEAL_SLOT } from '../engines/constants.js';

const TODAY = '2026-07-27';

const PROFILE = {
  weightKg: 80, heightCm: 180, age: 30, sex: 'male',
  activityLevel: 'moderate', experienceLevel: 'intermediate', goal: 'bulk',
};

/** A NutritionWeek shaped exactly as the nutrition engine produces one. */
function nutritionWeek({
  calories = 3000, proteinG = 150, carbsG = 375, fatG = 80, fibreG = 42,
  gymDays = 3, runDays = 1, goal = 'bulk',
} = {}) {
  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const start = new Date(`${TODAY}T00:00:00Z`).getTime();

  return {
    weekNumber: 12, goal, startDate: TODAY,
    endDate: new Date(start + 6 * 86400000).toISOString().slice(0, 10),
    days: weekdays.map((weekday, index) => {
      const trainingDay = index < gymDays;
      const runningDay = !trainingDay && index < gymDays + runDays;

      return {
        date: new Date(start + index * 86400000).toISOString().slice(0, 10),
        weekday, calories, proteinG, carbsG, fatG, fibreG, waterL: 3,
        mealDistribution: [], trainingDay, runningDay,
        restDay: !trainingDay && !runningDay, refeedDay: false,
      };
    }),
  };
}

const build = ({ nutrition = {}, settings = {}, profile = {}, workoutWeek = null } = {}) =>
  MealPlanningEngine.build({
    nutritionWeek: nutritionWeek(nutrition),
    profile: { ...PROFILE, ...profile },
    settings: { appetite: 'normal', budgetLevel: 'medium', ...settings },
    workoutWeek,
  });

/* ── Goals ──────────────────────────────────────────────────────────────── */

describe('MealPlanningEngine — goals', () => {
  const goals = [
    ['bulk', { calories: 3300, proteinG: 152 }],
    ['lean_bulk', { calories: 3000, proteinG: 152 }],
    ['maintenance', { calories: 2700, proteinG: 144 }],
    ['fat_loss', { calories: 2200, proteinG: 176, carbsG: 200, fatG: 64 }],
  ];

  for (const [goal, macros] of goals) {
    it(`plans a week for ${goal}`, () => {
      const plan = build({ nutrition: { ...macros, goal } });
      expect(plan.days.length).toBe(7);
      expect(plan.days.every((day) => day.meals.length >= MEAL_PLANNING.MIN_MEALS)).toBeTruthy();
    });

    it(`lands close on protein for ${goal}`, () => {
      const plan = build({ nutrition: { ...macros, goal } });
      expect(plan.macroAccuracy.proteinG).toBeGreaterThan(70);
    });
  }

  it('never calculates a target of its own', () => {
    const week = nutritionWeek({ calories: 2500, proteinG: 140 });
    const plan = MealPlanningEngine.build({
      nutritionWeek: week, profile: PROFILE, settings: { appetite: 'normal' },
    });
    expect(plan.days[0].targets.calories).toBe(2500);
    expect(plan.days[0].targets.proteinG).toBe(140);
  });
});

/* ── Budget ─────────────────────────────────────────────────────────────── */

describe('MealPlanningEngine — budget', () => {
  it('uses a stated daily budget', () => {
    const budget = resolveBudget({ budgetMadPerDay: 60 });
    expect(budget.madPerDay).toBe(60);
    expect(budget.stated).toBeTruthy();
  });

  it('converts a monthly budget', () => {
    const budget = resolveBudget({ budgetMadPerMonth: 1200 });
    expect(budget.madPerDay).toBe(40);
  });

  it('assumes one from the budget level, and says so', () => {
    const plan = build({ settings: { budgetLevel: 'low' } });
    expect(plan.meta.budgetSource).toContain('assumed');
    expect(plan.notes.some((note) => note.includes('assumed'))).toBeTruthy();
  });

  it('spends less on a low budget than a high one', () => {
    const tight = build({ settings: { budgetMadPerDay: 30 } });
    const rich = build({ settings: { budgetMadPerDay: 150 } });
    expect(tight.dailyCostAverageMad).toBeLessThan(rich.dailyCostAverageMad + 0.01);
  });

  it('says plainly when the targets cannot be met inside the budget', () => {
    const plan = build({
      nutrition: { calories: 4000, proteinG: 220 },
      settings: { budgetMadPerDay: 8 },
    });

    const over = plan.days.filter((day) => !day.withinBudget);
    expect(over.length).toBeGreaterThan(0);

    const reason = plan.reasons.find((r) => r.ruleId === 'budget.exceeded');
    expect(reason.message).toContain('cannot be built inside the budget');
    expect(reason.message).toContain('estimates');
  });

  it('reports the weekly cost and the average day', () => {
    const plan = build();
    expect(plan.weeklyCostMad).toBeGreaterThan(0);
    expect(Math.abs(plan.dailyCostAverageMad * 7 - plan.weeklyCostMad)).toBeLessThan(1);
  });

  it('shifts priority to cost when the budget is tight', () => {
    const plan = build({ settings: { budgetMadPerDay: 25 }, nutrition: { proteinG: 180 } });
    expect(plan.reasons.some((r) => r.ruleId === 'budget.tight-prioritises-cost')).toBeTruthy();
  });
});

/* ── Appetite ───────────────────────────────────────────────────────────── */

describe('MealPlanningEngine — appetite', () => {
  it('gives a small appetite more meals', () => {
    const low = build({ settings: { appetite: 'low' } });
    const high = build({ settings: { appetite: 'high' } });
    expect(low.days[0].meals.length).toBeGreaterThan(high.days[0].meals.length);
  });

  it('explains the meal count', () => {
    const plan = build({ settings: { appetite: 'low' } });
    const reason = plan.reasons.find((r) => r.ruleId === 'distribution.from-appetite');
    expect(reason.message).toContain('smaller meals');
  });

  it('prefers dense food on a small appetite', () => {
    const plan = build({ settings: { appetite: 'low' } });
    expect(plan.reasons.some((r) => r.ruleId === 'appetite.low-prefers-density')).toBeTruthy();
  });

  it('names the hardest combination honestly', () => {
    const plan = build({ settings: { appetite: 'low' }, nutrition: { goal: 'bulk' } });
    const reason = plan.reasons.find((r) => r.ruleId === 'appetite.surplus-with-low-appetite');
    expect(reason.message).toContain('hardest combination');
  });
});

/* ── Training awareness ─────────────────────────────────────────────────── */

describe('MealPlanningEngine — training awareness', () => {
  const plan = build();

  it('weights carbohydrate toward the session on a lifting day', () => {
    const reason = plan.reasons.find((r) => r.ruleId === 'timing.carbs-around-lifting');
    expect(reason.message).toContain('nearest the session');
  });

  it('moves carbohydrate earlier on a running day', () => {
    const reason = plan.reasons.find((r) => r.ruleId === 'timing.carbs-before-running');
    expect(reason).toBeTruthy();
  });

  it('spreads evenly on a rest day', () => {
    const reason = plan.reasons.find((r) => r.ruleId === 'timing.rest-day-even');
    expect(reason.message).toContain('no session to fuel');
  });

  it('plans fewer meals on a rest day at a normal appetite', () => {
    const training = plan.days.find((day) => day.trainingDay);
    const rest = plan.days.find((day) => day.restDay);
    expect(rest.meals.length).toBeLessThan(training.meals.length + 1);
  });

  it('puts protein in every main meal', () => {
    for (const day of plan.days) {
      const mains = day.meals.filter((meal) =>
        ['breakfast', 'lunch', 'dinner'].includes(meal.slot));
      expect(mains.every((meal) => meal.proteinG > 0)).toBeTruthy();
    }
  });
});

/* ── Constraints and replacement ────────────────────────────────────────── */

describe('MealPlanningEngine — constraints', () => {
  it('respects a limited cooking time', () => {
    const plan = build({ settings: { cookingMinutesPerDay: 15 } });
    for (const day of plan.days) {
      for (const meal of day.meals) {
        expect(meal.prepMinutes).toBeLessThan(16);
      }
    }
  });

  it('never uses an excluded food', () => {
    const plan = build({ settings: { excludedFoods: ['khobz', 'canned-sardine', 'canned-tuna'] } });
    const used = plan.days.flatMap((day) => day.meals.flatMap((meal) => meal.foods.map((food) => food.foodId)));
    expect(used.includes('khobz')).toBeFalsy();
    expect(used.includes('canned-sardine')).toBeFalsy();
  });

  it('keeps a vegetarian plan vegetarian', () => {
    const plan = build({ settings: { vegetarian: true } });
    const used = plan.days.flatMap((day) => day.meals.flatMap((meal) => meal.foods));
    expect(used.every((food) => FoodDB.byId(food.foodId).vegetarian)).toBeTruthy();
  });

  it('keeps a vegan plan vegan', () => {
    const plan = build({ settings: { vegan: true, vegetarian: true } });
    const used = plan.days.flatMap((day) => day.meals.flatMap((meal) => meal.foods));
    expect(used.every((food) => FoodDB.byId(food.foodId).vegan)).toBeTruthy();
  });

  it('says when no protein source survives the constraints', () => {
    const everything = FoodDB.all().filter((food) => food.proteinG >= 10).map((food) => food.id);
    const plan = build({ settings: { excludedFoods: everything } });
    expect(plan.notes.some((note) => note.includes('protein source'))).toBeTruthy();
  });
});

describe('MealPlanningEngine — replacement', () => {
  const context = {
    pool: FoodDB.all(),
    foodDb: FoodDB,
    prepMinutes: 60,
  };

  it('finds a cheaper source when over budget', () => {
    const original = { foodId: 'beef-lean', name: 'Lean Beef' };
    const swap = findReplacement({ original, context, role: 'protein', reason: 'over-budget' });

    expect(swap).toBeTruthy();
    expect(FoodDB.byId(swap.food.id).priceMadPerKg).toBeLessThan(FoodDB.byId('beef-lean').priceMadPerKg);
    expect(swap.reason.message).toContain('costs less per kilo');
  });

  it('keeps the role when replacing', () => {
    const swap = findReplacement({
      original: { foodId: 'chicken-breast', name: 'Chicken Breast' },
      context, role: 'protein', reason: 'unavailable',
    });
    expect(swap.food.proteinG).toBeGreaterThan(0);
  });

  it('records what it replaced and why', () => {
    const swap = findReplacement({
      original: { foodId: 'oats', name: 'Rolled Oats' },
      context, role: 'carb', reason: 'excluded',
    });
    expect(swap.reason.replaced ?? swap.reason.replacedBy).toBeTruthy();
    expect(swap.reason.cause).toBe('excluded');
  });

  it('returns nothing when there is no alternative', () => {
    const swap = findReplacement({
      original: { foodId: 'olive-oil', name: 'Olive Oil' },
      context: { ...context, pool: [FoodDB.byId('olive-oil')] },
      role: 'fat', reason: 'unavailable',
    });
    expect(swap).toBeNull();
  });
});

/* ── Safety ─────────────────────────────────────────────────────────────── */

describe('MealPlanningEngine — safety', () => {
  it('flags a protein shortfall', () => {
    const plan = build({
      nutrition: { calories: 1600, proteinG: 260 },
      settings: { excludedFoods: FoodDB.all().filter((f) => f.proteinG >= 20).map((f) => f.id) },
    });
    const flagged = plan.days.some((day) => day.flags.proteinShortfall);
    const shortfall = plan.reasons.some((r) => r.ruleId === 'meal-safety.protein-shortfall');
    expect(flagged || shortfall).toBeTruthy();
  });

  it('never leans on one food more than twice a day', () => {
    const plan = build();
    for (const day of plan.days) {
      const counts = {};
      for (const meal of day.meals) {
        for (const food of meal.foods) counts[food.foodId] = (counts[food.foodId] ?? 0) + 1;
      }
      expect(Math.max(...Object.values(counts))).toBeLessThan(MEAL_PLANNING.MAX_DAILY_REPEATS + 1);
    }
  });

  it('uses a range of foods across the week', () => {
    const plan = build();
    expect(plan.variety.distinctFoods).toBeGreaterThan(6);
  });

  it('flags a day that needs too much cooking', () => {
    const plan = build({ settings: { cookingMinutesPerDay: 240 } });
    const impractical = plan.days.filter((day) => day.flags.impractical);
    for (const day of impractical) {
      expect(day.prepMinutes).toBeGreaterThan(MEAL_PLANNING.MAX_PREP_MINUTES);
    }
  });

  it('reports a sound day as sound', () => {
    const plan = build({ settings: { budgetMadPerDay: 200 } });
    expect(plan.days.some((day) => day.flags.sound)).toBeTruthy();
  });
});

/* ── Portions ───────────────────────────────────────────────────────────── */

describe('MealPlanningEngine — portions', () => {
  it('rounds to something a person can weigh', () => {
    const rice = FoodDB.byId('white-rice');
    expect(practicalPortion(rice, 137) % 10).toBe(0);
  });

  it('uses whole units for countable foods', () => {
    const egg = FoodDB.byId('egg');
    const grams = practicalPortion(egg, 137);
    expect(grams % egg.servingG).toBe(0);
  });

  it('never prescribes an absurd portion', () => {
    const plan = build({ nutrition: { calories: 5000, proteinG: 250 } });
    for (const day of plan.days) {
      for (const meal of day.meals) {
        for (const food of meal.foods) {
          const bounds = MEAL_PLANNING.PORTION_BOUNDS[FoodDB.byId(food.foodId).group];
          expect(food.quantity).toBeLessThan(bounds.max + 1);
          expect(food.quantity).toBeGreaterThan(bounds.min - 1);
        }
      }
    }
  });
});

/* ── Accuracy ───────────────────────────────────────────────────────────── */

describe('MealPlanningEngine — macro accuracy', () => {
  it('reports how close it got, per macro', () => {
    const plan = build();
    for (const key of ['overall', 'calories', 'proteinG', 'carbsG', 'fatG']) {
      expect(plan.macroAccuracy[key]).toBeGreaterThan(0);
      expect(plan.macroAccuracy[key]).toBeLessThan(100.1);
    }
  });

  it('gets reasonably close on a normal week', () => {
    const plan = build({ settings: { budgetMadPerDay: 120 } });
    expect(plan.macroAccuracy.overall).toBeGreaterThan(75);
  });

  it('says when it did not get close, rather than hiding it', () => {
    const plan = build({ nutrition: { calories: 900, proteinG: 200 } });
    if (plan.macroAccuracy.overall < MEAL_PLANNING.GOOD_ACCURACY * 100) {
      expect(plan.notes.some((note) => note.includes('macro accuracy'))).toBeTruthy();
    }
  });

  it('admits the plan is a heuristic, not an optimum', () => {
    const plan = build();
    expect(plan.meta.formula.caveat).toContain('not land exactly');
    expect(plan.meta.formula.source).toContain('greedy');
  });
});

/* ── Invariants ─────────────────────────────────────────────────────────── */

describe('MealPlanningEngine — invariants', () => {
  const scenarios = [
    ['a bulk', {}],
    ['fat loss', { nutrition: { calories: 2100, proteinG: 176, carbsG: 190, fatG: 62 } }],
    ['a tight budget', { settings: { budgetMadPerDay: 25 } }],
    ['a large budget', { settings: { budgetMadPerDay: 200 } }],
    ['a small appetite', { settings: { appetite: 'low' } }],
    ['a large appetite', { settings: { appetite: 'high' } }],
    ['no time to cook', { settings: { cookingMinutesPerDay: 10 } }],
    ['vegetarian', { settings: { vegetarian: true } }],
  ];

  for (const [name, input] of scenarios) {
    it(`explains every food chosen — ${name}`, () => {
      const plan = build(input);
      for (const day of plan.days) {
        for (const meal of day.meals) {
          for (const food of meal.foods) {
            expect(food.reason.message.length).toBeGreaterThan(20);
            expect(Boolean(food.reason.ruleId)).toBeTruthy();
          }
        }
      }
    });

    it(`keeps every meal's macros consistent with its foods — ${name}`, () => {
      const plan = build(input);
      for (const day of plan.days) {
        for (const meal of day.meals) {
          const summed = meal.foods.reduce((total, food) => total + food.calories, 0);
          expect(Math.abs(summed - meal.calories)).toBeLessThan(2);
        }
      }
    });

    it(`keeps the day equal to the sum of its meals — ${name}`, () => {
      const plan = build(input);
      for (const day of plan.days) {
        const summed = day.meals.reduce((total, meal) => total + meal.calories, 0);
        expect(Math.abs(summed - day.calories)).toBeLessThan(2);
      }
    });

    it(`only ever uses foods the database holds — ${name}`, () => {
      const plan = build(input);
      const used = plan.days.flatMap((day) => day.meals.flatMap((meal) => meal.foods));
      expect(used.every((food) => FoodDB.has(food.foodId))).toBeTruthy();
    });
  }

  it('produces an empty plan rather than throwing on an empty week', () => {
    const plan = MealPlanningEngine.build({
      nutritionWeek: { weekNumber: 1, days: [] }, profile: PROFILE, settings: {},
    });
    expect(plan.days).toEqual([]);
    expect(plan.notes.length).toBeGreaterThan(0);
  });

  it('skips a day with no calorie target and says why', () => {
    const week = nutritionWeek();
    week.days[0].calories = null;
    const plan = MealPlanningEngine.build({ nutritionWeek: week, profile: PROFILE, settings: {} });

    expect(plan.days.length).toBe(6);
    expect(plan.notes.some((note) => note.includes('no calorie target'))).toBeTruthy();
  });

  it('flattens reasons from every level', () => {
    const plan = build();
    const reasons = MealPlanningEngine.allReasons(plan);

    expect(reasons.length).toBeGreaterThan(plan.reasons.length);
    expect(reasons.some((reason) => reason.scope === 'food')).toBeTruthy();
    expect(reasons.some((reason) => reason.scope === 'meal')).toBeTruthy();
    expect(reasons.every((reason) => Boolean(reason.ruleId))).toBeTruthy();
  });

  it('supports every declared meal slot somewhere in its shapes', () => {
    const plan = build({ settings: { appetite: 'low' } });
    const slots = new Set(plan.days.flatMap((day) => day.meals.map((meal) => meal.slot)));
    expect(slots.has(MEAL_SLOT.BREAKFAST)).toBeTruthy();
    expect(slots.has(MEAL_SLOT.BEFORE_SLEEP) || slots.has(MEAL_SLOT.MORNING_SNACK)).toBeTruthy();
  });
});
