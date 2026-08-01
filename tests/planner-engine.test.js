/**
 * Tests for the weekly planner.
 *
 * Every case is one of the six situations the planner has to get right, plus
 * the invariants that must hold for any plan it produces.
 */

import { describe, it, expect } from './runner.js';
import { PlannerEngine } from '../engines/planner-engine.js';
import { DAY_TYPE, PHASE, INTENSITY, PLANNER, LAYOFF } from '../engines/constants.js';

const TODAY = '2026-07-27';          // a Monday, so weeks line up in tests

const BASE_PROFILE = {
  startDate: '2026-07-01',
  goal: 'bulk',
  weightKg: 61, startWeightKg: 61, goalWeightKg: 74,
  heightCm: 186, age: 28, sex: 'male',
  activityLevel: 'moderate',
  availableDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  sessionStart: '18:00', sessionEnd: '19:30',
};

/** Weigh-ins ending just before the planned week, at a chosen weekly rate. */
function weighIns(startKg, ratePerWeek, count = 5, stepDays = 3) {
  const end = new Date(`${TODAY}T00:00:00Z`).getTime();
  const start = end - (count - 1) * stepDays * 86400000;
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(start + i * stepDays * 86400000).toISOString().slice(0, 10),
    kg: Number((startKg + (ratePerWeek / 7) * i * stepDays).toFixed(2)),
  }));
}

/** Gym sets logged on the given dates. */
function gymHistory(dates, perDay = 4) {
  return dates.flatMap((date) =>
    Array.from({ length: perDay }, () => ({
      date, exercise: 'x', muscle: 'quads', sets: 4, reps: 8, weightKg: 60,
    }))
  );
}

const plan = (overrides = {}) =>
  PlannerEngine.plan({ profile: BASE_PROFILE, today: TODAY, ...overrides });

/* ── Scenario 1: two training days a week ───────────────────────────────── */

describe('Planner — someone who trains two days', () => {
  const result = plan({
    profile: { ...BASE_PROFILE, availableDays: ['tue', 'sat'], trainingDays: 2 },
  });

  it('plans exactly two training days and five rest days', () => {
    expect(result.summary.gymDays + result.summary.runningDays + result.summary.mobilityDays).toBe(2);
    expect(result.summary.restDays).toBe(5);
  });

  it('gives both days to lifting rather than splitting them', () => {
    expect(result.summary.gymDays).toBe(2);
    expect(result.summary.runningDays).toBe(0);
  });

  it('explains why running was dropped', () => {
    const reason = result.reasons.find((r) => r.ruleId === 'running.none-on-short-week');
    expect(reason).toBeTruthy();
    expect(reason.message).toContain('Running is dropped');
  });

  it('only plans on the days that are available', () => {
    const training = result.days.filter((day) => day.type !== DAY_TYPE.REST);
    expect(training.every((day) => ['tue', 'sat'].includes(day.weekday))).toBeTruthy();
  });
});

/* ── Scenario 2: six training days a week ───────────────────────────────── */

describe('Planner — someone who trains six days', () => {
  const result = plan();

  it('uses the days without exceeding the consecutive-training limit', () => {
    let streak = 0;
    let longest = 0;
    for (const day of result.days) {
      streak = day.type === DAY_TYPE.REST ? 0 : streak + 1;
      longest = Math.max(longest, streak);
    }
    expect(longest).toBeLessThan(PLANNER.MAX_CONSECUTIVE_TRAINING_DAYS + 1);
  });

  it('mixes lifting and running once there are enough days', () => {
    expect(result.summary.gymDays).toBeGreaterThan(1);
    expect(result.summary.runningDays).toBeGreaterThan(0);
  });

  it('leaves at least one rest day', () => {
    expect(result.summary.restDays).toBeGreaterThan(0);
  });
});

/* ── Scenario 3: someone who travelled ──────────────────────────────────── */

