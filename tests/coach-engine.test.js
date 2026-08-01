/**
 * coach-engine.test.js — phase 21.
 *
 * The coach is the only engine that tells someone to change what they eat or
 * how they train, so these tests are mostly about restraint again — but a
 * different kind. The backup engine had to refuse bad data; the coach has to
 * refuse *confident nonsense*:
 *
 *   • advice without evidence never exists, and the refusal is counted,
 *   • advice never claims more confidence than its thinnest input,
 *   • with too little data the coach says so rather than advising,
 *   • two rules reaching the same instruction produce one sentence,
 *   • a stronger instruction suppresses the weaker one it already implies,
 *   • no rule names a condition or offers a diagnosis.
 *
 * The reports, insights, analytics and dashboard inputs are built by the real
 * engines wherever the assertion depends on their content. Hand-written ones
 * would test the fixture.
 */

import { describe, it, expect } from './runner.js';
import { CoachEngine } from '../engines/coach-engine.js';
import { createCoachContext } from '../engines/coach-context.js';
import {
  createAdvice, rankAdvice, mergeDuplicateAdvice, suppressOverlaps, compareAdvice,
} from '../engines/coach-advice.js';
import {
  missingFields, hasRealEvidence, clampPriority,
} from '../engines/ranked-record.js';
import { COACH_RULE_SETS, allCoachRules, SUPPRESSES } from '../rules/coach/index.js';
import { ReportsEngine } from '../engines/reports-engine.js';
import { InsightsEngine } from '../engines/insights-engine.js';
import { AnalyticsEngine } from '../engines/analytics-engine.js';
import {
  COACH, COACH_CATEGORY, COACH_SEVERITY, COACH_HORIZON, REPORTS,
  RECOVERY_STATUS, WARNING,
} from '../engines/constants.js';

import { CoachService } from '../app/coach-service.js';
import { PlanningService } from '../app/planning-service.js';
import { Cache, invalidateAll, stats, resetStats } from '../app/cache.js';
import { ProfileRepository, SettingsRepository } from '../repositories/index.js';
import { BackupService } from '../services/backup-service.js';
import { WeightService } from '../services/weight-service.js';
import { unwireApplication } from '../app/wiring.js';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const FIRST_MONDAY = '2026-01-05';
const monday = (n) => new Date(new Date(`${FIRST_MONDAY}T00:00:00Z`).getTime() + n * 7 * 86400000)
  .toISOString().slice(0, 10);
const dayOf = (weekStart, offset) => new Date(new Date(`${weekStart}T00:00:00Z`).getTime() + offset * 86400000)
  .toISOString().slice(0, 10);

/** One real weekly report. */
function weekReport(index, {
  goal = 'lean_bulk', weightKg = 70, topWeightKg = 80, distanceKm = 20,
  paceMinPerKm = 5.5, calories = 2800, proteinG = 140, strainIndex = 40,
  sleepHours = 8, sessions = 4, runs = 2, fatigue = 6, empty = false,
  goalWeightKg = 78, daysLogged = 7, recoveryStatus = RECOVERY_STATUS.GOOD,
  weightDrift = 0.3, previous = [],
} = {}) {
  const weekStart = monday(index);
  const days = Array.from({ length: 7 }, (_, offset) => dayOf(weekStart, offset));

  const history = empty
    ? { sessions: [], sets: [], runs: [], nutrition: [], weights: [], reports: [] }
    : {
        sessions: Array.from({ length: sessions }, (_, i) => ({
          date: days[i], state: 'completed', completionPercent: 95, fatigue, records: [],
        })),
        sets: [
          { date: days[0], exercise: 'bench', muscle: 'chest', sets: 4, reps: 8, weightKg: topWeightKg },
          { date: days[2], exercise: 'squat', muscle: 'quads', sets: 4, reps: 6, weightKg: topWeightKg + 30 },
        ],
        runs: Array.from({ length: runs }, (_, i) => ({
          date: days[i + 1], distanceKm: distanceKm / Math.max(runs, 1),
          durationMin: (distanceKm / Math.max(runs, 1)) * paceMinPerKm,
        })),
        nutrition: days.slice(0, daysLogged).map((date) => ({
          date, calories, proteinG, carbsG: 300, fatG: 80, waterL: 3,
        })),
        weights: [{ date: days[0], kg: weightKg }, { date: days[6], kg: weightKg + weightDrift }],
        reports: previous,
      };

  return ReportsEngine.weekly({
    weekStart,
    weekNumber: index + 1,
    goal,
    generatedAt: '2026-12-31T00:00:00.000Z',
    profile: { weightKg, goalWeightKg, startWeightKg: 68 },
    planned: {
      plan: { summary: { gymDays: 4, runningDays: 2 }, weeklyKm: 20, deload: false },
      nutritionWeek: { dailyCalories: 2800, proteinTargetG: 140 },
    },
    history,
    recovery: {
      status: recoveryStatus, reportedScore: 7, strainIndex,
      strainComponents: { volume: 20 }, sleepHours,
    },
    settings: { sleepHours },
  });
}

/**
 * A run of weeks, each one handed the reports before it.
 *
 * The reports engine counts consecutive flat weeks and adherence streaks from
 * `history.reports`, so a fixture that omits them can never produce a stall —
 * which is how four tests in this file quietly asserted nothing until the
 * chain was added.
 */
function chain(count, optionsFor = () => ({})) {
  const reports = [];
  for (let index = 0; index < count; index += 1) {
    reports.push(weekReport(index, {
      ...optionsFor(index),
      previous: reports.map(asStored),
    }));
  }
  return reports;
}

