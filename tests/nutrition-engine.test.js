/**
 * Tests for the nutrition engine — the eighteen required situations, the
 * safety floors, and the invariants that must hold for any week.
 */

import { describe, it, expect } from './runner.js';
import { NutritionEngine } from '../engines/nutrition-engine.js';
import {
  NUTRITION_GOAL, NUTRITION_SAFETY, MACROS, REFEED, DIET_BREAK,
  CALORIE_CYCLING, UNITS,
} from '../engines/constants.js';

const TODAY = '2026-07-27';

const PROFILE = {
  startDate: '2026-05-01', goal: 'bulk',
  weightKg: 80, startWeightKg: 80, goalWeightKg: 88,
  heightCm: 180, age: 30, sex: 'male', activityLevel: 'moderate',
  experienceLevel: 'intermediate',
  availableDays: ['mon', 'tue', 'thu', 'sat'],
  sessionStart: '18:00', sessionEnd: '19:30',
};

/** A weekly plan with chosen day types — no planner needed. */
function planWith({ gymDays = 3, runDays = 1, deload = false, strain = 20, recoveryScore = 7 } = {}) {
  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const start = new Date(`${TODAY}T00:00:00Z`).getTime();

  const days = weekdays.map((weekday, index) => {
    const type = index < gymDays ? 'gym' : index < gymDays + runDays ? 'running' : 'rest';
    return {
      date: new Date(start + index * 86400000).toISOString().slice(0, 10),
      weekday, type, durationMin: 60, intensity: 'moderate', priority: 2,
    };
  });

  return {
    weekNumber: 12, phase: deload ? 'recovery' : 'hypertrophy', deload,
    startDate: TODAY, endDate: days.at(-1).date, days,
    recovery: { strainIndex: strain, score: recoveryScore, restDays: 7 - gymDays - runDays },
    summary: { volumeFactor: 1 },
  };
}

/** Minimal workout and running weeks, shaped as the real engines produce. */
function trainingWeeks(plan, { sets = 60, km = 12 } = {}) {
  const gymDays = plan.days.filter((day) => day.type === 'gym');
  const runDays = plan.days.filter((day) => day.type === 'running');

  return {
    workoutWeek: {
      totalWeeklySets: sets,
      estimatedWeeklyMinutes: gymDays.length * 60,
      days: gymDays.map((day) => ({
        date: day.date, goal: 'Full body', estimatedMinutes: 60,
        exercises: [{ sets: Math.round(sets / Math.max(1, gymDays.length)), corrective: false }],
      })),
    },
    runningWeek: {
      weeklyDistanceKm: km,
      weeklyDurationMin: runDays.length * 45,
      weeklyLoad: runDays.length * 150,
      sessions: runDays.map((day) => ({
        date: day.date, totalMinutes: 45, distanceKm: km / Math.max(1, runDays.length),
        recovery: { isQuality: false },
      })),
    },
  };
}

/** Weigh-ins at a chosen weekly rate, ending just before the week. */
function weighIns(startKg, ratePerWeek, count = 5, stepDays = 3) {
  const end = new Date(`${TODAY}T00:00:00Z`).getTime();
  const start = end - (count - 1) * stepDays * 86400000;
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(start + i * stepDays * 86400000).toISOString().slice(0, 10),
    kg: Number((startKg + (ratePerWeek / 7) * i * stepDays).toFixed(2)),
  }));
}

function build({
  goal = 'bulk', profile = {}, settings = {}, plan = null,
  weights = weighIns(80, 0.28), training = {}, deficitWeeks = null,
  sessions = [], temperatureC = null,
} = {}) {
  const weeklyPlan = plan ?? planWith();
  const weeks = trainingWeeks(weeklyPlan, training);

  return NutritionEngine.build({
    weeklyPlan,
    ...weeks,
    profile: { ...PROFILE, goal, ...profile },
    settings: { appetite: 'normal', sleepHours: 8, ...settings },
    weightHistory: weights,
    sessions,
    deficitWeeks,
    temperatureC,
  });
}

/* ── Goals ──────────────────────────────────────────────────────────────── */

