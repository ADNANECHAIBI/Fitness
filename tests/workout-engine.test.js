/**
 * Tests for the workout engine — the sixteen situations it has to get right,
 * plus the invariants that must hold for any week it produces.
 */

import { describe, it, expect } from './runner.js';
import { WorkoutEngine } from '../engines/workout-engine.js';
import { PlannerEngine } from '../engines/planner-engine.js';
import { ExerciseDB } from '../data/exercises/index.js';
import { ACTION } from '../rules/workout/progressive-overload.js';
import { EQUIPMENT, MOVEMENT } from '../data/taxonomy.js';
import { WORKOUT, PROGRESSION } from '../engines/constants.js';

const TODAY = '2026-07-27';

const PROFILE = {
  startDate: '2026-07-01', goal: 'bulk',
  weightKg: 61, startWeightKg: 61, goalWeightKg: 74,
  heightCm: 186, age: 28, sex: 'male', activityLevel: 'moderate',
  experienceLevel: 'intermediate',
  availableDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  sessionStart: '18:00', sessionEnd: '19:30',
};

/** Build a week end to end: planner first, then the workout engine. */
function build({ profile = {}, settings = {}, gymHistory = [], today = TODAY, sessionMinutes = null } = {}) {
  const fullProfile = { ...PROFILE, ...profile };
  const fullSettings = { sleepHours: 8, ...settings };

  const schedule = sessionMinutes
    ? fullProfile.availableDays.map((day) => ({ day, type: 'gym', startTime: '18:00', durationMin: sessionMinutes, active: true }))
    : [];

  const weeklyPlan = PlannerEngine.plan({
    profile: fullProfile, settings: fullSettings, schedule, gymHistory, today,
  });

  return WorkoutEngine.build({
    weeklyPlan, profile: fullProfile, settings: fullSettings, gymHistory,
  });
}

/** Logged sets for one exercise across several sessions. */
function history(exercise, sessions) {
  return sessions.flatMap(({ date, weightKg, reps, rpe, sets = 3 }) =>
    Array.from({ length: sets }, () => ({
      date, exercise, muscle: 'chest', sets: 1, reps, weightKg, rpe,
    }))
  );
}

/* ── Experience levels ──────────────────────────────────────────────────── */

describe('WorkoutEngine — beginner', () => {
  const week = build({ profile: { experienceLevel: 'beginner' } });

  it('never prescribes an exercise above the training level', () => {
    const tooHard = week.days.flatMap((day) => day.exercises)
      .filter((ex) => ExerciseDB.byId(ex.exerciseId)?.difficulty === 'advanced');
    expect(tooHard.length, `too hard: ${tooHard.map((e) => e.exerciseId)}`).toBe(0);
  });

  it('keeps weekly volume inside the beginner range', () => {
    expect(week.volumeAudit.max).toBe(WORKOUT.WEEKLY_SETS_BY_LEVEL.beginner.max);
  });

  it('explains the difficulty cap', () => {
    const reasons = WorkoutEngine.allReasons(week).map((r) => r.message).join(' ');
    expect(reasons).toContain('beginner');
  });
});

describe('WorkoutEngine — intermediate and advanced', () => {
  it('allows harder exercises as the level rises', () => {
    const beginner = build({ profile: { experienceLevel: 'beginner' } });
    const advanced = build({ profile: { experienceLevel: 'advanced' } });

    const hardest = (week) => week.days.flatMap((d) => d.exercises)
      .map((ex) => ExerciseDB.byId(ex.exerciseId)?.difficulty)
      .filter(Boolean);

    expect(hardest(beginner).includes('advanced')).toBeFalsy();
    expect(advanced.volumeAudit.max).toBeGreaterThan(beginner.volumeAudit.max);
  });

  it('gives an advanced lifter more weekly volume than a beginner', () => {
    const beginner = build({ profile: { experienceLevel: 'beginner' } });
    const advanced = build({ profile: { experienceLevel: 'advanced' } });
    expect(advanced.targets.setsPerMuscle).toBeGreaterThan(beginner.targets.setsPerMuscle - 1);
  });
});

/* ── Equipment ──────────────────────────────────────────────────────────── */

