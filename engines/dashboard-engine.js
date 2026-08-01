/**
 * dashboard-engine.js — phase 18. Everything, in one object.
 *
 * The engine that computes nothing at all.
 *
 * Phases 4 to 17 each produced a result: a WeeklyPlan, a WorkoutWeek, a
 * RunningWeek, a NutritionWeek, a MealPlanWeek, a WorkoutSession, a
 * WeeklyReport, a WeeklyInsights set. Every one of them is correct on its own
 * and none of them is a screen. What was missing was the join — one object a
 * consumer can read top to bottom without asking eight services eight
 * questions and then working out how the answers relate.
 *
 * That join is all this file is. Three properties it is built to hold:
 *
 *   1. **No figure originates here.** Every number in a DashboardSnapshot was
 *      produced by an engine that owns it, and `explanations` names which.
 *      Where the dashboard does arithmetic at all it is subtraction and
 *      addition over two numbers that already existed — what is left to eat,
 *      how many minutes today asks for, how many weeks until a goal weight at
 *      the rate the body engine measured — and each is recorded as such,
 *      attributed to the calculation engine, with both operands in `inputs`.
 *      There is no second path to any of it: if a figure is not in the input,
 *      it is null and says why.
 *
 *   2. **Every element carries a reason.** Sections carry the explanation of
 *      the figures inside them; the three judgements the dashboard makes —
 *      what matters most today, how loud the health summary is, what is worth
 *      a notification — are rules in `rules/dashboard/`, and each returns its
 *      sentence with its patch. A notification arriving without a title, a
 *      message, a severity or a reason is dropped and the drop is counted,
 *      the same stance phases 16 and 17 took.
 *
 *   3. **No display logic.** A snapshot holds no HTML, no CSS, no colours, no
 *      language and no ordering for the eye beyond the rank its own rules
 *      assigned. Anything that wants to draw one can; nothing in here knows
 *      it will be drawn.
 *
 * Pure: same input, same snapshot. No storage, no events, no clock except the
 * `generatedAt` stamp the caller may override. Caching belongs to the service
 * above it, which is where the bus is.
 */

import { createDashboardContext } from './dashboard-context.js';
import { createExplainer, SOURCE, describeExplanation } from './report-explain.js';
import { selectOne, applyAll, makeReason } from '../rules/rule.js';
import { DASHBOARD_RULE_SETS } from '../rules/dashboard/index.js';
import { round, sum, toNumber, divide } from './calculation-engine.js';
import {
  DASHBOARD, DASHBOARD_SEVERITY, DASHBOARD_RISK, RECOVERY_STATUS, PRIORITY,
  NOTIFICATION, REPORTS, INSIGHT_SEVERITY, UNITS, PRECISION,
} from './constants.js';

export const DASHBOARD_ENGINE_VERSION = '1.0.0';

/* ── Carrying a figure across ───────────────────────────────────────────────
   Most of what a snapshot holds already has an explanation: the reports
   engine recorded one when it produced the number. Re-explaining it here
   would create a second account of the same figure that could drift from the
   first, so the original is carried through and the dashboard notes only
   that it did the carrying.                                                */

/**
 * Build the relay for one snapshot.
 * @param {object} explain the snapshot's own explainer
 * @param {object|null} report the WeeklyReport, if there is one
 */
function relayFrom(explain, report) {
  /**
   * @param {string} key       where the figure sits in the snapshot
   * @param {string} reportKey where it sat in the report
   * @param {*} value          the value being carried
   */
  return function relay(key, reportKey, value, extra = {}) {
    const origin = report?.explanations?.[reportKey] ?? null;

    return explain.figure(key, value, {
      unit: extra.unit ?? origin?.unit,
      source: origin?.source ?? extra.source ?? SOURCE.REPORTS,
      method: origin
        ? `carried unchanged from the weekly report's "${reportKey}" — ${origin.method}`
        : (extra.method ?? `the weekly report holds no "${reportKey}", so this is null rather than a zero the dashboard made up`),
      inputs: origin ? { ...origin.inputs, carriedFrom: reportKey } : (extra.inputs ?? {}),
      note: extra.note ?? origin?.note,
    });
  };
}

/* ── What is left to eat ────────────────────────────────────────────────────
   The one piece of arithmetic the old application-layer dashboard did, moved
   here so it sits beside its explanation. Two numbers, both produced
   elsewhere: the nutrition engine's target and the day's logged intake.    */