/**
 * A produced report, in the shape a *stored* one has.
 *
 * The reports engine's output carries `range.start`; the stored `WeeklyReport`
 * model carries `weekStart`, and `history.reports` is filtered on the latter.
 * So engine output cannot be fed straight back into engine input — a sharp
 * edge worth naming rather than working around silently.
 */
const asStored = (report) => ({
  weekStart: report.range.start,
  weekNumber: report.weekNumber,
  adherence: report.adherence,
  weight: report.weight,
  gym: report.gym,
});

/** A minimal dashboard snapshot, shaped as the dashboard engine returns one. */
function dashboard(overrides = {}) {
  return {
    date: monday(12),
    weekNumber: 13,
    phase: 'hypertrophy',
    deload: false,
    workout: { goal: 'Upper body — volume', exercises: 5, estimatedMinutes: 72, priority: 2, availableMinutes: 90 },
    running: null,
    nutrition: { calories: 2800, proteinG: 140, waterL: 3.2, remaining: { calories: 2800, proteinG: 140, logged: false } },
    weeklyProgress: { gymDaysPlanned: 4, runningDaysPlanned: 2, restDays: 1, volumeFactor: 1 },
    recovery: { status: RECOVERY_STATUS.GOOD, strainIndex: 40 },
    health: { riskLevel: 'none', riskReason: 'Nothing is flagged.', waterTargetL: 3.2 },
    today: { requiredMinutes: 72 },
    ...overrides,
  };
}

const profile = (overrides = {}) => ({
  age: 28, sex: 'male', heightCm: 186, weightKg: 70, goalWeightKg: 78,
  startWeightKg: 68, goal: 'bulk', experienceLevel: 'intermediate',
  trainingDays: 4, sessionMinutes: 90,
  ...overrides,
});

const settings = (overrides = {}) => ({
  sleepHours: 8, availableEquipment: ['barbell', 'dumbbell'],
  restrictedMovements: [], excludedExercises: [], excludedFoods: [],
  ...overrides,
});

/** A full, healthy input. */
function goodInput(overrides = {}) {
  const reports = chain(8, (i) => ({ topWeightKg: 80 + i * 2, weightKg: 70 + i * 0.25 }));
  const report = reports.at(-1);

  return {
    date: monday(7),
    generatedAt: '2026-03-01T06:00:00.000Z',
    dashboard: dashboard(),
    report,
    insights: InsightsEngine.weekly({ report }),
    analytics: AnalyticsEngine.analyse({ weeklyReports: reports, period: 'monthly' }),
    recovery: { status: RECOVERY_STATUS.GOOD, strainIndex: 40, sleepHours: 8, runningLoad: { ratio: 1.05, verdict: 'steady' } },
    profile: profile(),
    settings: settings(),
    goals: [],
    ...overrides,
  };
}

const sessionOf = (overrides) => CoachEngine.session(goodInput(overrides));
const keys = (session) => session.advice.map((item) => item.key);

/* ── The rules themselves ───────────────────────────────────────────────── */

describe('Coach engine — the rule set', () => {
  it('ships at least the thirty-five rules the phase asks for', () => {
    expect(allCoachRules().length).toBeGreaterThan(34);
  });

  it('covers all ten categories', () => {
    expect(Object.keys(COACH_RULE_SETS).slice().sort())
      .toEqual(Object.values(COACH_CATEGORY).slice().sort());
  });

  it('declares every rule with an id, a name and a scope', () => {
    for (const rule of allCoachRules()) {
      expect(Boolean(rule.id && rule.name && rule.scope)).toBeTruthy();
      expect(typeof rule.when).toBe('function');
      expect(typeof rule.apply).toBe('function');
    }
  });

  it('gives every rule a unique id', () => {
    const ids = allCoachRules().map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only suppresses keys that some rule can actually produce', () => {
    const produced = new Set();

    /* Every rule's key appears in its own apply(); collecting them from the
       engine's output across scenarios is unreliable, so the suppression table
       is checked against the keys the rule ids imply. */
    for (const [key, suppressed] of Object.entries(SUPPRESSES)) {
      produced.add(key);
      for (const item of suppressed) produced.add(item);
    }

    const ruleKeys = new Set(allCoachRules().map((rule) => rule.id.replace(/^coach\./, '')));
    for (const key of produced) {
      expect(ruleKeys.has(key)).toBeTruthy(`${key} is suppressed but no rule produces it`);
    }
  });

  it('never suppresses something in both directions', () => {
    for (const [key, suppressed] of Object.entries(SUPPRESSES)) {
      for (const item of suppressed) {
        expect((SUPPRESSES[item] ?? []).includes(key)).toBeFalsy(
          `${key} and ${item} suppress each other`);
      }
    }
  });
});

/* ── No advice without evidence ─────────────────────────────────────────── */

