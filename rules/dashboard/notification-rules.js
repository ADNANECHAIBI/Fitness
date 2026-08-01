/**
 * notification-rules.js — what today is worth telling someone about.
 *
 * These are not the stored notifications. `app/notification-engine.js` writes
 * a record when something *happens* — a set was logged, a weight was
 * recorded — and those records are read back into the snapshot unchanged.
 * These rules answer a different question: given the state of today, what is
 * currently true and worth saying? A planned session nobody has started is
 * not an event, so nothing ever wrote it down, and it is exactly the thing a
 * dashboard exists to point at.
 *
 * Every rule appends a draft carrying four things the phase requires —
 *
 *   title      short, as data
 *   message    one sentence, as data
 *   severity   DASHBOARD_SEVERITY
 *   reason     why this is being said, built from the numbers
 *
 * — plus the evidence those numbers came from and the engine that owns them.
 * The dashboard engine drops any draft missing one of the four, and counts
 * the drop. A notification that cannot say why it appeared is noise with a
 * badge on it.
 *
 * No rule in this file computes anything. `remaining` was recorded by the
 * engine before the rules ran, from the nutrition engine's target and the
 * intake logged for the day; everything else is read straight off the plan,
 * the recovery snapshot, the report or the insight set.
 */

import { defineRule } from '../rule.js';
import {
  DASHBOARD, DASHBOARD_SEVERITY, NOTIFICATION, RECOVERY_STATUS, REPORTS,
  INSIGHT_SEVERITY, PRIORITY,
} from '../../engines/constants.js';

const add = (draft, item) => ({ notifications: [...(draft.notifications ?? []), item] });

/** The types the stored notification model already knows, reused here. */
const { TYPE } = NOTIFICATION;