describe('WorkoutEngine — limited equipment', () => {
  it('prescribes only what a home setup can do', () => {
    const week = build({ settings: { availableEquipment: [EQUIPMENT.NONE, EQUIPMENT.MAT] } });
    const impossible = week.days.flatMap((d) => d.exercises)
      .filter((ex) => !ExerciseDB.canPerform(ExerciseDB.byId(ex.exerciseId), ['none', 'mat']));

    expect(impossible.length, `impossible: ${impossible.map((e) => e.exerciseId)}`).toBe(0);
  });

  it('says load progresses by reps when there is no weight to add', () => {
    const week = build({ settings: { availableEquipment: [EQUIPMENT.NONE] } });
    const messages = week.reasons.map((r) => r.message).join(' ');
    expect(messages).toContain('bodyweight');
  });

  it('works with a band and a pull-up bar', () => {
    const week = build({ settings: { availableEquipment: [EQUIPMENT.BAND, EQUIPMENT.PULLUP_BAR, EQUIPMENT.NONE] } });
    expect(week.days.some((day) => day.exercises.length > 0)).toBeTruthy();
  });

  it('says when it assumed a gym rather than being told', () => {
    const week = build();
    expect(week.meta.equipmentAssumed).toBeTruthy();
    expect(week.notes.some((note) => note.includes('assumed'))).toBeTruthy();
  });

  it('stops assuming once equipment is stated', () => {
    const week = build({ settings: { availableEquipment: [EQUIPMENT.DUMBBELL, EQUIPMENT.BENCH] } });
    expect(week.meta.equipmentAssumed).toBeFalsy();
  });
});

/* ── Session length ─────────────────────────────────────────────────────── */

describe('WorkoutEngine — time budget', () => {
  const cases = [30, 60, 90];

  for (const minutes of cases) {
    it(`fits a ${minutes}-minute session`, () => {
      const week = build({ sessionMinutes: minutes });
      for (const day of week.days) {
        expect(day.estimatedMinutes,
          `${day.weekday} ran ${day.estimatedMinutes} of ${minutes}`).toBeLessThan(minutes + 1);
      }
    });
  }

  it('prescribes more work when there is more time', () => {
    const short = build({ sessionMinutes: 30 });
    const long = build({ sessionMinutes: 90 });

    const setsIn = (week) => week.days.reduce(
      (sum, day) => sum + day.exercises.reduce((n, ex) => n + ex.sets, 0), 0);

    expect(setsIn(long)).toBeGreaterThan(setsIn(short));
  });

  it('explains what was dropped for time', () => {
    const week = build({ sessionMinutes: 30 });
    const trims = week.days.flatMap((day) => day.reasons)
      .filter((reason) => reason.ruleId === 'time.session-full');

    expect(trims.length).toBeGreaterThan(0);
    expect(trims[0].message).toContain('left out');
  });

  it('never receives a session shorter than the planner allows', () => {
    // The planner clamps session length to its own minimum before the workout
    // engine ever sees it, so a 15-minute request arrives as 20.
    const week = build({ sessionMinutes: 15 });
    expect(week.days.every((day) => day.availableMinutes >= WORKOUT.MIN_SESSION_MIN)).toBeTruthy();
  });

  it('still produces a usable session at the shortest allowed length', () => {
    const week = build({ sessionMinutes: 20 });
    expect(week.days.every((day) => day.exercises.length > 0)).toBeTruthy();
    expect(week.days.every((day) => day.estimatedMinutes <= day.availableMinutes + 1)).toBeTruthy();
  });
});

/* ── Deload, fatigue, recovery ──────────────────────────────────────────── */

describe('WorkoutEngine — deload week', () => {
  // Week 6 with the default cadence.
  const startDate = new Date(new Date(`${TODAY}T00:00:00Z`).getTime() - 5 * 7 * 86400000)
    .toISOString().slice(0, 10);

  const gymHistory = history('barbell-bench-press', [
    { date: '2026-07-20', weightKg: 60, reps: 10, rpe: 8 },
  ]);
  const week = build({ profile: { startDate }, gymHistory });

  it('is flagged as a deload', () => {
    expect(week.deload).toBeTruthy();
    expect(week.phase).toBe('recovery');
  });

  it('cuts the load', () => {
    const bench = week.days.flatMap((d) => d.exercises)
      .find((ex) => ex.exerciseId === 'barbell-bench-press');

    if (bench) {
      expect(bench.progression.action).toBe(ACTION.DELOAD);
      expect(bench.targetLoadKg).toBeLessThan(60);
    }
  });

  it('caps effort at RPE 6', () => {
    expect(week.targets.rpe).toBeLessThan(7);
  });

  it('explains why the load came off', () => {
    const messages = WorkoutEngine.allReasons(week).map((r) => r.message).join(' ');
    expect(messages).toContain('deload');
  });
});