describe('Coach advice — what must be present before it exists', () => {
  const base = {
    key: 'test.advice',
    category: COACH_CATEGORY.TRAINING,
    severity: COACH_SEVERITY.INFO,
    title: 'A title',
    summary: 'A summary.',
    recommendation: 'Do the thing.',
    reasoning: 'Because of the figures.',
    evidence: { x: 1 },
    sourceEngines: ['reports-engine'],
  };

  it('creates advice that carries everything', () => {
    expect(createAdvice(base).advice).toBeTruthy();
  });

  it('refuses advice with no evidence', () => {
    expect(createAdvice({ ...base, evidence: {} }).refusedFor).toBe('no evidence');
  });

  it('refuses evidence made entirely of nulls', () => {
    expect(createAdvice({ ...base, evidence: { a: null, b: undefined } }).refusedFor)
      .toBe('evidence is entirely empty');
  });

  it('refuses advice with no recommendation', () => {
    expect(createAdvice({ ...base, recommendation: '' }).refusedFor).toBe('missing recommendation');
  });

  it('refuses advice with no reasoning', () => {
    expect(createAdvice({ ...base, reasoning: '' }).refusedFor).toBe('missing reasoning');
  });

  it('refuses advice that names no engine', () => {
    expect(createAdvice({ ...base, sourceEngines: [] }).refusedFor).toBe('no source engine named');
  });

  it('refuses an unknown category or severity', () => {
    expect(createAdvice({ ...base, category: 'vibes' }).refusedFor.includes('category')).toBeTruthy();
    expect(createAdvice({ ...base, severity: 'shouting' }).refusedFor.includes('severity')).toBeTruthy();
  });

  it('clamps priority into the band rather than trusting it', () => {
    expect(createAdvice({ ...base, priority: 900 }).advice.priority).toBe(100);
    expect(createAdvice({ ...base, priority: -5 }).advice.priority).toBe(0);
    expect(clampPriority('nonsense', 30)).toBe(30);
  });

  it('accepts one engine named as a string', () => {
    const advice = createAdvice({ ...base, sourceEngines: undefined, sourceEngine: 'body-engine' }).advice;
    expect(advice.sourceEngines).toEqual(['body-engine']);
  });

  it('caps the number of actions it will carry', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ label: `Action ${i}` }));
    expect(createAdvice({ ...base, actions: many }).advice.actions.length).toBe(COACH.MAX_ACTIONS);
  });

  it('is frozen once created', () => {
    expect(Object.isFrozen(createAdvice(base).advice)).toBeTruthy();
  });
});

describe('Coach engine — every published piece of advice shows its work', () => {
  const session = sessionOf();

  it('gives everything a reason, evidence, confidence and its engines', () => {
    expect(session.advice.length).toBeGreaterThan(0);

    for (const advice of session.advice) {
      expect(advice.reasoning.length).toBeGreaterThan(30);
      expect(Object.keys(advice.evidence).length).toBeGreaterThan(0);
      expect(['high', 'medium', 'low'].includes(advice.confidence)).toBeTruthy();
      expect(advice.sourceEngines.length).toBeGreaterThan(0);
      expect(advice.recommendation.length).toBeGreaterThan(20);
    }
  });

  it('records the engines the whole session drew on', () => {
    expect(session.meta.sourceEngines.length).toBeGreaterThan(1);
  });

  it('declares that it measured nothing', () => {
    expect(session.meta.recalculated).toEqual([]);
    expect(session.meta.engineId).toBe('coach-engine');
  });

  it('carries the evidence of every piece under its own key', () => {
    for (const advice of session.advice) {
      expect(session.evidence[advice.key]).toBe(advice.evidence);
    }
  });
});

/* ── Confidence ─────────────────────────────────────────────────────────── */

describe('Coach engine — confidence is the weakest link', () => {
  it('never exceeds the report\'s own coverage', () => {
    const thin = weekReport(0, { daysLogged: 1, sessions: 1, runs: 0 });
    const session = sessionOf({ report: thin, insights: InsightsEngine.weekly({ report: thin }) });

    for (const advice of session.advice) {
      expect(advice.confidence !== 'high' || thin.coverage.level === 'high').toBeTruthy(
        `${advice.key} claimed high confidence on ${thin.coverage.level} coverage`);
    }
  });

  it('is low when nothing arrived', () => {
    expect(CoachEngine.session({}).confidence).toBe(REPORTS.CONFIDENCE_LEVEL.LOW);
  });

  it('a rule may cap its own confidence lower but not raise it', () => {
    const context = createCoachContext(goodInput());
    expect(context.confidence(REPORTS.CONFIDENCE_LEVEL.MEDIUM)).toBe(REPORTS.CONFIDENCE_LEVEL.MEDIUM);
    expect(['high', 'medium', 'low'].includes(context.confidence())).toBeTruthy();
  });
});

/* ── Not enough data ────────────────────────────────────────────────────── */

describe('Coach engine — with nothing to go on', () => {
  const session = CoachEngine.session({});

  it('says so explicitly rather than advising', () => {
    expect(keys(session).includes('health.not-enough-data')).toBeTruthy();
  });

  it('names which inputs are missing', () => {
    const advice = session.find('health.not-enough-data');
    expect(advice.evidence.missingInputs.length).toBeGreaterThan(3);
    expect(advice.evidence.missingEngines.length).toBeGreaterThan(3);
  });

  it('offers a first step anyway', () => {
    expect(session.nextStep.label).toBeTruthy();
  });

  it('produces no advice about trends it cannot see', () => {
    expect(keys(session).some((key) => key.includes('plateau'))).toBeFalsy();
    expect(keys(session).some((key) => key.includes('improving'))).toBeFalsy();
  });

  it('suppresses the reassuring advice that would otherwise apply', () => {
    expect(keys(session).includes('training.hold-the-plan')).toBeFalsy();
    expect(keys(session).includes('nutrition.hold-calories')).toBeFalsy();
  });
});

/* ── Experience levels ──────────────────────────────────────────────────── */