function remainingIntake(context, explain) {
  if (context.targetCalories === null && context.targetProteinG === null) {
    explain.note('today.remaining.unavailable',
      'No nutrition day reached the dashboard, so there is no target to subtract logged intake from.',
      { source: SOURCE.DASHBOARD, inputs: { date: context.date } });
    return null;
  }

  const calories = explain.figure('today.remainingCalories',
    round((context.targetCalories ?? 0) - (context.loggedCalories ?? 0), PRECISION.KCAL), {
      unit: 'kcal', source: SOURCE.CALCULATION,
      method: "the nutrition engine's calorie target for the day minus the calories logged against it",
      inputs: {
        targetCalories: context.targetCalories,
        loggedCalories: context.loggedCalories,
        logged: context.intakeLogged,
      },
      note: context.intakeLogged
        ? undefined
        : 'Nothing is logged yet, so this equals the whole target. It is not a shortfall until the day ends.',
    });

  const proteinG = explain.figure('today.remainingProteinG',
    round((context.targetProteinG ?? 0) - (context.loggedProteinG ?? 0), PRECISION.PERCENT), {
      unit: 'g', source: SOURCE.CALCULATION,
      method: "the nutrition engine's protein target for the day minus the protein logged against it",
      inputs: {
        targetProteinG: context.targetProteinG,
        loggedProteinG: context.loggedProteinG,
        logged: context.intakeLogged,
      },
    });

  return { calories, proteinG, logged: context.intakeLogged };
}

/* ── Today's list ───────────────────────────────────────────────────────────
   Moved out of app/dashboard-service.js in phase 18. Ordering the day is a
   decision about the domain, and the application layer had no business
   making it — it belonged next to the priorities the planner assigns.

   A task carries what it is, not how to say it. Where an engine wrote the
   wording — a session's goal, a run's type, the focus of a rest day — it is
   passed through as written. Everything else names a label and supplies the
   numbers, and the page turns that into a sentence.                        */

function buildTasks(context, remaining) {
  const tasks = [];

  if (context.hasWorkout) {
    tasks.push({
      kind: 'workout',
      labelText: context.workout.goal,
      detailKey: 'ui.task.workout',
      detailVars: {
        count: context.workout.exercises?.length ?? 0,
        minutes: context.workout.estimatedMinutes,
      },
      done: false,
      inProgress: context.sessionInProgress,
      priority: context.workout.priority ?? PRIORITY.IMPORTANT,
      sourceEngine: 'workout-engine',
    });
  }

  if (context.hasRun) {
    tasks.push({
      kind: 'running',
      labelText: String(context.run.type).replace(/-/g, ' '),
      detailKey: 'ui.task.running',
      detailVars: { km: context.run.distanceKm, pace: context.run.targetPace },
      done: false,
      priority: PRIORITY.IMPORTANT,
      sourceEngine: 'running-program-engine',
    });
  }

  if (context.meals) {
    tasks.push({
      kind: 'meals',
      labelKey: 'ui.dashboard.mealsCount',
      labelVars: { n: context.meals.meals?.length ?? 0 },
      detailKey: remaining?.logged ? 'ui.task.mealsLeft' : 'ui.task.mealsPlanned',
      detailVars: remaining?.logged
        ? { kcal: remaining.calories, protein: remaining.proteinG }
        : { kcal: context.meals.calories, mad: context.meals.costMad },
      done: Boolean(remaining?.logged) && remaining.calories <= 0,
      priority: PRIORITY.ESSENTIAL,
      sourceEngine: 'meal-planning-engine',
    });
  }

  if (context.planDay && context.restDay) {
    tasks.push({
      kind: 'rest',
      labelKey: 'ui.task.rest',
      detailText: context.planDay.focus ?? null,
      detailKey: context.planDay.focus ? null : 'ui.task.recovery',
      done: true,
      priority: PRIORITY.OPTIONAL,
      sourceEngine: 'planner-engine',
    });
  }

  return tasks.sort((a, b) => a.priority - b.priority);
}

/* ── Today ──────────────────────────────────────────────────────────────── */