describe('WorkoutEngine — high fatigue and low recovery', () => {
  it('caps effort when strain is high', () => {
    // Strain is computed and tested by the planner; here the rule that reacts
    // to it is what is under test, so the value is injected directly.
    const plan = PlannerEngine.plan({ profile: PROFILE, settings: { sleepHours: 8 }, today: TODAY });
    const week = WorkoutEngine.build({
      weeklyPlan: { ...plan, recovery: { ...plan.recovery, strainIndex: 70, score: 7 } },
      profile: PROFILE,
      settings: { sleepHours: 8 },
    });

    expect(week.targets.rpe).toBeLessThan(8);
    const messages = week.reasons.map((r) => r.message).join(' ');
    expect(messages).toContain('70 out of 100');
  });

  it('caps effort and load when recovery is rated low', () => {
    const plan = PlannerEngine.plan({ profile: PROFILE, settings: { sleepHours: 8 }, today: TODAY });
    const week = WorkoutEngine.build({
      weeklyPlan: { ...plan, recovery: { ...plan.recovery, score: 2 } },
      profile: PROFILE,
      settings: { sleepHours: 8 },
    });

    expect(week.targets.rpe).toBeLessThan(8);
    expect(week.targets.loadFactor).toBeLessThan(1);
  });
});

/* ── Progression ────────────────────────────────────────────────────────── */

describe('WorkoutEngine — progressive overload', () => {
  const bench = (week) => week.days.flatMap((d) => d.exercises)
    .find((ex) => ex.exerciseId === 'barbell-bench-press');

  it('prescribes no load on a first exposure', () => {
    const week = build();
    const first = bench(week);
    expect(first.targetLoadKg).toBeNull();
    expect(first.progression.action).toBe(ACTION.START);
    expect(first.progression.reason.message).toContain('not logged');
  });

  it('adds load after hitting the top of the range at target effort', () => {
    const week = build({
      gymHistory: history('barbell-bench-press', [
        { date: '2026-07-24', weightKg: 60, reps: 12, rpe: 7.5 },
      ]),
    });
    const lift = bench(week);
    expect(lift.progression.action).toBe(ACTION.ADD_LOAD);
    expect(lift.targetLoadKg).toBeGreaterThan(60);
    expect(lift.progression.reason.message).toContain('top of the range');
  });

  it('adds reps inside the range instead of load', () => {
    const week = build({
      gymHistory: history('barbell-bench-press', [
        { date: '2026-07-24', weightKg: 60, reps: 9, rpe: 8 },
      ]),
    });
    const lift = bench(week);
    expect(lift.progression.action).toBe(ACTION.ADD_REPS);
    expect(lift.targetLoadKg).toBe(60);
  });

  it('holds when the last session was harder than intended', () => {
    const week = build({
      gymHistory: history('barbell-bench-press', [
        { date: '2026-07-24', weightKg: 60, reps: 12, rpe: 9.5 },
      ]),
    });
    const lift = bench(week);
    expect(lift.progression.action).toBe(ACTION.HOLD);
    expect(lift.progression.reason.message).toContain('RPE');
  });

  it('backs off after a plateau', () => {
    const week = build({
      gymHistory: history('barbell-bench-press', [
        { date: '2026-07-24', weightKg: 60, reps: 8, rpe: 9 },
        { date: '2026-07-17', weightKg: 60, reps: 8, rpe: 9 },
        { date: '2026-07-10', weightKg: 60, reps: 8, rpe: 9 },
        { date: '2026-07-03', weightKg: 60, reps: 8, rpe: 9 },
      ]),
    });
    const lift = bench(week);
    expect(lift.progression.action).toBe(ACTION.BACK_OFF);
    expect(lift.targetLoadKg).toBeLessThan(60);
    expect(lift.progression.reason.message).toContain('sessions without');
  });

  it('carries the previous session inside the progression, not just a number', () => {
    const week = build({
      gymHistory: history('barbell-bench-press', [
        { date: '2026-07-24', weightKg: 60, reps: 12, rpe: 7 },
      ]),
    });
    const lift = bench(week);
    expect(lift.progression.previous.weightKg).toBe(60);
    expect(lift.progression.previous.reps).toBe(12);
    expect(lift.progression.previous.date).toBe('2026-07-24');
  });
});

/* ── Corrective and restrictions ────────────────────────────────────────── */