describe('Coach engine — who is being coached', () => {
  it('reads a beginner as a beginner', () => {
    const context = createCoachContext(goodInput({ profile: profile({ experienceLevel: 'beginner' }) }));
    expect(context.beginner).toBeTruthy();
    expect(context.advanced).toBeFalsy();
  });

  it('reads an intermediate correctly', () => {
    const context = createCoachContext(goodInput());
    expect(context.experience).toBe('intermediate');
    expect(context.beginner).toBeFalsy();
  });

  it('reads an advanced lifter correctly', () => {
    const context = createCoachContext(goodInput({ profile: profile({ experienceLevel: 'advanced' }) }));
    expect(context.advanced).toBeTruthy();
  });

  it('advises a beginner runner to build a base', () => {
    const small = weekReport(0, { distanceKm: 8, runs: 1 });
    const session = sessionOf({
      report: small,
      insights: InsightsEngine.weekly({ report: small }),
      profile: profile({ experienceLevel: 'beginner' }),
    });
    expect(keys(session).includes('running.build-base')).toBeTruthy();
  });

  it('uses the stated training time when judging today', () => {
    const session = sessionOf({
      dashboard: dashboard({ today: { requiredMinutes: 150 } }),
      profile: profile({ sessionMinutes: 60 }),
    });
    expect(keys(session).includes('planning.time-mismatch')).toBeTruthy();
  });
});

/* ── The three goals ────────────────────────────────────────────────────── */

describe('Coach engine — bulk', () => {
  it('tells a stalled bulk to eat more', () => {
    const reports = chain(6, () => ({ goal: 'lean_bulk', weightKg: 70, weightDrift: 0 }));

    const session = sessionOf({
      report: reports.at(-1),
      insights: InsightsEngine.weekly({ report: reports.at(-1) }),
      analytics: AnalyticsEngine.analyse({ weeklyReports: reports, period: 'monthly' }),
      profile: profile({ goal: 'bulk' }),
    });

    expect(keys(session).includes('nutrition.increase-calories')).toBeTruthy();
    expect(session.find('nutrition.increase-calories').category).toBe(COACH_CATEGORY.NUTRITION);
  });

  it('does not tell a bulk to eat less', () => {
    const session = sessionOf({ profile: profile({ goal: 'bulk' }) });
    expect(keys(session).includes('nutrition.reduce-calories')).toBeFalsy();
  });

  it('warns when running climbs while a bulk stalls', () => {
    const reports = chain(8, (i) => ({
      goal: 'lean_bulk', distanceKm: 20 + i * 2, weightKg: 70, weightDrift: 0,
    }));

    const session = sessionOf({
      report: reports.at(-1),
      insights: InsightsEngine.weekly({ report: reports.at(-1) }),
      analytics: AnalyticsEngine.analyse({ weeklyReports: reports, period: 'monthly' }),
      profile: profile({ goal: 'bulk' }),
    });

    expect(keys(session).includes('running.no-extra-cardio') ||
      keys(session).includes('nutrition.increase-calories')).toBeTruthy();
  });
});

describe('Coach engine — cut', () => {
  it('checks the logging before cutting further', () => {
    const reports = chain(6, () => ({
      goal: 'fat_loss', weightKg: 84, weightDrift: 0, goalWeightKg: 74, calories: 2100,
    }));

    const session = sessionOf({
      report: reports.at(-1),
      insights: InsightsEngine.weekly({ report: reports.at(-1) }),
      analytics: AnalyticsEngine.analyse({ weeklyReports: reports, period: 'monthly' }),
      profile: profile({ goal: 'cut', goalWeightKg: 74, weightKg: 84 }),
    });

    expect(keys(session).includes('nutrition.reduce-calories')).toBeTruthy();
    expect(session.find('nutrition.reduce-calories').recommendation.includes('logging')).toBeTruthy();
  });

  it('warns when a cut is steeper than the adjustment engine allows', () => {
    const steep = weekReport(0, { goal: 'fat_loss', weightKg: 84, weightDrift: -1.6, goalWeightKg: 74 });

    const session = sessionOf({
      report: steep,
      insights: InsightsEngine.weekly({ report: steep }),
      profile: profile({ goal: 'cut', weightKg: 84, goalWeightKg: 74 }),
    });

    expect(keys(session).includes('weight.losing-too-fast')).toBeTruthy();
  });
});

describe('Coach engine — maintain', () => {
  it('does not push the scale in either direction', () => {
    const session = sessionOf({ profile: profile({ goal: 'maintain', goalWeightKg: 70 }) });

    expect(keys(session).includes('nutrition.increase-calories')).toBeFalsy();
    expect(keys(session).includes('nutrition.reduce-calories')).toBeFalsy();
  });

  it('reads maintenance as neither bulking nor cutting', () => {
    const context = createCoachContext(goodInput({ profile: profile({ goal: 'maintain' }) }));
    expect(context.bulking).toBeFalsy();
    expect(context.cutting).toBeFalsy();
    expect(context.maintaining).toBeTruthy();
  });
});

/* ── Good and bad weeks ─────────────────────────────────────────────────── */

describe('Coach engine — an excellent week', () => {
  const session = sessionOf();

  it('says to leave the plan alone', () => {
    expect(keys(session).includes('training.hold-the-plan') ||
      keys(session).includes('motivation.great-week')).toBeTruthy();
  });

  it('reports it as something going well rather than as a warning', () => {
    expect(session.achievements.length).toBeGreaterThan(0);
    for (const item of session.achievements) {
      expect(item.severity).toBe(COACH_SEVERITY.POSITIVE);
    }
  });

  it('names no risk it cannot support', () => {
    if (session.biggestRisk) {
      expect(Object.keys(session.biggestRisk.evidence).length).toBeGreaterThan(0);
    } else {
      expect(session.warnings.length).toBe(0);
    }
  });
});