function todaySummary(context, { remaining, tasks, focus }, explain) {
  const minutes = [
    context.hasWorkout ? toNumber(context.workout.estimatedMinutes) : null,
    context.hasRun ? toNumber(context.run.totalMinutes) : null,
    context.meals ? toNumber(context.meals.prepMinutes) : null,
  ].filter((value) => value !== null);

  const requiredMinutes = explain.figure('today.requiredMinutes',
    minutes.length ? round(sum(minutes), 0) : null, {
      unit: 'minutes', source: SOURCE.CALCULATION,
      method: minutes.length
        ? 'the minutes each engine already estimated for its own part of the day, added together — the workout engine\'s session estimate, the running engine\'s total including warm-up and cool-down, and the meal engine\'s preparation time'
        : 'nothing is planned for today, so no time is asked for',
      inputs: {
        workoutMinutes: context.hasWorkout ? context.workout.estimatedMinutes : null,
        runMinutes: context.hasRun ? context.run.totalMinutes : null,
        mealPrepMinutes: context.meals?.prepMinutes ?? null,
      },
      note: 'Preparation and training are added as if they do not overlap, which is the pessimistic reading.',
    });

  /* The rule chose a kind; the task list already holds the thing itself. */
  const topTask = tasks.find((task) => task.kind === focus.kind) ?? null;

  return {
    date: context.date,
    weekday: context.planDay?.weekday ?? null,

    hasWorkout: context.hasWorkout,
    hasRun: context.hasRun,
    hasMeals: context.hasMeals,

    requiredMinutes,

    remainingCalories: remaining?.calories ?? null,
    remainingProteinG: remaining?.proteinG ?? null,
    intakeLogged: context.intakeLogged,

    recoveryStatus: context.recoveryStatus,

    topTask: {
      kind: focus.kind,
      task: topTask,
      open: Boolean(focus.open),
      reason: focus.reason,
      sourceEngine: topTask?.sourceEngine ?? 'planner-engine',
    },

    tasks,
  };
}

/* ── The week ───────────────────────────────────────────────────────────── */

function weekSummary(context, relay) {
  const report = context.report;

  return {
    weekStart: report?.range?.start ?? context.plan?.startDate ?? null,
    weekEnd: report?.range?.end ?? context.plan?.endDate ?? null,
    weekNumber: report?.weekNumber ?? context.plan?.weekNumber ?? null,
    phase: context.plan?.phase ?? null,
    deload: Boolean(context.plan?.deload),

    trainingCompletion: relay('week.trainingCompletion', 'gym.adherencePercent',
      toNumber(report?.adherence?.gym), { unit: '%' }),

    runningCompletion: relay('week.runningCompletion', 'running.adherencePercent',
      toNumber(report?.adherence?.running), { unit: '%' }),

    nutritionAdherence: relay('week.nutritionAdherence', 'nutrition.adherencePercent',
      toNumber(report?.adherence?.nutrition), { unit: '%' }),

    mealAdherence: relay('week.mealAdherence', 'meals.compliancePercent',
      toNumber(report?.meals?.compliancePercent), { unit: '%' }),

    overallAdherence: relay('week.overallAdherence', 'adherence.overall',
      toNumber(report?.adherence?.overall), { unit: '%' }),

    recovery: {
      status: context.recoveryStatus,
      strainIndex: relay('week.strainIndex', 'recovery.strainIndex',
        toNumber(report?.recovery?.strainIndex) ?? context.strainIndex, { unit: '0–100' }),
    },

    load: {
      gymVolumeKg: relay('week.gymVolumeKg', 'load.gymVolumeKg',
        toNumber(report?.trainingLoad?.gymVolumeKg), { unit: 'kg' }),
      gymSets: toNumber(report?.trainingLoad?.gymSets),
      runningKm: relay('week.runningKm', 'running.distanceKm',
        toNumber(report?.trainingLoad?.runningKm), { unit: 'km' }),
      runningLoad: report?.trainingLoad?.runningLoad ?? null,
      verdict: report?.trainingLoad?.verdict ?? 'unknown',
    },

    weightChangeKg: relay('week.weightChangeKg', 'weight.changeKg',
      toNumber(report?.weight?.changeKg), { unit: 'kg' }),

    weightRateKgPerWeek: relay('week.weightRateKgPerWeek', 'weight.weeklyChangeKg',
      toNumber(report?.weight?.weeklyChangeKg), { unit: 'kg/week' }),

    goalProgressPercent: relay('week.goalProgressPercent', 'weight.progressPercent',
      toNumber(report?.weight?.progressPercent) ?? toNumber(context.weightProgress?.percent),
      { unit: '%' }),

    streakWeeks: relay('week.streakWeeks', 'streak.weeks',
      context.figure('streak.weeks'), { unit: 'weeks' }),

    planned: {
      gymDays: context.plan?.summary?.gymDays ?? null,
      runningDays: context.plan?.summary?.runningDays ?? null,
      restDays: context.plan?.summary?.restDays ?? null,
      volumeFactor: context.plan?.summary?.volumeFactor ?? null,
      totalMinutes: context.plan?.summary?.totalMinutes ?? null,
    },

    coverage: report?.coverage ?? { ratio: null, level: REPORTS.CONFIDENCE_LEVEL.LOW, daysWithData: null },
  };
}

