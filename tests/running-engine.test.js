/**
 * Tests for the running engines: the programme builder, the progress metrics
 * and the run execution tracker.
 */

import { describe, it, expect } from './runner.js';
import { RunningProgramEngine } from '../engines/running-program-engine.js';
import { RunningProgressEngine } from '../engines/running-progress-engine.js';
import { RunningExecutionEngine as X } from '../engines/running-execution-engine.js';
import { RUN_TYPE, QUALITY_TYPES, RUNNING_PROGRAM, SESSION_STATE } from '../engines/constants.js';

const TODAY = '2026-07-27';

const PROFILE = {
  startDate: '2026-04-01', goal: 'bulk',
  weightKg: 61, startWeightKg: 61, goalWeightKg: 74,
  heightCm: 186, age: 28, sex: 'male', activityLevel: 'moderate',
  experienceLevel: 'intermediate',
  availableDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  sessionStart: '18:00', sessionEnd: '19:30',
};

/** A weekly plan with a chosen number of running days — no planner needed. */
function planWith(runningDays, overrides = {}) {
  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const start = new Date(`${TODAY}T00:00:00Z`).getTime();

  const days = weekdays.map((weekday, index) => ({
    date: new Date(start + index * 86400000).toISOString().slice(0, 10),
    weekday,
    type: index < runningDays ? 'running' : 'rest',
    durationMin: 60,
    intensity: 'moderate',
    priority: 2,
  }));

  return {
    weekNumber: 14,
    phase: 'hypertrophy',
    deload: false,
    startDate: TODAY,
    endDate: days.at(-1).date,
    days,
    recovery: { strainIndex: 20, score: 7, restDays: 7 - runningDays },
    summary: { volumeFactor: 1 },
    ...overrides,
  };
}

/** A run history: `count` runs, `everyDays` apart, ending before the week. */
function runHistory(count, { everyDays = 3, distanceKm = 6, durationMin = 34, endBefore = TODAY } = {}) {
  const end = new Date(`${endBefore}T00:00:00Z`).getTime() - 86400000;
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(end - (count - 1 - i) * everyDays * 86400000).toISOString().slice(0, 10),
    distanceKm, durationMin, difficulty: 'easy',
  }));
}

const build = ({ runningDays = 3, profile = {}, settings = {}, history = runHistory(12), plan = null, workoutWeek = null } = {}) =>
  RunningProgramEngine.build({
    weeklyPlan: plan ?? planWith(runningDays),
    profile: { ...PROFILE, ...profile },
    settings,
    runningHistory: history,
    workoutWeek,
  });

/* ── Experience levels ──────────────────────────────────────────────────── */

describe('RunningProgramEngine — beginner', () => {
  it('starts a complete beginner with walking, not running', () => {
    const week = build({ profile: { experienceLevel: 'beginner' }, history: [] });
    expect(week.sessions.every((session) => session.type === RUN_TYPE.WALK)).toBeTruthy();
  });

  it('explains why', () => {
    const week = build({ profile: { experienceLevel: 'beginner' }, history: [] });
    expect(week.sessions[0].reason.message).toContain('tissue tolerance');
  });

  it('uses the beginner baseline distance with no history', () => {
    const week = build({ profile: { experienceLevel: 'beginner' }, history: [] });
    expect(week.targetDistanceKm).toBe(RUNNING_PROGRAM.BASE_WEEKLY_KM.beginner);
  });

  it('never prescribes hard running before the base is built', () => {
    const week = build({ runningDays: 4, history: runHistory(3, { everyDays: 2 }) });
    expect(week.sessions.some((session) => QUALITY_TYPES.includes(session.type))).toBeFalsy();
  });
});

describe('RunningProgramEngine — intermediate and advanced', () => {
  it('gives an advanced runner a larger baseline', () => {
    const beginner = build({ profile: { experienceLevel: 'beginner' }, history: [] });
    const advanced = build({ profile: { experienceLevel: 'advanced' }, history: [] });
    expect(advanced.targetDistanceKm).toBeGreaterThan(beginner.targetDistanceKm);
  });

  it('introduces quality work once a base exists', () => {
    const week = build({ runningDays: 4, profile: { goal: 'cut' }, history: runHistory(20, { everyDays: 3 }) });
    expect(week.sessions.some((session) => QUALITY_TYPES.includes(session.type))).toBeTruthy();
  });

  it('caps the number of hard sessions', () => {
    const week = build({ runningDays: 6, profile: { goal: 'cut' }, history: runHistory(30, { everyDays: 2 }) });
    const hard = week.sessions.filter((session) => QUALITY_TYPES.includes(session.type));
    expect(hard.length).toBeLessThan(RUNNING_PROGRAM.MAX_QUALITY_SESSIONS + 1);
  });
});