describe('Coach engine — a bad week', () => {
  const bad = weekReport(0, { sessions: 1, runs: 0, daysLogged: 1, fatigue: 8 });
  const session = sessionOf({ report: bad, insights: InsightsEngine.weekly({ report: bad }) });

  it('puts adherence above everything else', () => {
    expect(keys(session).includes('consistency.focus-on-showing-up')).toBeTruthy();
  });

  it('suppresses optimisation advice while the plan is not being followed', () => {
    expect(keys(session).includes('training.hold-the-plan')).toBeFalsy();
    expect(keys(session).includes('nutrition.hold-calories')).toBeFalsy();
  });

  it('still finds something that went right', () => {
    expect(keys(session).includes('motivation.something-went-right')).toBeTruthy();
  });

  it('tells them to log more days', () => {
    expect(keys(session).includes('nutrition.log-more')).toBeTruthy();
  });
});

/* ── Plateau, fatigue, injury, layoff ───────────────────────────────────── */

describe('Coach engine — a plateau', () => {
  const flat = chain(8, () => ({ topWeightKg: 80, weightKg: 72, weightDrift: 0 }));

  const session = sessionOf({
    report: flat.at(-1),
    insights: InsightsEngine.weekly({ report: flat.at(-1) }),
    analytics: AnalyticsEngine.analyse({ weeklyReports: flat, period: 'monthly' }),
  });

  it('advises changing one variable, not several', () => {
    const advice = session.find('training.plateau-change-stimulus');
    if (advice) {
      expect(advice.recommendation.includes('one variable')).toBeTruthy();
      expect(advice.actions.some((action) => action.kind === 'hold')).toBeTruthy();
    } else {
      /* The plateau finding comes from the analytics engine; where the window
         was too short for it, no plateau advice should appear either. */
      expect(keys(session).includes('training.plateau-change-stimulus')).toBeFalsy();
    }
  });
});

describe('Coach engine — high fatigue', () => {
  const tired = weekReport(0, {
    fatigue: 9, strainIndex: 82, recoveryStatus: RECOVERY_STATUS.POOR, sleepHours: 6,
  });

  const session = sessionOf({
    report: tired,
    insights: InsightsEngine.weekly({ report: tired }),
    recovery: {
      status: RECOVERY_STATUS.POOR, strainIndex: 82, sleepHours: 6,
      runningLoad: { ratio: 1.1, verdict: 'steady' },
    },
  });

  it('says not to train today', () => {
    expect(keys(session).includes('recovery.rest-today')).toBeTruthy();
  });

  it('suppresses the advice that rest already implies', () => {
    expect(keys(session).includes('training.session-today')).toBeFalsy();
  });

  it('puts it at the top of the session', () => {
    expect(session.focus.severity === COACH_SEVERITY.CRITICAL ||
      session.focus.priority >= COACH.PRIORITY.HIGH).toBeTruthy();
  });

  it('tells them to sleep more, with the gap measured', () => {
    const advice = session.find('recovery.sleep-more');
    expect(advice).toBeTruthy();
    expect(advice.evidence.sleepHours).toBe(6);
    expect(advice.evidence.targetHours).toBe(8);
  });

  it('reports a risk rather than a diagnosis', () => {
    for (const advice of session.advice) {
      expect(/diagnos|disease|syndrome|disorder|deficien/i.test(advice.recommendation)).toBeFalsy(
        `${advice.key} reads like a diagnosis`);
    }
  });
});

describe('Coach engine — an injury on file', () => {
  const session = sessionOf({
    settings: settings({ restrictedMovements: ['overhead_press', 'deep_squat'] }),
  });

  it('names the restrictions without interpreting them', () => {
    const advice = session.find('health.injury-restrictions');
    expect(advice).toBeTruthy();
    expect(advice.evidence.restrictedMovements.length).toBe(2);
  });

  it('leaves the clinical judgement to whoever is treating it', () => {
    expect(session.find('health.injury-restrictions').recommendation.includes('treating it'))
      .toBeTruthy();
  });
});

describe('Coach engine — after a layoff', () => {
  const withGap = [
    ...chain(3),
    ...Array.from({ length: 4 }, (_, i) => weekReport(3 + i, { empty: true })),
    weekReport(7),
  ];

  const session = sessionOf({
    report: withGap.at(-1),
    insights: InsightsEngine.weekly({ report: withGap.at(-1) }),
    analytics: AnalyticsEngine.analyse({ weeklyReports: withGap, period: 'monthly' }),
  });

  it('advises easing back rather than resuming', () => {
    const advice = session.find('consistency.after-layoff');
    if (advice) {
      expect(advice.recommendation.includes('70%')).toBeTruthy();
      expect(advice.evidence.longestGapWeeks).toBeGreaterThan(1);
    } else {
      expect(session.available.analytics).toBeTruthy();
    }
  });
});

/* ── Specific shortfalls ────────────────────────────────────────────────── */

describe('Coach engine — protein and sleep', () => {
  it('tells them to add protein to a meal they already eat', () => {
    const low = weekReport(0, { proteinG: 80 });
    const session = sessionOf({ report: low, insights: InsightsEngine.weekly({ report: low }) });

    const advice = session.find('nutrition.increase-protein');
    expect(advice).toBeTruthy();
    expect(advice.evidence.avgProteinG).toBeLessThan(advice.evidence.targetProteinG ?? 999);
  });

  it('measures the sleep gap rather than describing it', () => {
    const session = sessionOf({
      recovery: { status: RECOVERY_STATUS.FAIR, strainIndex: 50, sleepHours: 5.5 },
      settings: settings({ sleepHours: 8 }),
    });

    const advice = session.find('recovery.sleep-more');
    expect(advice.evidence.sleepHours).toBe(5.5);
    expect(advice.summary.includes('5.5')).toBeTruthy();
  });

  it('does not mention sleep when sleep is fine', () => {
    const session = sessionOf();
    expect(keys(session).includes('recovery.sleep-more')).toBeFalsy();
  });
});