/* ── Health ─────────────────────────────────────────────────────────────── */

function healthSummary(context, { risk }, relay) {
  return {
    recoveryStatus: context.recoveryStatus,
    strainIndex: context.strainIndex,
    strainComponents: context.recovery?.strainComponents ?? {},
    reportedScore: toNumber(context.recovery?.reportedScore),

    fatigue: relay('health.fatigue', 'recovery.avgFatigue',
      toNumber(context.report?.recovery?.avgFatigue), { unit: '1–10' }),

    sleepTargetHours: toNumber(context.plan?.sleepTargetHours),
    sleepHours: toNumber(context.recovery?.sleepHours),

    waterTargetL: context.targetWaterL,

    riskLevel: risk.level,
    riskReason: risk.reason,
  };
}

/* ── The goal ───────────────────────────────────────────────────────────── */

/**
 * Where the goal weight is, and when it arrives at the current rate.
 *
 * The projection is the only forward-looking number in the snapshot, and it
 * is a division: how far is left, over how fast the body engine measured the
 * scale moving. It is refused rather than guessed in three cases — no goal,
 * no measured rate, or a rate pointing away from the goal — because a date
 * produced from a rate of zero is not an estimate, it is a division by
 * something close enough to zero to mean anything.
 */
function goalSummary(context, explain, relay) {
  const goal = context.goal;

  const expectedWeeklyKg = explain.figure('goal.expectedWeeklyKg',
    toNumber(context.nutrition?.expectedWeightTrend?.kgPerWeek), {
      unit: 'kg/week', source: SOURCE.NUTRITION,
      method: 'the rate the nutrition engine built this week\'s calorie target to produce',
      inputs: {
        goal,
        dailyCalories: context.nutrition?.calories ?? null,
      },
    });

  const currentTrend = relay('goal.currentTrendKgPerWeek', 'weight.weeklyChangeKg',
    toNumber(context.report?.weight?.weeklyChangeKg)
      ?? toNumber(context.nutrition?.expectedWeightTrend?.observedKgPerWeek),
    { unit: 'kg/week' });

  const currentKg = toNumber(context.weightProgress?.current)
    ?? toNumber(context.report?.weight?.currentKg);
  const goalKg = toNumber(context.weightProgress?.goal)
    ?? toNumber(context.report?.weight?.goalKg);

  const remainingKg = explain.figure('goal.remainingKg',
    currentKg !== null && goalKg !== null ? round(goalKg - currentKg, PRECISION.KG) : null, {
      unit: 'kg', source: SOURCE.CALCULATION,
      method: 'the goal weight minus the current weight, both as the profile and the body engine hold them',
      inputs: { currentKg, goalKg },
    });

  const progressPercent = relay('goal.progressPercent', 'weight.progressPercent',
    toNumber(context.report?.weight?.progressPercent) ?? toNumber(context.weightProgress?.percent),
    { unit: '%' });

  const eta = projectArrival({ remainingKg, currentTrend, date: context.date }, explain);

  return {
    goal,
    expectedWeeklyKg,
    currentTrendKgPerWeek: currentTrend,
    currentWeightKg: currentKg,
    goalWeightKg: goalKg,
    remainingKg,
    progressPercent,
    eta,
    confidence: context.report?.coverage?.level ?? REPORTS.CONFIDENCE_LEVEL.LOW,
  };
}