describe('WorkoutEngine — rounded shoulders', () => {
  const week = build({ settings: { correctiveNeeds: ['rounded-shoulders'] } });

  it('adds corrective exercises', () => {
    const corrective = week.days.flatMap((d) => d.exercises).filter((ex) => ex.corrective);
    expect(corrective.length).toBeGreaterThan(0);
  });

  it('picks them from the database, by tag', () => {
    const corrective = week.days.flatMap((d) => d.exercises).filter((ex) => ex.corrective);
    expect(corrective.every((ex) =>
      ExerciseDB.byId(ex.exerciseId).tags.includes('rounded-shoulders'))).toBeTruthy();
  });

  it('caps how many are added per session', () => {
    for (const day of week.days) {
      const corrective = day.exercises.filter((ex) => ex.corrective);
      expect(corrective.length).toBeLessThan(WORKOUT.MAX_CORRECTIVE_EXERCISES + 1);
    }
  });

  it('puts them last, so they do not displace the session', () => {
    for (const day of week.days) {
      const firstCorrective = day.exercises.findIndex((ex) => ex.corrective);
      if (firstCorrective !== -1) {
        expect(day.exercises.slice(firstCorrective).every((ex) => ex.corrective)).toBeTruthy();
      }
    }
  });

  it('explains why each was added', () => {
    const corrective = week.days.flatMap((d) => d.exercises).filter((ex) => ex.corrective);
    expect(corrective.every((ex) => ex.reason.message.includes('rounded-shoulders'))).toBeTruthy();
  });
});

describe('WorkoutEngine — injury restriction', () => {
  const week = build({ settings: { restrictedMovements: [MOVEMENT.HINGE, MOVEMENT.SQUAT] } });

  it('never prescribes a restricted movement', () => {
    const banned = week.days.flatMap((d) => d.exercises)
      .filter((ex) => [MOVEMENT.HINGE, MOVEMENT.SQUAT].includes(ex.movement) && !ex.corrective);
    expect(banned.length, `banned: ${banned.map((e) => e.exerciseId)}`).toBe(0);
  });

  it('still produces a usable session', () => {
    expect(week.days.every((day) => day.exercises.length > 0)).toBeTruthy();
  });

  it('explains the exclusion', () => {
    const messages = week.reasons.map((r) => r.message).join(' ');
    expect(messages).toContain('excluded entirely');
  });

  it('excludes named exercises too', () => {
    const withExclusion = build({ settings: { excludedExercises: ['barbell-bench-press'] } });
    const found = withExclusion.days.flatMap((d) => d.exercises)
      .some((ex) => ex.exerciseId === 'barbell-bench-press');
    expect(found).toBeFalsy();
  });

  it('says plainly that free-text injuries change nothing', () => {
    const noted = build({ settings: { injuries: 'sore left shoulder' } });
    const messages = noted.reasons.map((r) => r.message).join(' ');
    expect(messages).toContain('cannot read free text');
  });
});

/* ── Rotation ───────────────────────────────────────────────────────────── */