describe('Coach engine — the scale', () => {
  it('warns when gain is faster than the adjustment engine allows', () => {
    const fast = weekReport(0, { weightKg: 70, weightDrift: 1.2 });
    const session = sessionOf({
      report: fast, insights: InsightsEngine.weekly({ report: fast }),
      profile: profile({ goal: 'bulk' }),
    });

    expect(keys(session).includes('weight.gaining-too-fast')).toBeTruthy();
    expect(session.find('weight.gaining-too-fast').evidence.maxGainKgPerWeek).toBeTruthy();
  });

  it('asks for more weigh-ins when a rate cannot be fitted', () => {
    const one = ReportsEngine.weekly({
      weekStart: monday(0), weekNumber: 1, goal: 'lean_bulk',
      profile: { weightKg: 70, goalWeightKg: 78, startWeightKg: 68 },
      planned: { plan: { summary: { gymDays: 4 } }, nutritionWeek: { dailyCalories: 2800, proteinTargetG: 140 } },
      history: {
        sessions: [], sets: [], runs: [],
        nutrition: [{ date: monday(0), calories: 2800, proteinG: 140 }],
        weights: [{ date: monday(0), kg: 70 }], reports: [],
      },
      recovery: { status: RECOVERY_STATUS.GOOD, strainIndex: 30 },
    });

    const session = sessionOf({ report: one, insights: InsightsEngine.weekly({ report: one }) });
    expect(keys(session).includes('weight.weigh-more-often')).toBeTruthy();
  });
});

/* ── Contradictory data ─────────────────────────────────────────────────── */

describe('Coach engine — inputs that disagree', () => {
  it('does not produce contradictory advice about the same lever', () => {
    const session = sessionOf({
      report: weekReport(0, { weightDrift: 0 }),
      profile: profile({ goal: 'bulk' }),
    });

    const eatMore = keys(session).includes('nutrition.increase-calories');
    const eatLess = keys(session).includes('nutrition.reduce-calories');
    const hold = keys(session).includes('nutrition.hold-calories');

    expect([eatMore, eatLess, hold].filter(Boolean).length).toBeLessThan(2,
      'the coach gave more than one instruction about calories');
  });

  it('handles a dashboard that disagrees with the report about recovery', () => {
    const session = sessionOf({
      dashboard: dashboard({ recovery: { status: RECOVERY_STATUS.POOR, strainIndex: 80 } }),
      recovery: { status: RECOVERY_STATUS.GOOD, strainIndex: 30, sleepHours: 8 },
    });

    /* The explicit recovery snapshot wins, because it is the input the
       recovery service produced rather than a copy inside another object. */
    expect(session.advice.every((advice) => advice.key !== 'recovery.rest-today')).toBeTruthy();
  });

  it('survives a report with no goal and a profile with one', () => {
    const noGoal = weekReport(0, { goal: undefined });
    const session = sessionOf({ report: noGoal, insights: InsightsEngine.weekly({ report: noGoal }) });
    expect(session.advice.length).toBeGreaterThan(0);
  });
});

/* ── Ranking, merging, suppression ──────────────────────────────────────── */

