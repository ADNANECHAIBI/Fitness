/**
 * planner-engine.js — builds one WeeklyPlan and nothing else.
 *
 * It renders nothing, stores nothing, fetches nothing and imports no UI. Hand
 * it data, get a plain object back. Every decision inside it comes from a rule
 * in rules/, and every rule that fires leaves a sentence in plan.reasons.
 *
 * The pipeline, in order:
 *   1. phase      which block the week belongs to        (one rule wins)
 *   2. recovery   how far to pull the week back          (rules stack)
 *   3. gym        how many lifting days, how hard        (rules stack)
 *   4. running    how many running days, how hard        (rules stack)
 *   5. nutrition  calorie, protein and water targets     (rules stack)
 *   6. layout     turn counts into seven dated days      (deterministic)
 *
 * Stages 1–5 make decisions. Stage 6 only arranges them, so there is no policy
 * hidden in the layout code.
 */

import { defineFormula, createSlot } from './formula.js';
import { round, clamp } from './calculation-engine.js';
import { createPlanContext } from './plan-context.js';
import { selectOne, applyAll } from '../rules/rule.js';
import { DEFAULT_RULE_SETS, waterForDay } from '../rules/index.js';
import {
  DAY_TYPE, INTENSITY, PRIORITY, PHASE, PLANNER, SLEEP, UNITS,
} from './constants.js';

export const PLANNER_VERSION = '1.0.0';

/* ── Day focus ──────────────────────────────────────────────────────────────
   A focus is what the day is for, never what to do in it. Exercise selection
   belongs to a workout engine that does not exist yet.                      */

const GYM_FOCUS = {
  [PHASE.FOUNDATION]: 'technique and tolerance',
  [PHASE.HYPERTROPHY]: 'accumulating volume',
  [PHASE.STRENGTH]: 'heavy work, low volume',
  [PHASE.PEAK]: 'holding what you have built',
  [PHASE.RECOVERY]: 'light movement only',
};

const RUN_FOCUS = {
  [INTENSITY.EASY]: 'aerobic base, conversational',
  [INTENSITY.MODERATE]: 'steady effort',
  [INTENSITY.HARD]: 'sustained hard effort',
};

/* ── Layout ─────────────────────────────────────────────────────────────────
   Spreads the decided counts across the week. This is arrangement, not
   policy: it never decides how many of anything there should be.            */

/**
 * Choose which of the available slots get a given count, spread as evenly as
 * the slots allow, so training days do not bunch at the start of the week.
 */
function spread(slots, count) {
  if (count <= 0 || !slots.length) return [];
  if (count >= slots.length) return [...slots];

  const step = slots.length / count;
  return Array.from({ length: count }, (_, i) => slots[Math.round(i * step)])
    .filter((slot, i, list) => list.indexOf(slot) === i);
}

/**
 * Turn counts into seven typed days.
 * @returns {{layout: object[], capped: number}} capped = days forced to rest
 *          by the consecutive-days limit
 */
function layoutWeek(context, plan) {
  // Only slots that survive the consecutive-days limit can hold a session, so
  // the layout never has to take one back.
  const available = context.trainingSlots;

  const gymSlots = spread(available, plan.gymDays);
  const afterGym = available.filter((day) => !gymSlots.includes(day));

  const runSlots = spread(afterGym, plan.runningDays);
  const afterRun = afterGym.filter((day) => !runSlots.includes(day));

  const mobilitySlots = spread(afterRun, plan.mobilityDays ?? 0);

  const typeOf = (day) => {
    if (gymSlots.includes(day)) return DAY_TYPE.GYM;
    if (runSlots.includes(day)) return DAY_TYPE.RUNNING;
    if (mobilitySlots.includes(day)) return DAY_TYPE.MOBILITY;
    return DAY_TYPE.REST;
  };

  const layout = context.weekDays.map((day) => {
    const type = typeOf(day);
    const spacedOut =
      type === DAY_TYPE.REST &&
      context.availableDays.includes(day.weekday) &&
      !available.includes(day);

    return { ...day, type, forcedRest: spacedOut };
  });

  const capped = context.availableDayCount - context.maxTrainingDays;
  return { layout, capped };
}