/** How long the remaining distance takes at the measured rate, or why not. */
function projectArrival({ remainingKg, currentTrend, date }, explain) {
  const refuse = (reason, inputs) => {
    explain.note('goal.eta.unavailable', reason, { source: SOURCE.DASHBOARD, inputs });
    return { available: false, weeks: null, date: null, reason };
  };

  if (remainingKg === null) {
    return refuse('No goal weight is on record, so there is nothing to arrive at.', { remainingKg });
  }

  if (currentTrend === null) {
    return refuse('The scale has no fitted rate yet — a trend line needs at least two weigh-ins on different days — so no arrival can be projected.', { remainingKg, currentTrend });
  }

  if (Math.abs(currentTrend) < DASHBOARD.MIN_RATE_FOR_ETA_KG) {
    return refuse(`The measured rate is ${currentTrend} kg per week, below the ${DASHBOARD.MIN_RATE_FOR_ETA_KG} kg needed before a date means anything. Dividing by a rate this close to zero produces a number, not an estimate.`, { remainingKg, currentTrend });
  }

  if (Math.sign(currentTrend) !== Math.sign(remainingKg)) {
    return refuse(`The scale is moving at ${currentTrend} kg per week and the goal is ${remainingKg} kg in the other direction, so at the current rate it is not approached at all.`, { remainingKg, currentTrend });
  }

  const weeks = round(divide(remainingKg, currentTrend) ?? 0, 1);

  if (weeks > DASHBOARD.MAX_ETA_WEEKS) {
    return refuse(`At ${currentTrend} kg per week the goal is ${weeks} weeks away, beyond the ${DASHBOARD.MAX_ETA_WEEKS}-week horizon this projection is reported inside.`, { remainingKg, currentTrend, weeks });
  }

  explain.figure('goal.eta.weeks', weeks, {
    unit: 'weeks', source: SOURCE.CALCULATION,
    method: 'the kilograms still to go, divided by the rate per week the body engine fitted through the recent weigh-ins',
    inputs: { remainingKg, ratePerWeek: currentTrend },
    note: 'A straight-line projection of a rate measured over a few weeks. It assumes nothing changes, which nothing ever does.',
  });

  return {
    available: true,
    weeks,
    date: addWeeks(date, weeks),
    reason: `${remainingKg} kg still to go at the ${currentTrend} kg per week the body engine measured across the recent weigh-ins.`,
  };
}

/** A date `weeks` from another, as ISO. Calendar arithmetic, nothing more. */
function addWeeks(date, weeks) {
  if (!date) return null;
  const start = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;

  return new Date(start.getTime() + weeks * UNITS.DAYS_PER_WEEK * 86400000)
    .toISOString().slice(0, 10);
}

/* ── Insights ───────────────────────────────────────────────────────────────
   Read from the insights engine and nothing else. This section chooses which
   of its records to carry, never what they say, and re-ranks nothing: the
   order is the one the insights engine already assigned.                   */

function insightSummary(context) {
  const insights = context.insights;

  if (!insights) {
    return {
      available: false,
      highestPriority: null,
      critical: [],
      recentImprovements: [],
      topRecommendations: [],
      counts: { total: 0, positive: 0, neutral: 0, warning: 0, critical: 0 },
      reason: 'No insight set reached the dashboard, so nothing is reported as standing out. That is different from a week in which nothing did.',
      sourceEngine: 'insights-engine',
    };
  }

  const all = insights.all ?? [];
  const critical = all.filter((insight) => insight.severity === INSIGHT_SEVERITY.CRITICAL);

  return {
    available: true,

    highestPriority: insights.priority?.[0] ?? all[0] ?? null,

    critical: critical.slice(0, DASHBOARD.MAX_CRITICAL_INSIGHTS),

    recentImprovements: (insights.positive ?? []).slice(0, DASHBOARD.MAX_IMPROVEMENTS),

    /* Recommendations belong to the reports engine. The insights engine never
       advises, and neither does this one — they are carried across as they
       were written, in the order the report kept them. */
    topRecommendations: (context.recommendations ?? []).slice(0, DASHBOARD.MAX_RECOMMENDATIONS),

    top: (insights.priority ?? all).slice(0, DASHBOARD.MAX_TOP_INSIGHTS),

    counts: {
      total: all.length,
      positive: (insights.positive ?? []).length,
      neutral: (insights.neutral ?? []).length,
      warning: (insights.warning ?? []).length,
      critical: critical.length,
    },

    reason: `${all.length} insight${all.length === 1 ? '' : 's'} were ranked by the insights engine; this section carries the top of that ranking without reordering it.`,
    sourceEngine: 'insights-engine',
  };
}