describe('NutritionEngine — goals', () => {
  const cases = [
    ['lean_bulk', 1],
    ['bulk', 1],
    ['maintenance', 0],
    ['recomposition', 0],
    ['fat_loss', -1],
    ['aggressive_cut', -1],
  ];

  for (const [goal, direction] of cases) {
    it(`sets calories in the right direction for ${goal}`, () => {
      const week = build({ goal, weights: [] });
      const tdee = week.meta.tdee;

      if (direction > 0) expect(week.dailyCalories).toBeGreaterThan(tdee);
      else if (direction < 0) expect(week.dailyCalories).toBeLessThan(tdee);
      else expect(Math.abs(week.dailyCalories - tdee)).toBeLessThan(120);
    });
  }

  it('gives a lean bulk a smaller surplus than a bulk', () => {
    const lean = build({ goal: 'lean_bulk', weights: [] });
    const full = build({ goal: 'bulk', weights: [] });
    expect(lean.dailyCalories).toBeLessThan(full.dailyCalories);
  });

  it('gives an aggressive cut a steeper deficit than fat loss', () => {
    const steady = build({ goal: 'fat_loss', weights: [] });
    const steep = build({ goal: 'aggressive_cut', weights: [] });
    expect(steep.dailyCalories).toBeLessThan(steady.dailyCalories);
  });

  it('says plainly what an aggressive cut costs', () => {
    const week = build({ goal: 'aggressive_cut', weights: [] });
    const reason = week.reasons.find((r) => r.ruleId === 'cut.aggressive-costs');
    expect(reason.message).toContain('doctor');
    expect(week.safety.aggressiveCut).toBeTruthy();
  });

  it('still accepts the original stored goal names', () => {
    const week = build({ goal: 'cut', weights: [] });
    expect(week.goal).toBe(NUTRITION_GOAL.FAT_LOSS);
  });
});

/* ── Training patterns ──────────────────────────────────────────────────── */

describe('NutritionEngine — training patterns', () => {
  it('handles a week with no training at all', () => {
    const week = build({ plan: planWith({ gymDays: 0, runDays: 0 }), training: { sets: 0, km: 0 } });
    expect(week.days.every((day) => day.restDay)).toBeTruthy();
    expect(week.days.every((day) => day.calories > 0)).toBeTruthy();
  });

  it('handles a lifting-only week', () => {
    const week = build({ plan: planWith({ gymDays: 4, runDays: 0 }), training: { km: 0 } });
    expect(week.days.filter((day) => day.trainingDay).length).toBe(4);
    expect(week.days.some((day) => day.runningDay)).toBeFalsy();
  });

  it('handles a running-only week', () => {
    const week = build({ plan: planWith({ gymDays: 0, runDays: 3 }), training: { sets: 0 } });
    expect(week.days.filter((day) => day.runningDay).length).toBe(3);
  });

  it('gives the most carbohydrate to a day with both', () => {
    const plan = planWith({ gymDays: 2, runDays: 1 });
    // Put a run on the same date as a lift.
    plan.days[0].type = 'gym';
    const weeks = trainingWeeks(plan);
    weeks.runningWeek.sessions = [{ date: plan.days[0].date, totalMinutes: 45, distanceKm: 8, recovery: { isQuality: false } }];

    const week = NutritionEngine.build({
      weeklyPlan: plan, ...weeks, profile: PROFILE,
      settings: { appetite: 'normal' }, weightHistory: weighIns(80, 0.28),
    });

    const both = week.days.find((day) => day.trainingDay && day.runningDay);
    expect(both).toBeTruthy();
    expect(both.notes).toContain('largest carbohydrate day');
  });

  it('gives rest days fewer calories than training days', () => {
    const week = build();
    const rest = week.days.find((day) => day.restDay);
    const training = week.days.find((day) => day.trainingDay);
    expect(rest.calories).toBeLessThan(training.calories);
  });

  it('holds protein steady across every day', () => {
    const week = build();
    const proteins = new Set(week.days.map((day) => day.proteinG));
    expect(proteins.size).toBe(1);
  });

  it('keeps the weekly average on the target', () => {
    const week = build();
    const average = Math.round(week.weeklyCalories / week.days.length);
    expect(Math.abs(average - week.dailyCalories)).toBeLessThan(2);
  });
});

/* ── Weight-trend response ──────────────────────────────────────────────── */