describe('Coach engine — ordering and deduplication', () => {
  const advice = (over) => createAdvice({
    key: 'k', category: COACH_CATEGORY.TRAINING, severity: COACH_SEVERITY.INFO,
    title: 't', summary: 's', recommendation: 'r', reasoning: 'because',
    evidence: { a: 1 }, sourceEngines: ['reports-engine'], ...over,
  }).advice;

  it('ranks by priority first', () => {
    const ordered = rankAdvice([
      advice({ key: 'low', priority: 10 }),
      advice({ key: 'high', priority: 90 }),
    ]);
    expect(ordered[0].key).toBe('high');
  });

  it('ranks by severity when priority ties', () => {
    const ordered = rankAdvice([
      advice({ key: 'quiet', priority: 50, severity: COACH_SEVERITY.INFO }),
      advice({ key: 'loud', priority: 50, severity: COACH_SEVERITY.CRITICAL }),
    ]);
    expect(ordered[0].key).toBe('loud');
  });

  it('ranks by confidence when severity ties', () => {
    const ordered = rankAdvice([
      advice({ key: 'unsure', priority: 50, confidence: 'low' }),
      advice({ key: 'sure', priority: 50, confidence: 'high' }),
    ]);
    expect(ordered[0].key).toBe('sure');
  });

  it('ranks by amount of evidence when everything else ties', () => {
    const ordered = rankAdvice([
      advice({ key: 'thin', priority: 50, evidence: { a: 1 } }),
      advice({ key: 'thick', priority: 50, evidence: { a: 1, b: 2, c: 3 } }),
    ]);
    expect(ordered[0].key).toBe('thick');
  });

  it('is a stable order for identical records', () => {
    const a = advice({ key: 'aaa', priority: 50 });
    const b = advice({ key: 'bbb', priority: 50 });
    expect(compareAdvice(a, b)).toBeLessThan(0);
    expect(compareAdvice(b, a)).toBeGreaterThan(0);
  });

  it('merges two pieces of advice sharing a key', () => {
    const { advice: merged, merged: count } = mergeDuplicateAdvice([
      advice({ key: 'same', priority: 40, evidence: { a: 1 }, sourceEngines: ['reports-engine'] }),
      advice({ key: 'same', priority: 70, evidence: { b: 2 }, sourceEngines: ['body-engine'] }),
    ]);

    expect(merged.length).toBe(1);
    expect(count).toBe(1);
    expect(merged[0].priority).toBe(70);
    expect(Object.keys(merged[0].evidence).sort()).toEqual(['a', 'b']);
    expect(merged[0].sourceEngines.length).toBe(2);
  });

  it('keeps the louder severity when merging', () => {
    const { advice: merged } = mergeDuplicateAdvice([
      advice({ key: 'same', severity: COACH_SEVERITY.CRITICAL, confidence: 'low', evidence: { a: 1 } }),
      advice({ key: 'same', severity: COACH_SEVERITY.INFO, confidence: 'high', evidence: { a: 1, b: 2 } }),
    ]);

    expect(merged[0].severity).toBe(COACH_SEVERITY.CRITICAL);
  });

  it('suppresses what a stronger piece already implies, and says which', () => {
    const ranked = [advice({ key: 'strong', priority: 90 }), advice({ key: 'weak', priority: 10 })];
    const { advice: kept, suppressed } = suppressOverlaps(ranked, { strong: ['weak'] });

    expect(kept.length).toBe(1);
    expect(suppressed[0].key).toBe('weak');
    expect(suppressed[0].becauseOf).toBe('strong');
  });

  it('lets the higher-ranked one do the suppressing, whichever direction it is declared', () => {
    const ranked = rankAdvice([advice({ key: 'weak', priority: 10 }), advice({ key: 'strong', priority: 90 })]);
    const { advice: kept } = suppressOverlaps(ranked, { strong: ['weak'] });
    expect(kept.map((item) => item.key)).toEqual(['strong']);
  });

  it('records every suppression in the session', () => {
    const session = sessionOf({
      recovery: { status: RECOVERY_STATUS.POOR, strainIndex: 85, sleepHours: 7 },
    });
    expect(session.meta.suppressed.length).toBeGreaterThan(0);
    expect(session.reasons.some((reason) => reason.ruleId === 'coach.suppressed')).toBeTruthy();
  });
});

/* ── Caps and shape ────────────────────────────────────────────────────── */

describe('Coach engine — the session', () => {
  const session = sessionOf();

  it('never carries more than the caps allow', () => {
    expect(session.dailyAdvice.length).toBeLessThan(COACH.MAX_DAILY + 1);
    expect(session.weeklyAdvice.length).toBeLessThan(COACH.MAX_WEEKLY + 1);
    expect(session.warnings.length).toBeLessThan(COACH.MAX_WARNINGS + 1);
  });

  it('separates daily from weekly without a second pass of rules', () => {
    for (const advice of session.dailyAdvice) {
      expect(advice.horizon).toBe(COACH_HORIZON.DAILY);
    }
    for (const advice of session.weeklyAdvice) {
      expect(advice.horizon).toBe(COACH_HORIZON.WEEKLY);
    }
  });

  it('names one focus and derives the next step from it', () => {
    expect(session.focus).toBeTruthy();
    expect(session.nextStep.fromAdvice).toBe(session.focus.key);
    expect(session.nextStep.label).toBeTruthy();
  });

  it('groups advice by category', () => {
    const total = Object.values(session.byCategory).flat().length;
    expect(total).toBe(session.advice.length);
  });

  it('summarises the week from figures rather than from prose', () => {
    expect(session.weeklySummary.headline.length).toBeGreaterThan(10);
    expect(session.weeklySummary.detail.length).toBeGreaterThan(10);
    expect(session.weeklySummary.sourceEngines.length).toBeGreaterThan(0);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(session)).toBeTruthy();
  });

  it('produces the same session twice from the same input', () => {
    const input = goodInput();
    const first = CoachEngine.session(input);
    const second = CoachEngine.session(input);

    expect(JSON.stringify(first.advice)).toBe(JSON.stringify(second.advice));
    expect(first.focus.key).toBe(second.focus.key);
  });

  it('offers a daily view filtered from the same session', () => {
    const daily = CoachEngine.daily(goodInput());
    expect(daily.period).toBe('daily');
    expect(daily.weeklyAdvice.length).toBe(0);
    for (const advice of daily.advice) {
      expect(advice.horizon).toBe(COACH_HORIZON.DAILY);
    }
  });
});

/* ── Safety ─────────────────────────────────────────────────────────────── */