describe('Planner — someone who came back from a break', () => {
  const result = plan({
    gymHistory: gymHistory(['2026-07-05', '2026-07-06']),   // three weeks ago
    runningHistory: [],
  });

  it('detects the break', () => {
    expect(result.meta.context.layoffDays).toBeGreaterThan(LAYOFF.DAYS_TO_COUNT_AS_BREAK - 1);
  });

  it('returns to a foundation week rather than resuming the block', () => {
    expect(result.phase).toBe(PHASE.FOUNDATION);
  });

  it('reduces volume on the first week back', () => {
    expect(result.summary.volumeFactor).toBeLessThan(1);
  });

  it('says why, in words a person would understand', () => {
    const reason = result.reasons.find((r) => r.ruleId === 'recovery.returning-from-break');
    expect(reason.message).toContain('without a logged session');
  });

  it('caps intensity below hard', () => {
    const lifting = result.days.filter((day) => day.type === DAY_TYPE.GYM);
    expect(lifting.every((day) => day.intensity !== INTENSITY.HARD)).toBeTruthy();
  });
});

/* ── Scenario 4: someone sleeping badly ─────────────────────────────────── */

describe('Planner — someone who slept badly', () => {
  const result = plan({
    settings: { sleepHours: 5 },
    gymHistory: gymHistory(['2026-07-20', '2026-07-22', '2026-07-24']),
  });

  it('caps intensity', () => {
    const training = result.days.filter((day) => day.type === DAY_TYPE.GYM);
    expect(training.every((day) => day.intensity !== INTENSITY.HARD)).toBeTruthy();
  });

  it('raises the sleep target back to the full eight hours', () => {
    expect(result.sleepTargetHours).toBeGreaterThan(7.9);
  });

  it('names sleep as the reason', () => {
    const reason = result.reasons.find((r) => r.ruleId === 'recovery.sleep-debt');
    expect(reason.message).toContain('5 hours of sleep');
  });

  it('registers the shortfall in the strain components', () => {
    expect(result.recovery.strainComponents.sleep).toBeGreaterThan(0);
  });
});

/* ── Scenario 5: weight is not moving ───────────────────────────────────── */

describe('Planner — someone whose weight is not rising', () => {
  const result = plan({ weightHistory: weighIns(61, 0.0) });

  it('sees the trend as below target', () => {
    expect(result.meta.context.weightTrend).toBe('below-target');
  });

  it('cuts a running day rather than adding one', () => {
    const busy = plan({ weightHistory: weighIns(61, 0.21) });
    expect(result.summary.runningDays).toBeLessThan(busy.summary.runningDays + 1);
  });

  it('explains the change in terms of the surplus', () => {
    const reason = result.reasons.find((r) => r.ruleId === 'running.cut-when-gaining-too-slowly')
      ?? result.reasons.find((r) => r.ruleId === 'gym.volume-trend-not-gaining');
    expect(reason).toBeTruthy();
    expect(reason.message.length).toBeGreaterThan(30);
  });
});

/* ── Scenario 6: weight is climbing too fast ────────────────────────────── */

describe('Planner — someone gaining too fast', () => {
  const result = plan({ weightHistory: weighIns(61, 1.2) });

  it('sees the trend as above target', () => {
    expect(result.meta.context.weightTrend).toBe('above-target');
  });

  it('adds cardio rather than removing it', () => {
    const steady = plan({ weightHistory: weighIns(61, 0.21) });
    expect(result.summary.runningDays).toBeGreaterThan(steady.summary.runningDays - 1);
  });

  it('explains that gaining faster is mostly fat', () => {
    const reason = result.reasons.find((r) => r.ruleId === 'running.add-when-gaining-too-fast');
    expect(reason.message).toContain('mostly fat');
  });
});

/* ── Deload and phases ──────────────────────────────────────────────────── */