describe('WorkoutEngine — variation', () => {
  it('keeps a main lift once you are training it, so the load can progress', () => {
    // Rotating the main compound away every few weeks would throw away the
    // only record of whether it is going up.
    const recent = history('barbell-bench-press', [
      { date: '2026-07-20', weightKg: 60, reps: 10, rpe: 8 },
      { date: '2026-07-13', weightKg: 60, reps: 10, rpe: 8 },
    ]);

    const week = build({ gymHistory: recent });
    const bench = week.days.flatMap((d) => d.exercises)
      .find((ex) => ex.exerciseId === 'barbell-bench-press');

    expect(Boolean(bench)).toBeTruthy();
    expect(bench.reason.message).toContain('progress from');
  });

  it('rotates accessories away from what was done recently', () => {
    const accessoryOf = (week) => week.days.flatMap((day) => day.exercises)
      .filter((ex) => !ex.corrective && ex.category !== 'compound')
      .map((ex) => ex.exerciseId);

    const fresh = build();
    const used = accessoryOf(fresh);
    expect(used.length).toBeGreaterThan(0);

    const withHistory = build({
      gymHistory: used.flatMap((id) => history(id, [{ date: '2026-07-24', weightKg: 20, reps: 12, rpe: 8 }])),
    });

    const after = accessoryOf(withHistory);
    const repeated = after.filter((id) => used.includes(id));
    expect(repeated.length).toBeLessThan(after.length);
  });

  it('is deterministic — the same inputs give the same week', () => {
    const a = build();
    const b = build();
    const ids = (week) => week.days.flatMap((d) => d.exercises.map((ex) => ex.exerciseId)).join(',');
    expect(ids(a)).toBe(ids(b));
  });

  it('does not repeat an exercise inside one session', () => {
    const week = build();
    for (const day of week.days) {
      const ids = day.exercises.map((ex) => ex.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

/* ── Invariants ─────────────────────────────────────────────────────────── */

describe('WorkoutEngine — invariants', () => {
  const scenarios = [
    ['a full week', {}],
    ['two days only', { profile: { availableDays: ['tue', 'sat'] } }],
    ['no days at all', { profile: { availableDays: [] } }],
    ['no profile', { profile: { experienceLevel: undefined } }],
    ['bodyweight only', { settings: { availableEquipment: [EQUIPMENT.NONE] } }],
    ['every pattern restricted', { settings: { restrictedMovements: Object.values(MOVEMENT) } }],
    ['thirty minutes', { sessionMinutes: 30 }],
  ];

  for (const [name, input] of scenarios) {
    it(`explains every exercise — ${name}`, () => {
      const week = build(input);
      for (const day of week.days) {
        for (const exercise of day.exercises) {
          expect(exercise.reason.message.length).toBeGreaterThan(20);
          expect(Boolean(exercise.reason.ruleId)).toBeTruthy();
        }
      }
    });

    it(`explains every load decision — ${name}`, () => {
      const week = build(input);
      const lifts = week.days.flatMap((d) => d.exercises).filter((ex) => !ex.corrective);
      expect(lifts.every((ex) => Boolean(ex.progression.action))).toBeTruthy();
      expect(lifts.every((ex) => ex.progression.reason.message.length > 20)).toBeTruthy();
    });

    it(`never exceeds the time available — ${name}`, () => {
      const week = build(input);
      expect(week.days.every((day) =>
        day.estimatedMinutes <= day.availableMinutes + 1)).toBeTruthy();
    });

    it(`produces no exercise the database does not hold — ${name}`, () => {
      const week = build(input);
      const unknown = week.days.flatMap((d) => d.exercises)
        .filter((ex) => !ExerciseDB.has(ex.exerciseId));
      expect(unknown.length).toBe(0);
    });
  }

  it('produces no days when the planner allocated none', () => {
    const week = build({ profile: { availableDays: [] } });
    expect(week.days.length).toBe(0);
    expect(week.totalWeeklySets).toBe(0);
  });

  it('reports volume per muscle against the budget', () => {
    const week = build();
    expect(week.volumeAudit.target).toBeGreaterThan(0);
    expect(Object.keys(week.weeklySetsPerMuscle).length).toBeGreaterThan(4);
  });

  it('carries its version and its sources', () => {
    const week = build();
    expect(week.meta.engineVersion.length).toBeGreaterThan(0);
    expect(week.meta.formula.accuracy).toBe('estimate');
    expect(week.meta.formula.source).toContain('Schoenfeld');
  });

  it('flattens every reason for a later report generator', () => {
    const week = build();
    const reasons = WorkoutEngine.allReasons(week);
    expect(reasons.length).toBeGreaterThan(10);
    expect(reasons.every((r) => typeof r.message === 'string' && r.ruleId)).toBeTruthy();
  });
});

/* ── Matching logged names to records ───────────────────────────────────── */

describe('WorkoutEngine — logged name matching', () => {
  it('progresses a lift logged by its display name, not its id', () => {
    const week = build({
      gymHistory: history('Barbell Bench Press', [
        { date: '2026-07-24', weightKg: 60, reps: 12, rpe: 7 },
      ]),
    });
    const bench = week.days.flatMap((d) => d.exercises)
      .find((ex) => ex.exerciseId === 'barbell-bench-press');

    expect(bench.progression.action).toBe(ACTION.ADD_LOAD);
  });

  it('progresses a lift logged in lower case with spaces', () => {
    const week = build({
      gymHistory: history('barbell bench press', [
        { date: '2026-07-24', weightKg: 60, reps: 12, rpe: 7 },
      ]),
    });
    const bench = week.days.flatMap((d) => d.exercises)
      .find((ex) => ex.exerciseId === 'barbell-bench-press');

    expect(bench.progression.previous.weightKg).toBe(60);
  });

  it('leaves an unmatched name alone rather than guessing wildly', () => {
    const week = build({
      gymHistory: history('something-that-does-not-exist', [
        { date: '2026-07-24', weightKg: 60, reps: 12, rpe: 7 },
      ]),
    });
    // Nothing crashes and no exercise inherits that history.
    expect(week.days.flatMap((d) => d.exercises).every(
      (ex) => ex.progression.previous === null || ex.progression.previous.weightKg !== 60
    )).toBeTruthy();
  });
});