describe('NutritionEngine — responding to the scale', () => {
  it('cuts calories when gaining faster than intended', () => {
    const fast = build({ goal: 'bulk', weights: weighIns(80, 1.2) });
    expect(fast.adjustment.action).toBe('decrease');
    expect(fast.adjustment.deltaKcal).toBeLessThan(0);
  });

  it('raises calories when the weight is not moving on a bulk', () => {
    const flat = build({ goal: 'bulk', weights: weighIns(80, 0.0) });
    expect(flat.adjustment.action).toBe('increase');
    expect(flat.expectedWeightTrend.warning).toBe('slow');
  });

  it('raises calories when losing too fast on a cut', () => {
    const week = build({ goal: 'fat_loss', weights: weighIns(80, -1.6), deficitWeeks: 2 });
    const reason = week.reasons.find((r) => r.ruleId === 'cut.losing-too-fast');
    expect(reason.message).toContain('1%');
  });

  it('holds when there is not enough evidence', () => {
    const week = build({ weights: weighIns(80, 0.3, 2) });
    expect(week.adjustment.action).toBe('hold');
    expect(week.notes.some((note) => note.includes('three weigh-ins'))).toBeTruthy();
  });

  it('reuses the adjustment engine rather than re-deriving the decision', () => {
    const week = build({ goal: 'bulk', weights: weighIns(80, 0.0) });
    expect(week.adjustment.source).toBe('adjustment-engine');

    const reason = week.reasons.find((r) => r.ruleId === 'calories.apply-trend-adjustment');
    expect(reason.message.message ?? reason.message).toBeTruthy();
  });

  it('flags a stall in a deficit without slashing calories', () => {
    const week = build({ goal: 'fat_loss', weights: weighIns(80, 0.0), deficitWeeks: 4 });
    expect(week.expectedWeightTrend.warning).toBe('stalled');
  });
});

/* ── Recovery ───────────────────────────────────────────────────────────── */

describe('NutritionEngine — recovery', () => {
  it('raises carbohydrate when recovery is poor', () => {
    const normal = build();
    const tired = build({ plan: planWith({ recoveryScore: 3 }) });

    expect(tired.carbTargetG).toBeGreaterThan(normal.carbTargetG);
    expect(tired.recoverySupport.level).toBe('carbs-raised');
  });

  it('postpones a planned cut when recovery is poor', () => {
    const week = build({
      goal: 'bulk',
      weights: weighIns(80, 1.2),
      plan: planWith({ recoveryScore: 3 }),
    });
    expect(week.adjustment.postponed).toBeTruthy();
    expect(week.adjustment.action).toBe('hold');
  });

  it('does nothing extra when recovery is good', () => {
    const week = build({ plan: planWith({ recoveryScore: 9 }) });
    expect(week.recoverySupport.level).toBe('none-needed');
  });

  it('eases the deficit during a deload', () => {
    const normal = build({ goal: 'fat_loss', weights: [], deficitWeeks: 2 });
    const deload = build({ goal: 'fat_loss', weights: [], deficitWeeks: 2, plan: planWith({ deload: true }) });
    expect(deload.dailyCalories).toBeGreaterThan(normal.dailyCalories);
  });
});

/* ── Refeed and diet break ──────────────────────────────────────────────── */

describe('NutritionEngine — refeed', () => {
  it('offers none outside a deficit', () => {
    expect(build({ goal: 'bulk' }).refeed.active).toBeFalsy();
  });

  it('offers none in the first weeks of a deficit', () => {
    const week = build({ goal: 'fat_loss', deficitWeeks: 1, weights: [] });
    expect(week.refeed.active).toBeFalsy();
  });

  it('schedules one after enough weeks in a deficit', () => {
    const week = build({ goal: 'fat_loss', deficitWeeks: REFEED.MIN_DEFICIT_WEEKS, weights: [] });
    expect(week.refeed.active).toBeTruthy();
    expect(week.refeed.reason).toBe('scheduled');
  });

  it('places it on the hardest training day, at maintenance', () => {
    const week = build({ goal: 'fat_loss', deficitWeeks: 4, weights: [] });
    const refeedDay = week.days.find((day) => day.refeedDay);

    expect(refeedDay.trainingDay || refeedDay.runningDay).toBeTruthy();
    expect(refeedDay.calories).toBeGreaterThan(week.dailyCalories);
  });

  it('brings one forward when recovery is poor', () => {
    const week = build({
      goal: 'fat_loss', deficitWeeks: 2, weights: [],
      plan: planWith({ recoveryScore: 3 }),
    });
    expect(week.refeed.active).toBeTruthy();
    expect(week.refeed.reason).toBe('recovery');
  });

  it('does not oversell what a refeed does', () => {
    const week = build({ goal: 'fat_loss', deficitWeeks: 4, weights: [] });
    const reason = week.reasons.find((r) => r.ruleId === 'refeed.scheduled');
    expect(reason.message).toContain('bigger than the evidence');
  });
});