/** Build one DailyPlan from a typed slot. */
function buildDay(day, context, plan) {
  const isRest = day.type === DAY_TYPE.REST;
  const isMobility = day.type === DAY_TYPE.MOBILITY;

  const durationMin = {
    [DAY_TYPE.GYM]: Math.round(context.sessionMinutes * (plan.volumeFactor ?? 1)),
    [DAY_TYPE.RUNNING]: Math.min(context.sessionMinutes, PLANNER.RUN_SESSION_MIN),
    [DAY_TYPE.MOBILITY]: PLANNER.MOBILITY_SESSION_MIN,
    [DAY_TYPE.REST]: 0,
  }[day.type];

  const focus = {
    [DAY_TYPE.GYM]: GYM_FOCUS[plan.phase] ?? 'general training',
    [DAY_TYPE.RUNNING]: RUN_FOCUS[plan.runningIntensity] ?? 'steady effort',
    [DAY_TYPE.MOBILITY]: 'joint range and tissue quality',
    [DAY_TYPE.REST]: day.forcedRest ? 'enforced rest' : 'recovery',
  }[day.type];

  const intensity = {
    [DAY_TYPE.GYM]: plan.gymIntensity ?? INTENSITY.MODERATE,
    [DAY_TYPE.RUNNING]: plan.runningIntensity ?? INTENSITY.MODERATE,
    [DAY_TYPE.MOBILITY]: INTENSITY.EASY,
    [DAY_TYPE.REST]: null,
  }[day.type];

  const priority = {
    [DAY_TYPE.GYM]: [PHASE.STRENGTH, PHASE.PEAK].includes(plan.phase)
      ? PRIORITY.ESSENTIAL : PRIORITY.IMPORTANT,
    [DAY_TYPE.RUNNING]: context.goal === 'cut' ? PRIORITY.IMPORTANT : PRIORITY.OPTIONAL,
    [DAY_TYPE.MOBILITY]: PRIORITY.OPTIONAL,
    [DAY_TYPE.REST]: plan.deload ? PRIORITY.ESSENTIAL : PRIORITY.IMPORTANT,
  }[day.type];

  const calories = plan.caloriesPerDay
    ? (isRest ? plan.caloriesPerDay.rest : plan.caloriesPerDay.training)
    : null;

  return {
    date: day.date,
    weekday: day.weekday,
    type: day.type,
    focus,
    intensity,
    durationMin,
    calories,
    proteinG: plan.proteinG ?? null,
    waterL: waterForDay({
      baselineL: plan.waterBaselineL,
      durationMin,
      type: day.type,
    }),
    priority,
    forcedRest: Boolean(day.forcedRest),
  };
}

/* ── The planner ────────────────────────────────────────────────────────── */