/* ── Week shapes ────────────────────────────────────────────────────────── */

describe('RunningProgramEngine — how many running days', () => {
  it('produces nothing when the planner allocated no running', () => {
    const week = build({ runningDays: 0 });
    expect(week.sessions).toEqual([]);
    expect(week.weeklyDistanceKm).toBe(0);
    expect(week.reasons.some((reason) => reason.ruleId === 'running.no-days')).toBeTruthy();
  });

  it('gives a single run the whole week\'s distance, not a share of it', () => {
    const week = build({ runningDays: 1, history: runHistory(8) });
    expect(week.sessions.length).toBe(1);
    // Either it spends the budget, or it says why it could not.
    const spent = week.weeklyDistanceKm >= week.targetDistanceKm - 0.5;
    expect(spent || week.notes.some((note) => note.includes('fits the time'))).toBeTruthy();
  });

  it('builds three sessions with a long run last', () => {
    const week = build({ runningDays: 3, history: runHistory(20, { everyDays: 3 }) });
    expect(week.sessions.length).toBe(3);
    expect(week.sessions.at(-1).type).toBe(RUN_TYPE.LONG);
  });

  it('builds five sessions inside the distance budget', () => {
    const week = build({ runningDays: 5, history: runHistory(20, { everyDays: 3 }) });
    expect(week.sessions.length).toBe(5);
    expect(week.weeklyDistanceKm).toBeLessThan(week.targetDistanceKm + 1);
  });

  it('keeps most running easy however many days there are', () => {
    const week = build({ runningDays: 5, profile: { goal: 'cut' }, history: runHistory(30, { everyDays: 2 }) });
    const easy = week.sessions.filter((session) => !session.recovery.isQuality);
    expect(easy.length).toBeGreaterThan(week.sessions.length / 2);
  });
});

/* ── Load, fatigue, injury, layoff ──────────────────────────────────────── */

describe('RunningProgramEngine — high fatigue', () => {
  it('eases the week when recent load has spiked', () => {
    const spike = [
      ...runHistory(3, { everyDays: 30, distanceKm: 4, durationMin: 24 }),
      ...runHistory(5, { everyDays: 1, distanceKm: 12, durationMin: 70 }),
    ];
    const week = build({ history: spike });

    expect(week.reasons.some((reason) => reason.ruleId === 'running-load.acute-spike')).toBeTruthy();
    expect(week.sessions.every((session) => !session.recovery.isQuality)).toBeTruthy();
  });

  it('eases when the lifting week is already demanding', () => {
    const week = build({
      plan: planWith(3, { recovery: { strainIndex: 70, score: 7, restDays: 4 } }),
      history: runHistory(12),
    });
    expect(week.reasons.some((reason) => reason.ruleId === 'running-load.lifting-is-heavy')).toBeTruthy();
  });

  it('reports its impact on lifting', () => {
    const week = build({ history: runHistory(12) });
    expect(['minimal', 'moderate', 'high'].includes(week.recoveryImpact.level)).toBeTruthy();

    const impact = week.reasons.find((reason) => reason.ruleId === 'running-recovery.impact-on-lifting');
    expect(impact.message.length).toBeGreaterThan(30);
    expect(impact.message).toContain('km');
  });

  it('keeps everything easy in a deload week', () => {
    const week = build({ plan: planWith(3, { deload: true, phase: 'recovery' }), history: runHistory(12) });
    expect(week.sessions.every((session) => !session.recovery.isQuality)).toBeTruthy();
    expect(week.weeklyDistanceKm).toBeLessThan(build({ history: runHistory(12) }).weeklyDistanceKm);
  });
});