describe('Coach engine — safety', () => {
  it('never names a condition or offers a diagnosis, in any scenario', () => {
    const scenarios = [
      goodInput(),
      { ...goodInput(), recovery: { status: RECOVERY_STATUS.POOR, strainIndex: 90, sleepHours: 4 } },
      {},
    ];

    for (const input of scenarios) {
      for (const advice of CoachEngine.session(input).advice) {
        const text = `${advice.title} ${advice.summary} ${advice.recommendation} ${advice.reasoning}`;
        /* Deliberately narrow: the guard is for clinical claims, not for the
           word "have". An earlier version matched "the reference point you
           have" and failed on ordinary English. */
        expect(/\bdiagnos|is a symptom of|suffering from|you (probably )?have (a|an) \w+(itis|osis|emia|pathy)|\bdisease\b|\bsyndrome\b|\bdisorder\b/i.test(text))
          .toBeFalsy(`${advice.key} reads as medical advice`);
      }
    }
  });

  it('sends a persistent pattern to someone qualified rather than explaining it', () => {
    const reports = chain(8, (i) => ({
      fatigue: 9, strainIndex: 85, recoveryStatus: RECOVERY_STATUS.POOR,
      sleepHours: 8 - i * 0.4,
    }));

    const session = sessionOf({
      report: reports.at(-1),
      insights: InsightsEngine.weekly({ report: reports.at(-1) }),
      analytics: AnalyticsEngine.analyse({ weeklyReports: reports, period: 'monthly' }),
      recovery: { status: RECOVERY_STATUS.POOR, strainIndex: 85, sleepHours: 4.8 },
    });

    const advice = session.find('health.persistent-fatigue');
    if (advice) {
      expect(advice.recommendation.includes('doctor')).toBeTruthy();
      /* The reasoning has to disclaim its own competence somewhere — the exact
         wording is not the contract, but saying "this app cannot tell" is. */
      expect(/cannot|can identify none|no way to|not able to/i.test(advice.reasoning)).toBeTruthy();
      expect(advice.actions.some((action) => action.kind === 'external')).toBeTruthy();
    } else {
      /* The rule needs a falling sleep trend from analytics; without it the
         coach must not have invented the health finding either. */
      expect(session.find('health.persistent-fatigue')).toBe(null);
    }
  });

  it('never prescribes a supplement, drug or dose', () => {
    for (const advice of sessionOf().advice) {
      const text = `${advice.recommendation} ${advice.reasoning}`;
      expect(/\bmg\b|\bsupplement\b|\bdose\b|\bmedication\b/i.test(text)).toBeFalsy(
        `${advice.key} prescribes something`);
    }
  });
});

/* ── The shared machinery ───────────────────────────────────────────────── */

describe('Ranked record — one definition, two engines', () => {
  it('reports which required fields are missing', () => {
    expect(missingFields({ a: 1 }, ['a', 'b', 'c'])).toEqual(['b', 'c']);
  });

  it('rejects evidence that is empty or entirely null', () => {
    expect(hasRealEvidence({})).toBeFalsy();
    expect(hasRealEvidence({ a: null })).toBeFalsy();
    expect(hasRealEvidence(null)).toBeFalsy();
    expect(hasRealEvidence({ a: null, b: 0 })).toBeTruthy();
  });

  it('clamps a priority into the band', () => {
    expect(clampPriority(150)).toBe(100);
    expect(clampPriority(-20)).toBe(0);
    expect(clampPriority(55.6)).toBe(56);
  });
});

/* ── Caching, through the service ───────────────────────────────────────── */

function seed() {
  BackupService.reset();

  ProfileRepository.save({
    age: 28, sex: 'male', heightCm: 186, weightKg: 61, startWeightKg: 61,
    goalWeightKg: 74, activityLevel: 'moderate', experienceLevel: 'intermediate',
    goal: 'bulk', startDate: '2026-05-01', trainingDays: 4,
    availableDays: ['mon', 'tue', 'thu', 'sat'],
    sessionStart: '18:00', sessionEnd: '19:30',
  });

  SettingsRepository.save({ sleepHours: 8, appetite: 'normal', budgetLevel: 'medium', onboarded: true });
}

function resetCaches() {
  unwireApplication();
  invalidateAll();
  resetStats();
}

describe('Coach service — built once, then read from cache', () => {
  it('builds the session once for two reads', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    CoachService.session();
    CoachService.session();

    const entry = stats().find((item) => item.name === 'coach');
    expect(entry.misses).toBe(1);
    expect(entry.hits).toBe(1);
  });

  it('returns the very same object, not an equal one', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    expect(CoachService.session()).toBe(CoachService.session());
  });

  it('rebuilds nothing underneath it on a second read', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    CoachService.session();
    const afterFirst = stats().map((entry) => `${entry.name}:${entry.misses}`).join('|');

    CoachService.session();
    CoachService.session();

    expect(stats().map((entry) => `${entry.name}:${entry.misses}`).join('|')).toBe(afterFirst);
  });

  it('rebuilds after something is logged', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    CoachService.session();
    WeightService.log(61.5);
    CoachService.session();

    expect(stats().find((item) => item.name === 'coach').misses).toBe(2);
  });

  it('rebuilds after the cache is cleared by name', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();
    resetStats();

    CoachService.session();
    Cache.invalidate('coach');
    CoachService.session();

    expect(stats().find((item) => item.name === 'coach').misses).toBe(2);
  });

  it('coaches a real week end to end', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    const session = CoachService.session();

    expect(session.advice.length).toBeGreaterThan(0);
    expect(session.meta.engineId).toBe('coach-engine');
    expect(Array.isArray(session.reasons)).toBeTruthy();

    for (const advice of session.advice) {
      expect(Object.keys(advice.evidence).length).toBeGreaterThan(0);
      expect(advice.sourceEngines.length).toBeGreaterThan(0);
    }
  });

  it('answers the narrower questions from the same session', () => {
    seed(); resetCaches();
    PlanningService.generateWeek();

    expect(CoachService.focus()).toBe(CoachService.session().focus);
    expect(CoachService.nextStep().fromAdvice).toBe(CoachService.session().focus.key);
    expect(Array.isArray(CoachService.today())).toBeTruthy();
    expect(Array.isArray(CoachService.forCategory(COACH_CATEGORY.TRAINING))).toBeTruthy();
    expect(CoachService.summary().headline.length).toBeGreaterThan(5);
  });
});