export const notificationRules = [
  /* ── Today, from the plan and the execution engine ──────────────────── */

  defineRule({
    id: 'notify.session-open',
    name: 'A session is still open',
    scope: 'day',
    priority: 100,
    when: (context) => context.sessionInProgress,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'session-open',
        type: TYPE.WORKOUT_MISSED,
        title: 'Session still open',
        message: 'A lifting session started today has not been closed.',
        severity: DASHBOARD_SEVERITY.WARNING,
        reason: `The execution engine holds a session for ${context.date} in state "${context.activeSession?.state}". Progressive overload reads completed sets only, so an unclosed session is invisible to next week's loads.`,
        evidence: {
          date: context.date,
          state: context.activeSession?.state ?? null,
          sessionId: context.activeSession?.id ?? null,
        },
        sourceEngine: 'execution-engine',
      }),
      message: 'An open session was reported, because it changes what next week reads.',
    }),
  }),

  defineRule({
    id: 'notify.workout-today',
    name: 'A lifting session is planned',
    scope: 'day',
    priority: 90,
    when: (context) => context.hasWorkout && !context.sessionInProgress,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'workout-today',
        type: TYPE.PLAN_GENERATED,
        title: context.workout.goal,
        message: `${context.workout.exercises?.length ?? 0} exercises, about ${context.workout.estimatedMinutes} minutes.`,
        severity: (context.workout.priority ?? PRIORITY.IMPORTANT) === PRIORITY.ESSENTIAL
          ? DASHBOARD_SEVERITY.WARNING
          : DASHBOARD_SEVERITY.INFO,
        reason: `The workout engine built this session for ${context.date} from the ${context.plan?.phase ?? 'current'} phase, and the planner rated it priority ${context.workout.priority ?? PRIORITY.IMPORTANT} of 3.`,
        evidence: {
          exercises: context.workout.exercises?.length ?? null,
          estimatedMinutes: context.workout.estimatedMinutes ?? null,
          priority: context.workout.priority ?? null,
          targetMuscles: context.workout.targetMuscles ?? [],
        },
        sourceEngine: 'workout-engine',
      }),
      message: "Today's planned session was surfaced.",
    }),
  }),

  defineRule({
    id: 'notify.run-today',
    name: 'A run is planned',
    scope: 'day',
    priority: 85,
    when: (context) => context.hasRun,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'run-today',
        type: TYPE.PLAN_GENERATED,
        title: String(context.run.type).replace(/-/g, ' '),
        message: `${context.run.distanceKm} km at about ${context.run.targetPace} per km.`,
        severity: DASHBOARD_SEVERITY.INFO,
        reason: `The running program engine placed a ${context.run.type} session on ${context.date} at ${context.run.distanceKm} km, paced off the easy pace it holds for the current fitness.`,
        evidence: {
          type: context.run.type,
          distanceKm: context.run.distanceKm ?? null,
          targetPace: context.run.targetPace ?? null,
          totalMinutes: context.run.totalMinutes ?? null,
        },
        sourceEngine: 'running-program-engine',
      }),
      message: "Today's planned run was surfaced.",
    }),
  }),

  defineRule({
    id: 'notify.deload',
    name: 'This is a deload week',
    scope: 'week',
    priority: 80,
    when: (context) => Boolean(context.plan?.deload),
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'deload-week',
        type: TYPE.PLAN_GENERATED,
        title: 'Deload week',
        message: 'Volume is deliberately reduced this week.',
        severity: DASHBOARD_SEVERITY.INFO,
        reason: `The planner set week ${context.plan.weekNumber} as a deload and scaled volume by ${context.plan.summary?.volumeFactor}. A session that feels easy this week is the plan working, not a bad session.`,
        evidence: {
          weekNumber: context.plan.weekNumber ?? null,
          volumeFactor: context.plan.summary?.volumeFactor ?? null,
          phase: context.plan.phase ?? null,
        },
        sourceEngine: 'planner-engine',
      }),
      message: 'The deload was surfaced so a light week is not read as a lost one.',
    }),
  }),

  /* ── Intake ─────────────────────────────────────────────────────────── */

  defineRule({
    id: 'notify.nothing-logged',
    name: 'Nothing has been logged today',
    scope: 'day',
    priority: 70,
    when: (context) => context.targetCalories !== null && !context.intakeLogged,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'intake-unlogged',
        type: TYPE.CALORIES_LOW,
        title: 'Nothing logged yet',
        message: `The full ${context.targetCalories} kcal target is still open.`,
        severity: DASHBOARD_SEVERITY.INFO,
        reason: `The nutrition engine set ${context.targetCalories} kcal and ${context.targetProteinG} g of protein for ${context.date}, and no intake record exists for the day. An unlogged day is not a fasted day, and no engine will treat it as one.`,
        evidence: {
          targetCalories: context.targetCalories,
          targetProteinG: context.targetProteinG,
          logged: false,
        },
        sourceEngine: 'nutrition-engine',
      }),
      message: 'The day has a target and no intake on record.',
    }),
  }),

  defineRule({
    id: 'notify.protein-short',
    name: 'Protein is short',
    scope: 'day',
    priority: 65,
    when: (context) => context.intakeLogged &&
      context.targetProteinG !== null &&
      context.loggedProteinG !== null &&
      context.loggedProteinG < context.targetProteinG * NOTIFICATION.LOW_INTAKE_SHARE,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'protein-short',
        type: TYPE.PROTEIN_LOW,
        title: 'Protein under target',
        message: `${context.remaining.proteinG} g still to eat.`,
        severity: DASHBOARD_SEVERITY.WARNING,
        reason: `${context.loggedProteinG} g is logged against the nutrition engine's ${context.targetProteinG} g target, below the ${Math.round(NOTIFICATION.LOW_INTAKE_SHARE * 100)}% share at which intake counts as low. Protein is the one macro a bulk cannot make up for later.`,
        evidence: {
          loggedProteinG: context.loggedProteinG,
          targetProteinG: context.targetProteinG,
          remainingG: context.remaining.proteinG,
          lowShare: NOTIFICATION.LOW_INTAKE_SHARE,
        },
        sourceEngine: 'nutrition-engine',
      }),
      message: 'Logged protein sits below the low-intake share.',
    }),
  }),

  defineRule({
    id: 'notify.calories-remaining',
    name: 'Calories are left',
    scope: 'day',
    priority: 60,
    when: (context) => context.intakeLogged && (context.remaining?.calories ?? 0) > 0,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'calories-remaining',
        type: TYPE.CALORIES_LOW,
        title: 'Calories left today',
        message: `${context.remaining.calories} kcal remain against the target.`,
        severity: DASHBOARD_SEVERITY.INFO,
        reason: `${context.loggedCalories} kcal are logged against the nutrition engine's ${context.targetCalories} kcal target for ${context.date}; the difference is what is left, not a shortfall until the day ends.`,
        evidence: {
          loggedCalories: context.loggedCalories,
          targetCalories: context.targetCalories,
          remaining: context.remaining.calories,
        },
        sourceEngine: 'nutrition-engine',
      }),
      message: 'What is left of the target was surfaced.',
    }),
  }),

  defineRule({
    id: 'notify.calories-over',
    name: 'The target has been passed',
    scope: 'day',
    priority: 60,
    when: (context) => context.intakeLogged &&
      context.targetCalories !== null &&
      (context.remaining?.calories ?? 0) < 0,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'calories-over',
        type: TYPE.CALORIES_LOW,
        title: 'Over the calorie target',
        message: `${Math.abs(context.remaining.calories)} kcal above target.`,
        severity: DASHBOARD_SEVERITY.INFO,
        reason: `${context.loggedCalories} kcal are logged against a ${context.targetCalories} kcal target. One day above target is a day, not a trend — the adjustment engine reads the scale over weeks, and will not react to this.`,
        evidence: {
          loggedCalories: context.loggedCalories,
          targetCalories: context.targetCalories,
          overBy: Math.abs(context.remaining.calories),
        },
        sourceEngine: 'nutrition-engine',
      }),
      message: 'Intake passed the target and was reported without alarm.',
    }),
  }),

  defineRule({
    id: 'notify.over-budget',
    name: 'The day is over budget',
    scope: 'day',
    priority: 55,
    when: (context) => context.meals?.withinBudget === false,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'meals-over-budget',
        type: TYPE.BUDGET_EXCEEDED,
        title: 'Over the food budget',
        message: `Today's meals cost ${context.meals.costMad} MAD.`,
        severity: DASHBOARD_SEVERITY.WARNING,
        reason: `The meal planning engine priced today's plan at ${context.meals.costMad} MAD, ${context.meals.overBudgetBy} MAD above the daily share of the budget. Food prices in the database are estimates, so this is a flag rather than a bill.`,
        evidence: {
          costMad: context.meals.costMad ?? null,
          overBudgetBy: context.meals.overBudgetBy ?? null,
          priceConfidence: 'estimate',
        },
        sourceEngine: 'meal-planning-engine',
      }),
      message: 'The meal plan came in over budget.',
    }),
  }),

  /* ── Recovery ───────────────────────────────────────────────────────── */

  defineRule({
    id: 'notify.recovery-poor',
    name: 'Recovery is poor',
    scope: 'health',
    priority: 95,
    when: (context) => context.recoveryStatus === RECOVERY_STATUS.POOR,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'recovery-poor',
        type: TYPE.RECOVERY_POOR,
        title: 'Recovery is poor',
        message: `Strain index ${context.strainIndex} of 100.`,
        severity: DASHBOARD_SEVERITY.WARNING,
        reason: `The recovery snapshot reads ${context.recoveryStatus} at a strain index of ${context.strainIndex}, which the planner's context built from lifting volume, running volume, sleep and the reported score.`,
        evidence: {
          status: context.recoveryStatus,
          strainIndex: context.strainIndex,
          components: context.recovery?.strainComponents ?? {},
          sleepHours: context.recovery?.sleepHours ?? null,
        },
        sourceEngine: 'planner-engine + recovery',
      }),
      message: 'Poor recovery was surfaced before today\'s session, not after it.',
    }),
  }),

  /* ── The week, from the reports and insights engines ────────────────── */

  defineRule({
    id: 'notify.report-warnings',
    name: 'The week raised warnings',
    scope: 'week',
    priority: 75,
    when: (context) => (context.warnings ?? []).length > 0,
    apply: (context, draft) => {
      const items = context.warnings.slice(0, DASHBOARD.MAX_WARNINGS).map((warning) => ({
        key: `warning.${warning.type}`,
        type: warning.type,
        title: warning.title ?? warning.type,
        message: warning.message ?? warning.reason ?? 'Raised by this week\'s report.',
        severity: DASHBOARD_SEVERITY.WARNING,
        reason: warning.reason ?? `The reports engine raised "${warning.type}" for the week from the figures it had measured.`,
        evidence: warning.evidence ?? { type: warning.type },
        sourceEngine: warning.sourceEngine ?? 'reports-engine',
      }));

      return {
        patch: { notifications: [...(draft.notifications ?? []), ...items] },
        message: `${items.length} warning${items.length === 1 ? '' : 's'} from this week's report ${items.length === 1 ? 'was' : 'were'} carried through as ${items.length === 1 ? 'a notification' : 'notifications'}, unchanged.`,
      };
    },
  }),

  defineRule({
    id: 'notify.critical-insight',
    name: 'A critical insight was found',
    scope: 'week',
    priority: 98,
    when: (context) => (context.insights?.all ?? [])
      .some((insight) => insight.severity === INSIGHT_SEVERITY.CRITICAL),
    apply: (context, draft) => {
      const items = (context.insights.all ?? [])
        .filter((insight) => insight.severity === INSIGHT_SEVERITY.CRITICAL)
        .slice(0, DASHBOARD.MAX_CRITICAL_INSIGHTS)
        .map((insight) => ({
          key: `insight.${insight.key}`,
          type: TYPE.WEEK_COMPLETED,
          title: insight.title,
          message: insight.summary,
          severity: DASHBOARD_SEVERITY.CRITICAL,
          reason: insight.reason,
          evidence: insight.evidence,
          sourceEngine: insight.sourceEngine,
        }));

      return {
        patch: { notifications: [...(draft.notifications ?? []), ...items] },
        message: `${items.length} critical insight${items.length === 1 ? '' : 's'} ${items.length === 1 ? 'was' : 'were'} raised to the top of the notification list at the severity the insights engine assigned.`,
      };
    },
  }),

  defineRule({
    id: 'notify.streak',
    name: 'A streak is running',
    scope: 'week',
    priority: 40,
    when: (context) => (context.figure('streak.weeks') ?? 0) >= REPORTS.STREAK_MIN_WEEKS,
    apply: (context, draft) => {
      const weeks = context.figure('streak.weeks');
      return {
        patch: add(draft, {
          key: 'streak',
          type: TYPE.WEEK_COMPLETED,
          title: `${weeks} weeks running`,
          message: `Adherence has held for ${weeks} consecutive weeks.`,
          severity: DASHBOARD_SEVERITY.SUCCESS,
          reason: `The reports engine counted ${weeks} consecutive weeks, this one included, whose overall adherence reached ${REPORTS.ADHERENCE_LOW}%. The count stops at the first week that did not, so it is a run rather than an average.`,
          evidence: { weeks, floor: REPORTS.ADHERENCE_LOW },
          sourceEngine: 'reports-engine',
        }),
        message: 'The adherence streak was surfaced, because consistency is the thing that predicts the rest.',
      };
    },
  }),

  /* ── Nothing at all ─────────────────────────────────────────────────── */

  defineRule({
    id: 'notify.no-plan',
    name: 'No week has been generated',
    scope: 'week',
    priority: 99,
    when: (context) => !context.hasPlan,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'no-plan',
        type: TYPE.PLAN_GENERATED,
        title: 'No plan yet',
        message: 'Nothing has been planned for this week.',
        severity: DASHBOARD_SEVERITY.INFO,
        reason: `No WeeklyPlan reached the dashboard for ${context.date}, so every figure below it is missing rather than zero. Generating a week is what gives the other engines something to read.`,
        evidence: { date: context.date, missing: context.missing.map((gap) => gap.input) },
        sourceEngine: 'planner-engine',
      }),
      message: 'The absence of a plan was reported as an absence, not drawn as an empty day.',
    }),
  }),
];