describe('RunningProgramEngine — injury and layoff', () => {
  it('stops entirely when the gait pattern is restricted', () => {
    const week = build({ settings: { restrictedMovements: ['gait'] } });
    expect(week.sessions).toEqual([]);
    expect(week.reasons[0].message).toContain('restricted');
  });

  it('comes back reduced after a fortnight off', () => {
    const week = build({ history: runHistory(10, { everyDays: 3, endBefore: '2026-07-05' }) });

    expect(week.reasons.some((reason) => reason.ruleId === 'running-load.returning')).toBeTruthy();
    expect(week.sessions.every((session) => !session.recovery.isQuality)).toBeTruthy();
  });

  it('explains the return in terms of tissue, not fitness', () => {
    const week = build({ history: runHistory(10, { everyDays: 3, endBefore: '2026-07-05' }) });
    const reason = week.reasons.find((r) => r.ruleId === 'running-load.returning');
    expect(reason.message).toContain('tendons');
  });
});

/* ── Progress ───────────────────────────────────────────────────────────── */

describe('RunningProgramEngine — reading progress', () => {
  it('says nothing is measurable with almost no runs', () => {
    const week = build({ history: runHistory(2) });
    expect(week.progress).toBe('unknown');
  });

  it('notices a clear improvement', () => {
    const improving = runHistory(12).map((run, i) => ({ ...run, durationMin: 40 - i }));
    const week = build({ history: improving });
    expect(week.progress).toBe('improving');
  });

  it('notices a decline and suggests where to look', () => {
    const declining = runHistory(12).map((run, i) => ({ ...run, durationMin: 28 + i * 1.5 }));
    const week = build({ history: declining });

    expect(week.progress).toBe('declining');
    const reason = week.reasons.find((r) => r.ruleId === 'run-progress.declining');
    expect(reason.message).toContain('sleep');
  });
});

/* ── Session shape ──────────────────────────────────────────────────────── */

describe('RunningProgramEngine — session contents', () => {
  const week = build({ runningDays: 3, history: runHistory(20, { everyDays: 3 }) });

  it('gives every session a warm-up, a main set and a cool-down', () => {
    for (const session of week.sessions) {
      expect(session.warmup.minutes).toBeGreaterThan(0);
      expect(session.mainSet.distanceKm).toBeGreaterThan(0);
      expect(session.cooldown.minutes).toBeGreaterThan(0);
    }
  });

  it('gives a longer warm-up before hard running', () => {
    const hard = build({ runningDays: 4, profile: { goal: 'cut' }, history: runHistory(30, { everyDays: 2 }) });
    const quality = hard.sessions.find((session) => session.recovery.isQuality);
    const easy = hard.sessions.find((session) => !session.recovery.isQuality);

    if (quality && easy) expect(quality.warmup.minutes).toBeGreaterThan(easy.warmup.minutes);
  });

  it('gives heart-rate zones when age is known, and says so when it is not', () => {
    expect(week.sessions[0].heartRateZone.lowBpm).toBeGreaterThan(80);
    expect(week.sessions[0].heartRateZone.estimated).toBeTruthy();

    const ageless = build({ profile: { age: null }, history: runHistory(12) });
    expect(ageless.sessions[0].heartRateZone).toBeNull();
    expect(ageless.notes.some((note) => note.includes('age'))).toBeTruthy();
  });

  it('derives pace from logged runs, and flags a guess', () => {
    expect(week.meta.easyPaceAssumed).toBeFalsy();

    const blind = build({ history: [] });
    expect(blind.meta.easyPaceAssumed).toBeTruthy();
    expect(blind.notes.some((note) => note.includes('guess'))).toBeTruthy();
  });

  it('runs harder sessions at a faster target than easy ones', () => {
    const mixed = build({ runningDays: 4, profile: { goal: 'cut' }, history: runHistory(30, { everyDays: 2 }) });
    const quality = mixed.sessions.find((session) => session.recovery.isQuality);
    const easy = mixed.sessions.find((session) => session.type === RUN_TYPE.EASY);

    if (quality && easy) expect(quality.targetPaceSecPerKm).toBeLessThan(easy.targetPaceSecPerKm);
  });

  it('explains every session', () => {
    expect(week.sessions.every((session) => session.reason.message.length > 30)).toBeTruthy();
    expect(RunningProgramEngine.allReasons(week).length).toBeGreaterThan(week.sessions.length);
  });

  it('never plans a session longer than the time available', () => {
    for (const session of week.sessions) {
      expect(session.totalMinutes).toBeLessThan(61);
    }
  });
});