export const DEFAULT_PLANNER = defineFormula({
  id: 'rule-based-weekly-planner',
  name: 'Rule-based weekly planner',
  source: 'Block periodisation structure after Issurin VB. Sports Med. 2010;40(3):189-206. Deload cadence and load management conventions after Haff GG, Triplett NT (eds). Essentials of Strength Training and Conditioning. 4th ed. NSCA; 2016. Thresholds and shares are policy settings, not findings from these sources.',
  accuracy: 'estimate',
  useWhen: 'Producing a week that fits the days someone actually has, given what they logged recently. It plans structure — days, intensity and targets — not content.',
  caveat: 'It can only see what has been logged. An unlogged week looks like a break, and an unreported recovery score is assumed to be neutral. It will not know about anything that happened off the record.',

  /**
   * @param {object} context  built by createPlanContext
   * @returns {object} WeeklyPlan
   */
  compute(context, ruleSets = DEFAULT_RULE_SETS) {
    const reasons = [];
    const notes = [];

    // 1. Phase — exactly one wins.
    const phase = selectOne(ruleSets.phase, context);
    if (phase.reason) reasons.push(phase.reason);

    let plan = {
      phase: PHASE.HYPERTROPHY,
      deload: false,
      volumeFactor: 1,
      extraRestDays: 0,
      mobilityDays: 0,
      sleepTargetHours: SLEEP.TARGET_HOURS,
      ...phase.patch,
    };

    // 2–4. Recovery, then lifting, then running: each reads what came before.
    for (const stage of ['recovery', 'gym', 'running']) {
      const result = applyAll(ruleSets[stage], context, plan);
      plan = result.draft;
      reasons.push(...result.reasons);
    }

    // 5. Nutrition needs the rest-day count, so the layout runs first.
    const { layout, capped } = layoutWeek(context, plan);
    const restDayCount = layout.filter((day) => day.type === DAY_TYPE.REST).length;

    if (capped > 0) {
      notes.push(`${capped} available day${capped === 1 ? ' is' : 's are'} left as rest so training never runs more than ${PLANNER.MAX_CONSECUTIVE_TRAINING_DAYS} days in a row.`);
    }

    const nutrition = applyAll(ruleSets.nutrition, context, { ...plan, restDayCount });
    plan = nutrition.draft;
    reasons.push(...nutrition.reasons);

    // 6. Assemble.
    const days = layout.map((day) => buildDay(day, context, plan));

    if (context.availableDayCount === 0) {
      notes.push('No training days are available. Set your schedule, or the week can only be planned as rest.');
    }
    if (!context.strain.confident) {
      notes.push('Strain is estimated from very little history, so this week leans conservative. It will sharpen as sessions are logged.');
    }
    if (context.weightTrend.status === 'unknown' && context.goal !== 'maintain') {
      notes.push(`Weight trend is unknown — ${context.weightTrend.readings} recent weigh-in${context.weightTrend.readings === 1 ? '' : 's'}. Calorie and running decisions will get sharper once there are a few more.`);
    }

    const trainingDays = days.filter((day) => day.type !== DAY_TYPE.REST);
    const totalMinutes = trainingDays.reduce((total, day) => total + day.durationMin, 0);

    return {
      weekNumber: context.weekNumber,
      phase: plan.phase,
      deload: Boolean(plan.deload),
      startDate: context.weekStart,
      endDate: context.weekEnd,

      days,

      calories: plan.caloriesPerDay ?? { training: null, rest: null, average: null },
      proteinG: plan.proteinG ?? null,
      waterL: round(
        days.reduce((total, day) => total + day.waterL, 0) / UNITS.DAYS_PER_WEEK,
        2
      ),
      sleepTargetHours: round(plan.sleepTargetHours, 1),

      recovery: {
        score: context.recovery.score,
        reported: context.recovery.reported,
        strainIndex: context.strain.index,
        strainComponents: context.strain.components,
        restDays: restDayCount,
      },

      summary: {
        gymDays: days.filter((day) => day.type === DAY_TYPE.GYM).length,
        runningDays: days.filter((day) => day.type === DAY_TYPE.RUNNING).length,
        mobilityDays: days.filter((day) => day.type === DAY_TYPE.MOBILITY).length,
        restDays: restDayCount,
        totalMinutes,
        volumeFactor: round(plan.volumeFactor, 2),
      },

      notes,
      reasons,

      meta: {
        generatedAt: new Date().toISOString(),
        plannerVersion: PLANNER_VERSION,
        plannerId: 'rule-based-weekly-planner',
        formula: undefined,     // filled in below, avoids a self-reference
      },
    };
  },
});

/** The active planner. Swap the whole thing with plannerSlot.use(id). */
export const plannerSlot = createSlot('weekly-planner', DEFAULT_PLANNER);

export const PlannerEngine = Object.freeze({
  /**
   * Build a week from raw records.
   * @param {object} input  see createPlanContext
   * @param {{ruleSets?: object}} [options]
   * @returns {object} WeeklyPlan
   */
  plan(input, { ruleSets = DEFAULT_RULE_SETS } = {}) {
    const context = createPlanContext(input);
    return this.planFromContext(context, { ruleSets });
  },

  /** Build a week from an already-built context. Useful in tests. */
  planFromContext(context, { ruleSets = DEFAULT_RULE_SETS } = {}) {
    const plan = plannerSlot.current.compute(context, ruleSets);
    plan.meta.formula = plannerSlot.current.describe();
    plan.meta.context = {
      availableDays: context.availableDays,
      sessionMinutes: context.sessionMinutes,
      strainIndex: context.strain.index,
      weightTrend: context.weightTrend.status,
      layoffDays: context.layoff.days,
    };
    return plan;
  },

  /** Metadata for the planner currently installed. */
  formulas() { return { planner: plannerSlot.current.describe() }; },
});

export { createPlanContext };