/* ── Notifications ──────────────────────────────────────────────────────────
   Two origins, one list. The rules describe what is *currently true* —  a
   session planned and not started is not an event and was never written
   down. The stored records describe what *happened* — the notification
   engine wrote them at the time. Both end up in the same shape, with the
   same four required fields, and neither is allowed in without them.      */

const REQUIRED_FIELDS = ['title', 'message', 'severity', 'reason'];

/** Turn a stored Notification record into the snapshot's shape. */
function fromStored(record) {
  const severity = {
    [NOTIFICATION.PRIORITY.HIGH]: DASHBOARD_SEVERITY.WARNING,
    [NOTIFICATION.PRIORITY.NORMAL]: DASHBOARD_SEVERITY.INFO,
    [NOTIFICATION.PRIORITY.LOW]: DASHBOARD_SEVERITY.INFO,
  }[record.priority] ?? DASHBOARD_SEVERITY.INFO;

  return {
    key: `stored.${record.id}`,
    id: record.id,
    type: record.type,
    title: record.title,
    message: record.message,
    severity,
    reason: `The notification engine recorded this on ${record.date} when ${record.source ?? 'something'} reported it, and it has not been read. It is carried through unchanged rather than restated.`,
    evidence: {
      storedId: record.id,
      type: record.type,
      date: record.date,
      priority: record.priority,
      source: record.source ?? null,
    },
    sourceEngine: record.source ?? 'notification-engine',
    stored: true,
    date: record.date,
  };
}

/**
 * Merge, check, dedupe and rank.
 * @returns {{notifications: object[], dropped: object[], merged: number}}
 */
function assembleNotifications(drafts, stored, date) {
  const kept = [];
  const dropped = [];

  for (const draft of [...drafts, ...stored]) {
    const missing = REQUIRED_FIELDS.filter((field) => !draft?.[field]);
    const hasEvidence = draft?.evidence && Object.keys(draft.evidence).length > 0;

    if (missing.length) {
      dropped.push({ key: draft?.key ?? 'unnamed', refusedFor: `missing ${missing.join(', ')}` });
      continue;
    }
    if (!hasEvidence) {
      dropped.push({ key: draft.key, refusedFor: 'no evidence' });
      continue;
    }

    kept.push({ ...draft, date: draft.date ?? date, stored: Boolean(draft.stored) });
  }

  /* Two notifications about the same thing are one notification. The louder
     severity survives — a warning folded into an info would hide itself. */
  const byKey = new Map();
  let merged = 0;

  for (const item of kept) {
    const existing = byKey.get(item.key);
    if (!existing) { byKey.set(item.key, item); continue; }

    merged += 1;
    const louder = DASHBOARD.SEVERITY_RANK[item.severity] > DASHBOARD.SEVERITY_RANK[existing.severity];
    byKey.set(item.key, louder ? { ...item, mergedFrom: existing.key } : { ...existing, mergedFrom: item.key });
  }

  const ranked = [...byKey.values()].sort((a, b) => {
    const bySeverity = (DASHBOARD.SEVERITY_RANK[b.severity] ?? 0) - (DASHBOARD.SEVERITY_RANK[a.severity] ?? 0);
    if (bySeverity !== 0) return bySeverity;
    return String(a.key).localeCompare(String(b.key));
  });

  return {
    notifications: ranked.slice(0, DASHBOARD.MAX_NOTIFICATIONS),
    dropped,
    merged,
    total: ranked.length,
  };
}

/* ── The snapshot ───────────────────────────────────────────────────────── */

/**
 * Assemble one DashboardSnapshot.
 *
 * @param {import('./dashboard-context.js').DashboardInput} input
 * @returns {object} DashboardSnapshot, frozen
 */