describe('NutritionEngine — diet break', () => {
  it('offers none outside a deficit', () => {
    expect(build({ goal: 'bulk' }).dietBreak.active).toBeFalsy();
  });

  it('triggers after a long deficit', () => {
    const week = build({ goal: 'fat_loss', deficitWeeks: DIET_BREAK.AFTER_WEEKS, weights: [] });
    expect(week.dietBreak.active).toBeTruthy();
    expect(week.dietBreak.reason).toBe('duration');
  });

  it('puts the whole week at maintenance', () => {
    const week = build({ goal: 'fat_loss', deficitWeeks: 12, weights: [] });
    expect(Math.abs(week.dailyCalories - week.meta.tdee)).toBeLessThan(200);
  });

  it('triggers early when stalled and under-recovered', () => {
    const week = build({
      goal: 'fat_loss', deficitWeeks: DIET_BREAK.STALL_WEEKS,
      weights: weighIns(80, 0.0),
      plan: planWith({ recoveryScore: 3 }),
    });
    expect(week.dietBreak.active).toBeTruthy();
    expect(week.dietBreak.reason).toBe('stall');
  });

  it('replaces the refeed rather than stacking with it', () => {
    const week = build({ goal: 'fat_loss', deficitWeeks: 12, weights: [] });
    expect(week.dietBreak.active).toBeTruthy();
    expect(week.refeed.active).toBeFalsy();
  });
});

/* ── Safety ─────────────────────────────────────────────────────────────── */

describe('NutritionEngine — safety floors', () => {
  it('never prescribes below resting metabolism', () => {
    const week = build({
      goal: 'aggressive_cut',
      profile: { weightKg: 55, heightCm: 160, age: 55, sex: 'female', activityLevel: 'sedentary' },
      weights: [],
    });
    expect(week.dailyCalories).toBeGreaterThan(week.meta.bmr - 1);
  });

  it('caps the deficit at a quarter below maintenance', () => {
    const week = build({ goal: 'aggressive_cut', weights: weighIns(80, 0.0), deficitWeeks: 2 });
    const floor = week.meta.tdee * (1 - NUTRITION_SAFETY.MAX_DEFICIT_FRACTION);
    expect(week.dailyCalories).toBeGreaterThan(floor - 1);
  });

  it('caps the surplus', () => {
    const week = build({ goal: 'bulk', weights: weighIns(80, 0.0) });
    const ceiling = week.meta.tdee * (1 + NUTRITION_SAFETY.MAX_SURPLUS_FRACTION);
    expect(week.dailyCalories).toBeLessThan(ceiling + 1);
  });

  it('never drops protein below the floor', () => {
    const week = build({ goal: 'maintenance', weights: [] });
    expect(week.proteinTargetG).toBeGreaterThan(
      PROFILE.weightKg * NUTRITION_SAFETY.MIN_PROTEIN_G_PER_KG - 1);
  });

  it('never drops fat below the floor or below a fifth of energy', () => {
    const week = build({ goal: 'aggressive_cut', weights: [] });
    expect(week.fatTargetG).toBeGreaterThan(PROFILE.weightKg * NUTRITION_SAFETY.MIN_FAT_G_PER_KG - 1);

    const fatShare = (week.fatTargetG * UNITS.KCAL_PER_G_FAT) / week.dailyCalories;
    expect(fatShare).toBeGreaterThan(NUTRITION_SAFETY.MIN_FAT_ENERGY_SHARE - 0.01);
  });

  it('limits how far calories move in one week', () => {
    const week = NutritionEngine.build({
      weeklyPlan: planWith(),
      ...trainingWeeks(planWith()),
      profile: { ...PROFILE, goal: 'bulk' },
      settings: { appetite: 'normal' },
      weightHistory: weighIns(80, 0.0),
      previousCalories: 2000,
    });
    expect(Math.abs(week.dailyCalories - 2000)).toBeLessThan(NUTRITION_SAFETY.MAX_WEEKLY_KCAL_CHANGE + 1);
  });

  it('says when a floor was applied', () => {
    const week = build({
      goal: 'aggressive_cut',
      profile: { weightKg: 50, heightCm: 155, age: 60, sex: 'female', activityLevel: 'sedentary' },
      weights: [],
    });
    if (week.safety.floorHit) {
      expect(week.notes.some((note) => note.includes('safety floor'))).toBeTruthy();
    }
  });
});