/* ── Progress engine ────────────────────────────────────────────────────── */

describe('RunningProgressEngine', () => {
  const runs = runHistory(15, { everyDays: 4 }).map((run, i) => ({ ...run, durationMin: 36 - i * 0.4 }));
  const summary = RunningProgressEngine.summary(runs, { asOf: TODAY });

  it('reports average and best pace', () => {
    expect(summary.bestPaceSecPerKm).toBeLessThan(summary.averagePaceSecPerKm + 1);
    expect(summary.averagePace).toContain(':');
  });

  it('reports weekly, monthly and total distance', () => {
    expect(summary.weeklyDistanceKm).toBeGreaterThan(0);
    expect(summary.monthlyDistanceKm).toBeGreaterThan(summary.weeklyDistanceKm - 0.01);
    expect(summary.totalDistanceKm).toBeGreaterThan(summary.monthlyDistanceKm - 0.01);
  });

  it('reports the longest run', () => {
    expect(summary.longestRunKm).toBe(Math.max(...runs.map((run) => run.distanceKm)));
  });

  it('measures consistency over twelve weeks', () => {
    expect(summary.consistency.weeksConsidered).toBe(12);
    expect(summary.consistency.percent).toBeGreaterThan(0);
  });

  it('reports acute and chronic load with a verdict', () => {
    expect(summary.trainingLoad.acute).toBeGreaterThan(0);
    expect(['steady', 'spiking', 'detraining', 'unknown'].includes(summary.trainingLoad.verdict)).toBeTruthy();
  });

  it('reads a falling pace as improving', () => {
    expect(summary.paceTrend.direction).toBe('improving');
  });

  it('returns an empty summary rather than throwing on no history', () => {
    const empty = RunningProgressEngine.summary([], { asOf: TODAY });
    expect(empty.totalRuns).toBe(0);
    expect(empty.averagePace).toBe('—');
    expect(empty.trainingLoad.verdict).toBe('unknown');
  });

  it('ignores unusable rows', () => {
    const dirty = [...runs, { date: 'nope', distanceKm: 5, durationMin: 30 }, { date: TODAY, distanceKm: 0, durationMin: 0 }];
    expect(RunningProgressEngine.summary(dirty, { asOf: TODAY }).totalRuns).toBe(runs.length);
  });
});

/* ── Run execution ──────────────────────────────────────────────────────── */