describe('Planner — phases and deloads', () => {
  it('opens with a foundation block', () => {
    const result = plan({ profile: { ...BASE_PROFILE, startDate: TODAY } });
    expect(result.phase).toBe(PHASE.FOUNDATION);
  });

  it('drops into a recovery week on the deload cadence', () => {
    // Week 6 with the default cadence of every six weeks.
    const startDate = new Date(new Date(`${TODAY}T00:00:00Z`).getTime() - 5 * 7 * 86400000)
      .toISOString().slice(0, 10);
    const result = plan({ profile: { ...BASE_PROFILE, startDate } });

    expect(result.weekNumber).toBe(PLANNER.DELOAD_EVERY_WEEKS);
    expect(result.phase).toBe(PHASE.RECOVERY);
    expect(result.deload).toBeTruthy();
    expect(result.summary.volumeFactor).toBe(PLANNER.DELOAD_VOLUME_FACTOR);
  });

  it('keeps every lifting session easy during a deload', () => {
    const startDate = new Date(new Date(`${TODAY}T00:00:00Z`).getTime() - 5 * 7 * 86400000)
      .toISOString().slice(0, 10);
    const result = plan({ profile: { ...BASE_PROFILE, startDate } });
    const lifting = result.days.filter((day) => day.type === DAY_TYPE.GYM);
    expect(lifting.every((day) => day.intensity === INTENSITY.EASY)).toBeTruthy();
  });
});

/* ── Invariants that must hold for any plan ─────────────────────────────── */

describe('Planner — invariants', () => {
  const cases = [
    ['two days', { profile: { ...BASE_PROFILE, availableDays: ['tue', 'sat'] } }],
    ['six days', {}],
    ['no days at all', { profile: { ...BASE_PROFILE, availableDays: [] } }],
    ['no profile', { profile: null }],
    ['after a break', { gymHistory: gymHistory(['2026-06-01']) }],
    ['bad sleep', { settings: { sleepHours: 4 } }],
    ['low recovery', { recovery: { score: 2 } }],
  ];

  for (const [name, input] of cases) {
    it(`produces exactly seven dated days — ${name}`, () => {
      const result = plan(input);
      expect(result.days.length).toBe(7);
      expect(result.days.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date))).toBeTruthy();
    });

    it(`explains every decision — ${name}`, () => {
      const result = plan(input);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons.every((r) => r.message.length > 20)).toBeTruthy();
      expect(result.reasons.every((r) => Boolean(r.ruleId && r.rule))).toBeTruthy();
    });

    it(`never plans a session on an unavailable day — ${name}`, () => {
      const result = plan(input);
      const available = input.profile === null ? [] : (input.profile ?? BASE_PROFILE).availableDays;
      const training = result.days.filter((day) => day.type !== DAY_TYPE.REST);
      expect(training.every((day) => available.includes(day.weekday))).toBeTruthy();
    });
  }

  it('never returns a rest day with a duration', () => {
    const result = plan();
    const rest = result.days.filter((day) => day.type === DAY_TYPE.REST);
    expect(rest.every((day) => day.durationMin === 0)).toBeTruthy();
  });

  it('keeps the weekly calorie average on target', () => {
    const result = plan();
    const total = result.days.reduce((sum, day) => sum + day.calories, 0);
    expect(Math.round(total / 7)).toBeCloseTo(result.calories.average, -1);
  });

  it('plans nothing but rest when no days are available', () => {
    const result = plan({ profile: { ...BASE_PROFILE, availableDays: [] } });
    expect(result.summary.restDays).toBe(7);
    expect(result.notes.some((note) => note.includes('No training days'))).toBeTruthy();
  });

  it('survives a missing profile without throwing', () => {
    const result = plan({ profile: null });
    expect(result.calories.average).toBeNull();
    expect(result.days.every((day) => day.calories === null)).toBeTruthy();
  });

  it('carries its own version and formula metadata', () => {
    const result = plan();
    expect(result.meta.plannerVersion.length).toBeGreaterThan(0);
    expect(result.meta.formula.source).toContain('Issurin');
    expect(result.meta.formula.accuracy).toBe('estimate');
  });

  it('names no exercise and no food', () => {
    const text = JSON.stringify(plan()).toLowerCase();
    for (const word of ['squat', 'bench', 'deadlift', 'chicken', 'rice', 'meal ']) {
      expect(text.includes(word)).toBeFalsy();
    }
  });
});
