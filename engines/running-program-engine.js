/**
 * running-program-engine.js — builds one RunningWeek.
 *
 * It generates no pace arithmetic of its own: pace, speed and energy come from
 * running-engine.js, which owns those formulas. This engine decides what kind
 * of session goes where, how far it is, and why.
 *
 * Pure. No storage, no events, no UI.
 */

import { defineFormula, createSlot } from './formula.js';
import { round, clamp, sum } from './calculation-engine.js';
import { RunningEngine } from './running-engine.js';
import { createRunningContext, sessionLoad } from './running-context.js';
import { selectOne, applyAll, makeReason } from '../rules/rule.js';
import { RUNNING_RULE_SETS, QUALITY_TYPES } from '../rules/running/index.js';
import { RUNNING_PROGRAM, RUN_TYPE, UNITS } from './constants.js';

export const RUNNING_ENGINE_VERSION = '1.0.0';

/** Human-readable goal for each session type. */
const SESSION_GOAL = {
  [RUN_TYPE.EASY]: 'aerobic base at conversational effort',
  [RUN_TYPE.RECOVERY]: 'blood flow, nothing more',
  [RUN_TYPE.LONG]: 'the week\'s endurance session',
  [RUN_TYPE.TEMPO]: 'sustained comfortably hard effort',
  [RUN_TYPE.INTERVAL]: 'repeats above race effort',
  [RUN_TYPE.PROGRESSION]: 'start easy, finish strong',
  [RUN_TYPE.FARTLEK]: 'unstructured surges inside an easy run',
  [RUN_TYPE.STRIDES]: 'short accelerations, full recovery',
  [RUN_TYPE.WALK]: 'building the habit and the tissue tolerance',
};

/** Heart-rate range for a session type, if age is known. */
function heartRateZone(type, maxHeartRate) {
  const zone = RUNNING_PROGRAM.HR_ZONE[type];
  if (!zone || !maxHeartRate) return null;

  return {
    lowBpm: Math.round(maxHeartRate * zone[0]),
    highBpm: Math.round(maxHeartRate * zone[1]),
    percentOfMax: [Math.round(zone[0] * 100), Math.round(zone[1] * 100)],
    /* The maximum itself is an estimate, and the zones inherit that error. */
    estimated: true,
  };
}

/** Build one RunningSession from a slot and a decided type. */
function buildSession({ slot, type, context, week, reason, share }) {
  const paceFactor = RUNNING_PROGRAM.PACE_FACTOR[type] ?? 1;
  const isQuality = QUALITY_TYPES.includes(type);

  const targetPaceSec = round(context.easyPace.secPerKm * paceFactor, 0);

  const warmupMin = isQuality ? RUNNING_PROGRAM.QUALITY_WARMUP_MIN : RUNNING_PROGRAM.EASY_WARMUP_MIN;
  const cooldownMin = isQuality ? RUNNING_PROGRAM.QUALITY_COOLDOWN_MIN : RUNNING_PROGRAM.EASY_COOLDOWN_MIN;

  /* Distance from the week's budget, then trimmed to the time available. */
  const wanted = round((week.weeklyKm ?? 0) * share, 2);
  const runnableMin = Math.max(0, (slot.availableMinutes ?? 60) - warmupMin - cooldownMin);
  const maxKm = round((runnableMin * UNITS.SECONDS_PER_MINUTE) / targetPaceSec, 2);

  const distanceKm = round(clamp(wanted, 0.5, Math.max(0.5, maxKm)), 2);
  const durationMin = round((distanceKm * targetPaceSec) / UNITS.SECONDS_PER_MINUTE, 0);

  const trimmed = wanted > maxKm;

  return {
    date: slot.date,
    weekday: slot.weekday,
    type,
    goal: SESSION_GOAL[type] ?? 'general running',

    distanceKm,
    durationMin,
    totalMinutes: round(durationMin + warmupMin + cooldownMin, 0),

    targetPaceSecPerKm: targetPaceSec,
    targetPace: RunningEngine.formatPace(targetPaceSec),
    heartRateZone: heartRateZone(type, context.maxHeartRate),

    warmup: { minutes: warmupMin, description: isQuality
      ? 'Easy jogging until warm, then a few build-ups. Intervals on cold legs are how hamstrings tear.'
      : 'A few minutes of easy jogging to start.' },

    mainSet: {
      description: isQuality
        ? `${distanceKm} km of work at about ${RunningEngine.formatPace(targetPaceSec)} per km.`
        : `${distanceKm} km at about ${RunningEngine.formatPace(targetPaceSec)} per km, held steady.`,
      distanceKm,
      paceSecPerKm: targetPaceSec,
    },

    cooldown: { minutes: cooldownMin, description: 'Easy jogging or walking until the breathing settles.' },

    recovery: {
      isQuality,
      sessionRpe: RUNNING_PROGRAM.SESSION_RPE[type] ?? 5,
      load: sessionLoad({ durationMin, type }),
      hoursBeforeNextHard: isQuality ? 48 : 24,
    },

    notes: trimmed
      ? `Shortened to fit the ${slot.availableMinutes} minutes available.`
      : null,

    reason,
    priority: slot.priority ?? null,
  };
}