function snapshot(input = {}) {
  const context = createDashboardContext(input);
  const explain = createExplainer();
  const relay = relayFrom(explain, context.report);

  /* 1. The one subtraction, recorded before anything reads it. */
  const remaining = remainingIntake(context, explain);

  /* 2. The rules see the context plus that subtraction, and nothing else. */
  const ruleContext = { ...context, remaining };

  const focusChoice = selectOne(DASHBOARD_RULE_SETS.focus, ruleContext);
  const riskChoice = selectOne(DASHBOARD_RULE_SETS.risk, ruleContext);
  const notified = applyAll(DASHBOARD_RULE_SETS.notification, ruleContext, { notifications: [] });

  const focus = {
    kind: focusChoice.patch?.focus?.kind ?? null,
    open: Boolean(focusChoice.patch?.focus?.open),
    reason: focusChoice.reason?.message
      ?? 'No focus rule matched, which happens only when there is neither a plan nor a day to describe.',
    ruleId: focusChoice.rule?.id ?? null,
  };

  const risk = {
    level: riskChoice.patch?.risk ?? DASHBOARD_RISK.UNKNOWN,
    reason: riskChoice.reason?.message
      ?? 'No risk rule matched, so the level is reported as unknown rather than as safe.',
    ruleId: riskChoice.rule?.id ?? null,
  };

  explain.note('today.focus',
    `${focus.reason} [rule: ${focus.ruleId ?? 'none'}]`,
    { source: SOURCE.DASHBOARD, inputs: { kind: focus.kind } });

  explain.note('health.riskLevel',
    `${risk.reason} [rule: ${risk.ruleId ?? 'none'}]`,
    { source: SOURCE.DASHBOARD, inputs: { level: risk.level } });

  /* 3. The sections. */
  const tasks = buildTasks(context, remaining);
  const today = todaySummary(context, { remaining, tasks, focus }, explain);
  const week = weekSummary(context, relay);
  const health = healthSummary(context, { risk }, relay);
  const goal = goalSummary(context, explain, relay);
  const insights = insightSummary(context);

  const notifications = assembleNotifications(
    notified.draft.notifications,
    context.storedNotifications.map(fromStored),
    context.date
  );

  /* 4. Reasons — the ones the engines gave, then the ones the rules gave. */
  const reasons = collectReasons(context, { focusChoice, riskChoice, notified, notifications });

  return Object.freeze({
    /* Kept at the top level since phase 12; the sections below are additions,
       not replacements. Anything already reading these keeps working. */
    date: context.date,
    weekNumber: week.weekNumber,
    phase: week.phase,
    deload: week.deload,
    tasks,

    workout: context.hasWorkout ? {
      goal: context.workout.goal,
      exercises: context.workout.exercises?.length ?? 0,
      estimatedMinutes: context.workout.estimatedMinutes,
      targetMuscles: context.workout.targetMuscles,
      inProgress: context.sessionInProgress,
      priority: context.workout.priority ?? null,
    } : null,

    running: context.hasRun ? {
      type: context.run.type,
      distanceKm: context.run.distanceKm,
      targetPace: context.run.targetPace,
      totalMinutes: context.run.totalMinutes,
    } : null,

    nutrition: context.nutrition ? {
      calories: context.nutrition.calories,
      proteinG: context.nutrition.proteinG,
      carbsG: context.nutrition.carbsG,
      fatG: context.nutrition.fatG,
      waterL: context.nutrition.waterL,
      remaining,
    } : null,

    meals: context.meals ? {
      count: context.meals.meals?.length ?? 0,
      costMad: context.meals.costMad,
      prepMinutes: context.meals.prepMinutes,
      withinBudget: context.meals.withinBudget ?? null,
      slots: (context.meals.meals ?? []).map((meal) => ({
        slot: meal.slot,
        calories: meal.calories,
        foods: (meal.foods ?? []).map((food) => ({
          foodId: food.foodId, name: food.name, quantity: food.quantity,
        })),
      })),
    } : null,

    weeklyProgress: {
      gymDaysPlanned: week.planned.gymDays,
      runningDaysPlanned: week.planned.runningDays,
      restDays: week.planned.restDays,
      volumeFactor: week.planned.volumeFactor,
    },

    recovery: {
      status: context.recoveryStatus,
      strainIndex: context.strainIndex,
      reportedScore: toNumber(context.recovery?.reportedScore),
    },

    /* ── Phase 18: the sections ──────────────────────────────────────── */

    today,
    week,
    health,
    goal,
    insights,

    currentWeightKg: goal.currentWeightKg,
    streak: week.streakWeeks,

    activeWarnings: (context.warnings ?? []).slice(0, DASHBOARD.MAX_WARNINGS),
    activeAchievements: (context.achievements ?? []).slice(0, DASHBOARD.MAX_ACHIEVEMENTS),
    topInsights: insights.top ?? [],
    recommendations: insights.topRecommendations,

    notifications: notifications.notifications,

    reasons,
    explanations: explain.map(),

    /** One figure, taken apart. */
    explain(key) { return explain.lookup(key); },
    /** The same as a sentence — for a console or a test, not for a screen. */
    describe(key) { return describeExplanation(explain.lookup(key)); },

    /** Which engines were heard from, and which were not. */
    sources: context.available,
    missing: context.missing,

    generatedAt: input.generatedAt ?? new Date().toISOString(),

    meta: {
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      engineVersion: DASHBOARD_ENGINE_VERSION,
      engineId: 'dashboard-engine',
      rulesApplied: [
        ...(focusChoice.rule ? [focusChoice.rule.id] : []),
        ...(riskChoice.rule ? [riskChoice.rule.id] : []),
        ...notified.applied,
      ],
      notificationsProduced: notifications.total,
      notificationsDropped: notifications.dropped,
      notificationsMerged: notifications.merged,
      reportEngineVersion: context.report?.meta?.engineVersion ?? null,
      insightsEngineVersion: context.insights?.meta?.engineVersion ?? null,
      /** Nothing in this list was calculated here. */
      recalculated: [],
    },
  });
}