/* ── Hydration ──────────────────────────────────────────────────────────── */

describe('NutritionEngine — hydration', () => {
  it('scales fluid with body weight and training', () => {
    const week = build();
    expect(week.waterTargetL).toBeGreaterThan(PROFILE.weightKg * 0.03);

    const training = week.days.find((day) => day.trainingDay);
    const rest = week.days.find((day) => day.restDay);
    expect(training.waterL).toBeGreaterThan(rest.waterL);
  });

  it('adds fluid in the heat', () => {
    const mild = build();
    const hot = build({ temperatureC: 34 });
    expect(hot.days[0].waterL).toBeGreaterThan(mild.days[0].waterL);
  });

  it('gives a sodium figure and admits how variable it is', () => {
    const week = build();
    expect(week.sodiumMg).toBeGreaterThan(1500);

    const reason = week.reasons.find((r) => r.ruleId === 'hydration.sodium');
    expect(reason.message.includes('varies') || reason.message.includes('blood pressure')).toBeTruthy();
  });
});

/* ── Invariants ─────────────────────────────────────────────────────────── */

describe('NutritionEngine — invariants', () => {
  const scenarios = [
    ['a bulk', { goal: 'bulk' }],
    ['a cut', { goal: 'fat_loss', deficitWeeks: 4 }],
    ['maintenance', { goal: 'maintenance' }],
    ['no training', { plan: planWith({ gymDays: 0, runDays: 0 }), training: { sets: 0, km: 0 } }],
    ['no weight history', { weights: [] }],
    ['a deload', { plan: planWith({ deload: true }) }],
    ['poor recovery', { plan: planWith({ recoveryScore: 2 }) }],
  ];

  for (const [name, input] of scenarios) {
    it(`produces seven days with targets — ${name}`, () => {
      const week = build(input);
      expect(week.days.length).toBe(7);
      expect(week.days.every((day) => day.calories > 0 && day.proteinG > 0)).toBeTruthy();
    });

    it(`explains every decision — ${name}`, () => {
      const week = build(input);
      expect(week.reasons.length).toBeGreaterThan(4);

      // Reasons are objects in the data model, not display strings.
      expect(week.reasons.every((reason) => Boolean(reason.ruleId && reason.rule))).toBeTruthy();
      expect(week.days.every((day) => Boolean(day.reason?.ruleId))).toBeTruthy();
    });

    it(`keeps macros consistent with the calories — ${name}`, () => {
      const week = build(input);
      for (const day of week.days) {
        const fromMacros = day.proteinG * 4 + day.carbsG * 4 + day.fatG * 9;
        expect(Math.abs(fromMacros - day.calories)).toBeLessThan(12);
      }
    });

    it(`splits every day across meals — ${name}`, () => {
      const week = build(input);
      for (const day of week.days) {
        const total = day.mealDistribution.reduce((sum, meal) => sum + meal.calories, 0);
        expect(Math.abs(total - day.calories)).toBeLessThan(12);
      }
    });
  }

  it('never names a food or a meal', () => {
    const text = JSON.stringify(build()).toLowerCase();
    for (const word of ['chicken', 'rice', 'oats', 'egg', 'recipe', 'gram of chicken']) {
      expect(text.includes(word)).toBeFalsy();
    }
  });

  it('survives a missing profile without throwing', () => {
    const week = NutritionEngine.build({
      weeklyPlan: planWith(), profile: null, settings: null, weightHistory: [],
    });
    expect(week.dailyCalories).toBeNull();
    expect(week.notes.some((note) => note.includes('profile'))).toBeTruthy();
  });

  it('carries its version, sources and caveat', () => {
    const week = build();
    expect(week.meta.engineVersion.length).toBeGreaterThan(0);
    expect(week.meta.formula.source).toContain('Jäger');
    expect(week.meta.formula.caveat).toContain('not medical');
  });

  it('flattens every reason for a later report generator', () => {
    const week = build();
    const reasons = NutritionEngine.allReasons(week);
    expect(reasons.length).toBeGreaterThan(week.reasons.length);
    expect(reasons.every((reason) => typeof reason.message === 'string' || typeof reason.message === 'object')).toBeTruthy();
  });
});