describe('RunningExecutionEngine', () => {
  const SESSION = {
    date: TODAY, type: RUN_TYPE.EASY, goal: 'base',
    distanceKm: 8, durationMin: 45, targetPaceSecPerKm: 340, targetPace: '5:40',
  };

  const started = () => X.start(X.fromSession(SESSION, { weekNumber: 14 }), { at: '2026-07-27T07:00:00.000Z' }).session;

  it('records a completed run against its plan', () => {
    const outcome = X.complete(started(), {
      at: '2026-07-27T07:46:00.000Z', distanceKm: 8, durationMin: 45, rpe: 4,
    });

    expect(outcome.session.verdict).toBe('complete');
    expect(outcome.session.completionPercent).toBe(100);
    expect(outcome.session.actualPace).toBe('5:38');
  });

  it('records a shortened run', () => {
    const outcome = X.complete(started(), { at: '2026-07-27T07:30:00.000Z', distanceKm: 5, durationMin: 29 });
    expect(outcome.session.verdict).toBe('shortened');
    expect(outcome.session.completionPercent).toBe(63);
  });

  it('will not read anything into a run cut very short', () => {
    const outcome = X.complete(started(), { at: '2026-07-27T07:10:00.000Z', distanceKm: 1.5, durationMin: 9 });
    expect(outcome.session.verdict).toBe('abandoned');
    expect(outcome.session.reasons.some((r) => r.message.includes('stays where it is'))).toBeTruthy();
  });

  it('flags an easy run done too fast', () => {
    const outcome = X.complete(started(), { at: '2026-07-27T07:40:00.000Z', distanceKm: 8, durationMin: 38 });
    const reason = outcome.session.reasons.find((r) => r.ruleId === 'run.pace-off-target');
    expect(reason.message).toContain('easy days too hard');
  });

  it('excludes a pause from the measured time', () => {
    let execution = started();
    execution = X.pause(execution, { at: '2026-07-27T07:10:00.000Z' }).session;
    execution = X.resume(execution, { at: '2026-07-27T07:20:00.000Z' }).session;
    expect(execution.pausedSec).toBe(600);

    const outcome = X.complete(execution, { at: '2026-07-27T07:55:00.000Z', distanceKm: 8 });
    expect(outcome.session.actualDurationMin).toBe(45);
  });

  it('keeps what was covered when a run is cancelled', () => {
    const outcome = X.cancel(started(), { at: '2026-07-27T07:20:00.000Z', reason: 'calf tightened' });
    expect(outcome.session.state).toBe(SESSION_STATE.CANCELLED);
    expect(outcome.session.verdict).toBe('cancelled');
  });

  it('logs nothing for a skipped run', () => {
    const outcome = X.skip(X.fromSession(SESSION), { at: '2026-07-27T07:00:00.000Z' });
    expect(outcome.session.verdict).toBe('skipped');
    expect(X.toRunRecords(outcome.session)).toEqual([]);
  });

  it('turns a finished run into a record for the repository', () => {
    const outcome = X.complete(started(), { at: '2026-07-27T07:46:00.000Z', distanceKm: 8, durationMin: 45, rpe: 4 });
    const [row] = X.toRunRecords(outcome.session);

    expect(row.distanceKm).toBe(8);
    expect(row.durationMin).toBe(45);
    expect(row.difficulty).toBe('moderate');
  });

  it('refuses an illegal transition and says why', () => {
    const outcome = X.resume(started());
    expect(outcome.rejected.message).toContain('paused');
    expect(outcome.session.state).toBe(SESSION_STATE.STARTED);
  });

  it('never mutates what it was given', () => {
    const before = started();
    const snapshot = JSON.stringify(before);
    X.complete(before, { at: '2026-07-27T07:46:00.000Z', distanceKm: 8, durationMin: 45 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('explains every terminal state', () => {
    const cases = [
      X.complete(started(), { at: '2026-07-27T07:46:00.000Z', distanceKm: 8, durationMin: 45 }),
      X.cancel(started(), { at: '2026-07-27T07:20:00.000Z' }),
      X.skip(X.fromSession(SESSION)),
    ];

    for (const outcome of cases) {
      expect(outcome.session.reasons.length).toBeGreaterThan(0);
      expect(outcome.session.reasons.every((r) => r.message.length > 20)).toBeTruthy();
    }
  });
});

/* ── Invariants ─────────────────────────────────────────────────────────── */

describe('RunningProgramEngine — invariants', () => {
  const scenarios = [
    ['no history', { history: [] }],
    ['one running day', { runningDays: 1 }],
    ['five running days', { runningDays: 5 }],
    ['a deload', { plan: planWith(3, { deload: true, phase: 'recovery' }) }],
    ['a long layoff', { history: runHistory(6, { endBefore: '2026-06-01' }) }],
    ['no profile', { profile: { experienceLevel: undefined, age: null } }],
  ];

  for (const [name, input] of scenarios) {
    it(`produces a week with reasons — ${name}`, () => {
      const week = build(input);
      expect(week.reasons.length).toBeGreaterThan(0);
      expect(week.reasons.every((r) => r.message.length > 20)).toBeTruthy();
    });

    it(`never prescribes a negative or zero distance — ${name}`, () => {
      const week = build(input);
      expect(week.sessions.every((session) => session.distanceKm > 0)).toBeTruthy();
    });

    it(`carries its version and its sources — ${name}`, () => {
      const week = build(input);
      expect(week.meta.formula.accuracy).toBe('estimate');
      expect(week.meta.formula.source).toContain('Seiler');
    });
  }

  it('only ever uses session types the database knows', async () => {
    const { ExerciseDB } = await import('../data/exercises/index.js');
    const week = build({ runningDays: 5, profile: { goal: 'cut' }, history: runHistory(30, { everyDays: 2 }) });
    expect(week.sessions.every((session) => ExerciseDB.has(session.type))).toBeTruthy();
  });
});