/**
 * Every reason behind the snapshot, in the order the decisions were made.
 *
 * The engines' own reasons come first — they explain the plan the day sits
 * inside — then the three the dashboard's rules produced. Nothing is
 * rewritten on the way through: a reason is data, and this is a list of it.
 */
function collectReasons(context, { focusChoice, riskChoice, notified, notifications }) {
  const reasons = [];

  if (context.planDay?.reason) reasons.push(context.planDay.reason);
  if (context.workout?.reasons?.length) reasons.push(...context.workout.reasons);
  if (context.run?.reason) reasons.push(context.run.reason);
  if (context.nutrition?.reason) reasons.push(context.nutrition.reason);
  if (context.meals?.reason) reasons.push(context.meals.reason);

  if (focusChoice.reason) reasons.push(focusChoice.reason);
  if (riskChoice.reason) reasons.push(riskChoice.reason);
  reasons.push(...notified.reasons);

  if (context.missing.length) {
    reasons.push(makeReason(
      { id: 'dashboard.missing-inputs', name: 'Missing inputs', scope: 'day' },
      `${context.missing.length} of the engines the dashboard reads produced nothing for this day: ${context.missing.map((gap) => `${gap.input} (${gap.engine})`).join(', ')}. Every figure that would have come from them is null, not zero.`,
      { missing: context.missing }
    ));
  }

  if (notifications.dropped.length) {
    reasons.push(makeReason(
      { id: 'dashboard.notifications-dropped', name: 'Notifications dropped', scope: 'day' },
      `${notifications.dropped.length} notification${notifications.dropped.length === 1 ? '' : 's'} arrived without the title, message, severity, reason or evidence phase 18 requires and ${notifications.dropped.length === 1 ? 'was' : 'were'} dropped: ${notifications.dropped.map((item) => `${item.key} (${item.refusedFor})`).join(', ')}.`,
      { dropped: notifications.dropped }
    ));
  }

  if (notifications.total > DASHBOARD.MAX_NOTIFICATIONS) {
    reasons.push(makeReason(
      { id: 'dashboard.notifications-capped', name: 'Notifications capped', scope: 'day' },
      `${notifications.total} notifications applied and the loudest ${DASHBOARD.MAX_NOTIFICATIONS} are carried. The rest exist in the engines that raised them; a dashboard that shows everything shows nothing.`,
      { total: notifications.total, shown: DASHBOARD.MAX_NOTIFICATIONS }
    ));
  }

  return reasons.slice(0, DASHBOARD.MAX_REASONS);
}

export const DashboardEngine = Object.freeze({
  /**
   * @param {object} input everything the other engines produced for the day
   * @returns {object} DashboardSnapshot
   */
  snapshot,

  /** The severity and risk vocabularies, for a consumer that switches on them. */
  SEVERITY: DASHBOARD_SEVERITY,
  RISK: DASHBOARD_RISK,
  STATUS: RECOVERY_STATUS,

  version: DASHBOARD_ENGINE_VERSION,
});