export const DEFAULT_RUNNING_BUILDER = defineFormula({
  id: 'rule-based-running-engine',
  name: 'Rule-based running engine',
  source: 'Polarised distribution — most running easy, a capped amount hard — after Seiler S. Int J Sports Physiol Perform. 2010;5(3):276-291. Session load is the session-RPE method of Foster C, et al. J Strength Cond Res. 2001;15(1):109-115. Heart-rate zones use the maximum from Tanaka H, et al. J Am Coll Cardiol. 2001;37(1):153-156.',
  accuracy: 'estimate',
  useWhen: 'Turning the running days the planner allocated into actual sessions, given what has been logged and how much lifting the week already holds.',
  caveat: 'Pace targets are derived from logged runs; with nothing logged they are a guess and the engine says so. Heart-rate zones inherit the error in the estimated maximum, which can be ten beats either way for an individual.',

  compute(context, ruleSets = RUNNING_RULE_SETS) {
    const reasons = [];
    const notes = [];

    if (context.restrictedFromRunning) {
      return emptyWeek(context, [makeReason(
        { id: 'running.restricted', name: 'Running restricted', scope: 'week' },
        `No running this week: the gait pattern is listed as restricted in your settings. Remove it there and sessions will return.`,
        {}
      )]);
    }

    if (context.runningDayCount === 0) {
      return emptyWeek(context, [makeReason(
        { id: 'running.no-days', name: 'No running days', scope: 'week' },
        `No running sessions this week — the planner gave every available day to lifting or rest.`,
        {}
      )]);
    }

    /* Week-level decisions. */
    let week = { weeklyKm: 0, qualityUsed: 0 };

    for (const stage of ['recovery', 'load', 'impact']) {
      const applied = applyAll(ruleSets[stage], context, week);
      week = applied.draft;
      reasons.push(...applied.reasons);
    }

    const progress = selectOne(ruleSets.progression, context, week);
    if (progress.reason) reasons.push(progress.reason);
    week = { ...week, ...progress.patch };

    /*
     * Pass one: decide the type of every session. The distance cannot be set
     * yet — each session's share of the week only means something once the
     * whole set of types is known, or a week with one run would prescribe a
     * quarter of the budget and leave the rest unrun.
     */
    const decided = [];
    for (const [position, day] of context.runningDays.entries()) {
      const slot = {
        ...day,
        position,
        isLast: position === context.runningDayCount - 1,
        availableMinutes: day.durationMin ?? 40,
        followsHardLifting: false,
      };

      const decision = selectOne(ruleSets.sessionType, { ...context, slot, week }, week);
      const type = decision.patch.type ?? RUN_TYPE.EASY;

      decided.push({ slot, type, reason: decision.reason });
      if (QUALITY_TYPES.includes(type)) week = { ...week, qualityUsed: (week.qualityUsed ?? 0) + 1 };
    }

    /* Pass two: normalise the shares so the week's distance is fully spent. */
    const shareTotal = decided.reduce(
      (total, entry) => total + (RUNNING_PROGRAM.SESSION_SHARE[entry.type] ?? 0.2), 0);

    const sessions = decided.map((entry) => buildSession({
      ...entry, context, week,
      share: shareTotal > 0
        ? (RUNNING_PROGRAM.SESSION_SHARE[entry.type] ?? 0.2) / shareTotal
        : 1 / decided.length,
    }));

    const shortfall = round((week.weeklyKm ?? 0) - round(sum(sessions.map((session) => session.distanceKm)), 2), 2);
    if (shortfall > 1) {
      notes.push(`The week's target was ${week.weeklyKm} km but only ${round((week.weeklyKm ?? 0) - shortfall, 2)} km fits the time available. Longer slots, or another running day, would close the gap.`);
    }

    if (context.easyPace.assumed) {
      notes.push('Pace targets are a starting guess — nothing has been logged to derive them from. They will sharpen after a few runs.');
    }
    if (!context.maxHeartRate) {
      notes.push('No heart-rate zones: they need your age, which is not set.');
    }

    const weeklyDistance = round(sum(sessions.map((session) => session.distanceKm)), 2);
    const weeklyDuration = round(sum(sessions.map((session) => session.totalMinutes)), 0);
    const weeklyLoad = round(sum(sessions.map((session) => session.recovery.load)), 0);

    return {
      weekNumber: context.weekNumber,
      startDate: context.weekStart,
      endDate: context.weekEnd,
      phase: context.phase,
      deload: context.deload,

      sessions,

      weeklyDistanceKm: weeklyDistance,
      weeklyDurationMin: weeklyDuration,
      weeklyLoad,
      targetDistanceKm: week.weeklyKm ?? 0,

      recoveryImpact: {
        level: week.recoveryImpact ?? 'unknown',
        liftingStrain: context.load.liftingStrain,
        acuteChronicRatio: context.load.ratio,
        qualitySessions: sessions.filter((session) => session.recovery.isQuality).length,
      },

      progress: week.progress ?? 'unknown',
      notes,
      reasons,

      meta: {
        generatedAt: new Date().toISOString(),
        engineVersion: RUNNING_ENGINE_VERSION,
        engineId: 'rule-based-running-engine',
        easyPaceSecPerKm: context.easyPace.secPerKm,
        easyPaceAssumed: context.easyPace.assumed,
      },
    };
  },
});

/** A week with no running still reports why. */
function emptyWeek(context, reasons) {
  return {
    weekNumber: context.weekNumber,
    startDate: context.weekStart,
    endDate: context.weekEnd,
    phase: context.phase,
    deload: context.deload,
    sessions: [],
    weeklyDistanceKm: 0,
    weeklyDurationMin: 0,
    weeklyLoad: 0,
    targetDistanceKm: 0,
    recoveryImpact: { level: 'none', liftingStrain: context.load.liftingStrain, acuteChronicRatio: context.load.ratio, qualitySessions: 0 },
    progress: 'unknown',
    notes: [],
    reasons,
    meta: {
      generatedAt: new Date().toISOString(),
      engineVersion: RUNNING_ENGINE_VERSION,
      engineId: 'rule-based-running-engine',
      easyPaceSecPerKm: context.easyPace.secPerKm,
      easyPaceAssumed: context.easyPace.assumed,
    },
  };
}

export const runningProgramSlot = createSlot('running-engine', DEFAULT_RUNNING_BUILDER);

export const RunningProgramEngine = Object.freeze({
  /**
   * Build a week of running.
   * @param {object} input see createRunningContext
   * @returns {object} RunningWeek
   */
  build(input, { ruleSets = RUNNING_RULE_SETS } = {}) {
    return this.buildFromContext(createRunningContext(input), { ruleSets });
  },

  buildFromContext(context, { ruleSets = RUNNING_RULE_SETS } = {}) {
    const week = runningProgramSlot.current.compute(context, ruleSets);
    week.meta.formula = runningProgramSlot.current.describe();
    return week;
  },

  /** Every reason in a week, flattened. */
  allReasons(runningWeek) {
    return [
      ...runningWeek.reasons,
      ...runningWeek.sessions.map((session) => session.reason).filter(Boolean),
    ];
  },

  formulas() { return { running: runningProgramSlot.current.describe() }; },
});

export { createRunningContext };
