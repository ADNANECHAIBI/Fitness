/**
 * life-rules.js — recovery, consistency, the goal, encouragement, and safety.
 *
 * The five categories that are not about a session. They belong together
 * because they share one property the training and nutrition rules do not:
 * each of them is about whether the plan is *reachable*, rather than whether
 * it is correct. A perfect programme nobody sleeps enough to recover from, or
 * shows up for, or believes in, is not a better programme than a modest one
 * that happens.
 *
 * The health rules are the most constrained in the app. They never name a
 * condition, never suggest a cause, and never interpret a symptom. Where the
 * data is genuinely concerning the advice is to talk to someone qualified —
 * which is not medical advice, it is the opposite of offering any.
 */

import { defineRule } from '../rule.js';
import {
  COACH, COACH_CATEGORY, COACH_SEVERITY, COACH_HORIZON,
  REPORTS, WARNING, ACHIEVEMENT, SLEEP,
} from '../../engines/constants.js';

const add = (draft, item) => ({ advice: [...(draft.advice ?? []), item] });

/* ── Recovery ───────────────────────────────────────────────────────────── */

export const recoveryRules = [
  defineRule({
    id: 'coach.recovery.sleep-more',
    name: 'Sleep more',
    scope: 'coach',
    priority: 92,
    when: (context) => context.sleepHours !== null &&
      context.sleepHours < context.sleepTargetHours - SLEEP.DEBT_HOURS,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'recovery.sleep-more',
        category: COACH_CATEGORY.RECOVERY,
        priority: COACH.PRIORITY.HIGH,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.DAILY,
        title: 'Sleep is the limiting factor',
        summary: `${context.sleepHours} hours against a target of ${context.sleepTargetHours}.`,
        recommendation: 'Move bedtime thirty minutes earlier rather than trying for the full target at once. A half-hour that actually happens is worth more than an hour that does not.',
        reasoning: `Sleep is running ${Number((context.sleepTargetHours - context.sleepHours).toFixed(1))} hours below target, past the ${SLEEP.DEBT_HOURS}-hour gap that counts as a debt. Of everything on this page, sleep is the input that most changes what the training produces — and it is the one no amount of programme adjustment compensates for.`,
        evidence: {
          sleepHours: context.sleepHours,
          targetHours: context.sleepTargetHours,
          debtThreshold: SLEEP.DEBT_HOURS,
          strainIndex: context.strainIndex,
          recoveryStatus: context.recoveryStatus,
        },
        confidence: context.confidence(),
        sourceEngines: ['recovery', 'reports-engine'],
        actions: [{ label: 'Bedtime thirty minutes earlier', kind: 'habit', target: 'sleep' }],
      }),
      message: 'Sleep below the debt threshold outranks every programme change available.',
    }),
  }),

  defineRule({
    id: 'coach.recovery.overreaching',
    name: 'This is overreaching',
    scope: 'coach',
    priority: 98,
    when: (context) => context.warned(WARNING.OVERREACHING) ||
      (context.warned(WARNING.HIGH_FATIGUE) && context.poorRecovery),
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'recovery.overreaching',
        category: COACH_CATEGORY.RECOVERY,
        priority: COACH.PRIORITY.URGENT,
        severity: COACH_SEVERITY.CRITICAL,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'Fatigue and load are both high',
        summary: `Reported fatigue averaging ${context.fatigue ?? 'high'} with recovery reading ${context.recoveryStatus}.`,
        recommendation: 'Take three days at half volume, starting today rather than after this week\'s sessions. This is the one situation in the app where waiting to see whether it resolves is the wrong choice.',
        reasoning: `Two independent signals agree: the sessions you logged reported fatigue at ${context.fatigue ?? 'a high level'} against the ${REPORTS.FATIGUE_HIGH}-of-10 line, and the recovery snapshot reads ${context.recoveryStatus} at a strain index of ${context.strainIndex}. Agreement between what you felt and what the load model calculated is what distinguishes a hard week from a hole.`,
        evidence: {
          avgFatigue: context.fatigue,
          fatigueHighLine: REPORTS.FATIGUE_HIGH,
          recoveryStatus: context.recoveryStatus,
          strainIndex: context.strainIndex,
          warnings: context.warnings.map((warning) => warning.type),
        },
        confidence: context.confidence(),
        sourceEngines: ['execution-engine', 'planner-engine', 'reports-engine'],
        actions: [
          { label: 'Three days at half volume', kind: 'adjust', target: 'volume' },
          { label: 'Start today, not after this week', kind: 'act', target: 'now' },
        ],
      }),
      message: 'Two agreeing fatigue signals is the app\'s loudest state and the only one that says act now.',
    }),
  }),

  defineRule({
    id: 'coach.recovery.deload-now',
    name: 'Schedule a deload',
    scope: 'coach',
    priority: 86,
    when: (context) => !context.deloadWeek &&
      context.enoughForTrendAdvice &&
      (context.found('risk.load-against-recovery') || context.found('risk.deficit-and-strain')),
    apply: (context, draft) => {
      const finding = context.finding('risk.load-against-recovery') ?? context.finding('risk.deficit-and-strain');

      return {
        patch: add(draft, {
          key: 'recovery.deload-now',
          category: COACH_CATEGORY.RECOVERY,
          priority: COACH.PRIORITY.HIGH,
          severity: COACH_SEVERITY.WARNING,
          horizon: COACH_HORIZON.WEEKLY,
          title: 'A deload is overdue',
          summary: finding.summary,
          recommendation: 'Make next week a deload — roughly two-thirds of the volume at the same loads — before the plan schedules one for you at a worse moment.',
          reasoning: `${finding.reason} A deload taken deliberately costs one week; one forced by injury or illness costs several, and you do not get to choose when.`,
          evidence: { ...finding.evidence, deloadThisWeek: context.deloadWeek },
          confidence: context.confidence(),
          sourceEngines: ['analytics-engine', 'planner-engine'],
          actions: [{ label: 'Plan next week as a deload', kind: 'plan', target: 'week' }],
        }),
        message: 'A trend the analytics engine found across weeks, acted on before it becomes an event.',
      };
    },
  }),

  defineRule({
    id: 'coach.recovery.rest-today',
    name: 'Do not train today',
    scope: 'coach',
    priority: 96,
    when: (context) => context.poorRecovery && (context.hasWorkoutToday || context.hasRunToday),
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'recovery.rest-today',
        category: COACH_CATEGORY.RECOVERY,
        priority: COACH.PRIORITY.URGENT,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.DAILY,
        title: 'Today is a bad day to train hard',
        summary: `Recovery reads ${context.recoveryStatus} at a strain index of ${context.strainIndex}, and today has ${context.hasWorkoutToday ? 'a session' : 'a run'} planned.`,
        recommendation: 'Move the session to tomorrow or do half of it. Half a session on a bad day keeps the habit without adding to the debt; a full one does the opposite of what it is for.',
        reasoning: `The recovery snapshot reads ${context.recoveryStatus} before today's session has started. Training in this state adds load without producing adaptation, which is the definition of a session that costs more than it returns.`,
        evidence: {
          recoveryStatus: context.recoveryStatus,
          strainIndex: context.strainIndex,
          hasWorkout: context.hasWorkoutToday,
          hasRun: context.hasRunToday,
          sleepHours: context.sleepHours,
        },
        confidence: context.todayConfidence(),
        sourceEngines: ['recovery', 'dashboard-engine'],
        actions: [
          { label: 'Move the session to tomorrow', kind: 'plan', target: 'today' },
          { label: 'Or do half of it', kind: 'adjust', target: 'today' },
        ],
      }),
      message: 'Poor recovery before a planned session is worth saying before it, not after.',
    }),
  }),

  defineRule({
    id: 'coach.recovery.improving',
    name: 'Recovery is coming back',
    scope: 'coach',
    priority: 34,
    when: (context) => context.enoughForTrendAdvice &&
      context.improving('strainIndex') &&
      !context.poorRecovery,
    apply: (context, draft) => {
      const trend = context.trend('strainIndex');

      return {
        patch: add(draft, {
          key: 'recovery.improving',
          category: COACH_CATEGORY.RECOVERY,
          priority: COACH.PRIORITY.LOW,
          severity: COACH_SEVERITY.POSITIVE,
          horizon: COACH_HORIZON.WEEKLY,
          title: 'Recovery is trending better',
          summary: `Strain down ${Math.abs(trend.perWeek)} points per week across ${trend.weeks} weeks.`,
          recommendation: 'This is the point at which adding volume works. If any part of the plan was going to get harder, now is when.',
          reasoning: `The planner's strain index has fallen ${Math.abs(trend.perWeek)} points per week across ${trend.weeks} weeks and recovery reads ${context.recoveryStatus}. Capacity opening up is the only reliable signal that more load will be absorbed rather than accumulated.`,
          evidence: {
            strainPerWeek: trend.perWeek,
            weeks: trend.weeks,
            recoveryStatus: context.recoveryStatus,
            last: trend.last ?? null,
          },
          confidence: context.confidence(),
          sourceEngines: ['analytics-engine', 'planner-engine'],
        }),
        message: 'Improving recovery is the one green light for adding load.',
      };
    },
  }),
];

/* ── Consistency ────────────────────────────────────────────────────────── */

export const consistencyRules = [
  defineRule({
    id: 'coach.consistency.focus-on-showing-up',
    name: 'Adherence first, everything else later',
    scope: 'coach',
    priority: 94,
    when: (context) => context.adherence !== null && context.adherence < REPORTS.ADHERENCE_LOW,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'consistency.focus-on-showing-up',
        category: COACH_CATEGORY.CONSISTENCY,
        priority: COACH.PRIORITY.URGENT,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'The plan is not being followed',
        summary: `${context.adherence}% adherence this week, below the ${REPORTS.ADHERENCE_LOW}% line.`,
        recommendation: 'Cut the plan down until it fits. Two sessions a week you actually do beats four you intend to — and at this adherence, no amount of programme optimisation matters, because the programme is not what is happening.',
        reasoning: `The reports engine scored adherence at ${context.adherence}%, below the ${REPORTS.ADHERENCE_LOW}% it calls low. Nothing else on this page can be diagnosed until this changes: a stalled bulk and a bulk that was never eaten look identical in the data, and so do a bad programme and an unfollowed one.`,
        evidence: {
          adherence: context.adherence,
          lowLine: REPORTS.ADHERENCE_LOW,
          gymAdherence: context.gymAdherence,
          runningAdherence: context.runningAdherence,
          nutritionAdherence: context.nutritionAdherence,
          trainingDays: context.trainingDays,
        },
        confidence: context.confidence(),
        sourceEngines: ['reports-engine'],
        actions: [
          { label: 'Reduce to the number of sessions you will do', kind: 'plan', target: 'week' },
          { label: 'Ignore optimisation until adherence recovers', kind: 'hold', target: 'plan' },
        ],
      }),
      message: 'Below the low line, adherence is the only variable worth touching.',
    }),
  }),

  defineRule({
    id: 'coach.consistency.adherence-slipping',
    name: 'Adherence is drifting',
    scope: 'coach',
    priority: 84,
    when: (context) => context.found('risk.adherence-slipping'),
    apply: (context, draft) => {
      const finding = context.finding('risk.adherence-slipping');

      return {
        patch: add(draft, {
          key: 'consistency.adherence-slipping',
          category: COACH_CATEGORY.CONSISTENCY,
          priority: COACH.PRIORITY.HIGH,
          severity: COACH_SEVERITY.WARNING,
          horizon: COACH_HORIZON.WEEKLY,
          title: 'Adherence is sliding week by week',
          summary: finding.summary,
          recommendation: 'Ask what changed outside training before changing anything inside it. A gradual slide is almost always about time, sleep or motivation rather than about the plan being wrong.',
          reasoning: `${finding.reason} A plan that was followed and now is not has usually stopped fitting a life rather than stopped being correct.`,
          evidence: finding.evidence,
          confidence: context.confidence(),
          sourceEngines: ['analytics-engine', 'reports-engine'],
          actions: [{ label: 'Review time available, not the programme', kind: 'review', target: 'schedule' }],
        }),
        message: 'A slide the analytics engine found, attributed to fit rather than to correctness.',
      };
    },
  }),

  defineRule({
    id: 'coach.consistency.after-layoff',
    name: 'Coming back from a break',
    scope: 'coach',
    priority: 90,
    when: (context) => context.found('risk.layoff'),
    apply: (context, draft) => {
      const finding = context.finding('risk.layoff');

      return {
        patch: add(draft, {
          key: 'consistency.after-layoff',
          category: COACH_CATEGORY.CONSISTENCY,
          priority: COACH.PRIORITY.HIGH,
          severity: COACH_SEVERITY.WARNING,
          horizon: COACH_HORIZON.WEEKLY,
          title: 'There has been a break',
          summary: finding.summary,
          recommendation: 'Start at about 70% of the loads you finished on and build back over two weeks. The tendon and connective tissue take longer to return than the strength does, which is why coming back at full load is where people get hurt.',
          reasoning: `${finding.reason} Strength returns faster than the tissue that carries it, so the first week back feels easier than it is.`,
          evidence: finding.evidence,
          confidence: context.confidence(),
          sourceEngines: ['analytics-engine', 'reports-engine'],
          actions: [
            { label: 'Start at about 70% of previous loads', kind: 'adjust', target: 'volume' },
            { label: 'Build back over two weeks', kind: 'plan', target: 'progression' },
          ],
        }),
        message: 'The return is the risky part, not the break.',
      };
    },
  }),

  defineRule({
    id: 'coach.consistency.streak',
    name: 'A streak is running',
    scope: 'coach',
    priority: 36,
    when: (context) => (context.streakWeeks ?? 0) >= REPORTS.STREAK_MIN_WEEKS,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'consistency.streak',
        category: COACH_CATEGORY.CONSISTENCY,
        priority: COACH.PRIORITY.LOW,
        severity: COACH_SEVERITY.POSITIVE,
        horizon: COACH_HORIZON.WEEKLY,
        title: `${context.streakWeeks} consecutive weeks`,
        summary: `Adherence has held at or above ${REPORTS.ADHERENCE_LOW}% for ${context.streakWeeks} weeks running.`,
        recommendation: 'Protect the streak over any individual session. If a week has to be lighter, make it lighter rather than skipping it — the run of weeks is worth more than any one of them.',
        reasoning: `The reports engine counted ${context.streakWeeks} consecutive weeks meeting its adherence floor. Consistency over months predicts outcomes better than any programme variable, and it is the one thing here that a single bad week can end.`,
        evidence: {
          streakWeeks: context.streakWeeks,
          adherence: context.adherence,
          floor: REPORTS.ADHERENCE_LOW,
        },
        confidence: context.confidence(),
        sourceEngines: ['reports-engine'],
      }),
      message: 'The streak is the asset; individual sessions are not.',
    }),
  }),

  defineRule({
    id: 'coach.consistency.logging-improving',
    name: 'Logging is getting better',
    scope: 'coach',
    priority: 30,
    when: (context) => context.enoughForTrendAdvice && context.improving('consistencyPercent'),
    apply: (context, draft) => {
      const trend = context.trend('consistencyPercent');

      return {
        patch: add(draft, {
          key: 'consistency.logging-improving',
          category: COACH_CATEGORY.CONSISTENCY,
          priority: COACH.PRIORITY.LOW,
          severity: COACH_SEVERITY.POSITIVE,
          horizon: COACH_HORIZON.WEEKLY,
          title: 'More of each week is being recorded',
          summary: `Coverage up ${trend.perWeek} points per week across ${trend.weeks} weeks.`,
          recommendation: 'Keep going — and note that every figure on every other page gets more trustworthy as this rises, including the ones that will look worse for it.',
          reasoning: `The share of each week carrying data has risen ${trend.perWeek} points per week. Better logging usually makes the numbers look worse before it makes them useful, because the missing days were rarely the good ones.`,
          evidence: {
            perWeek: trend.perWeek,
            weeks: trend.weeks,
            last: trend.last ?? null,
            reportConfidence: context.reportConfidence,
          },
          confidence: context.confidence(),
          sourceEngines: ['analytics-engine', 'reports-engine'],
        }),
        message: 'Rising coverage is worth praising and worth warning about.',
      };
    },
  }),
];

/* ── Goal ───────────────────────────────────────────────────────────────── */

export const goalRules = [
  defineRule({
    id: 'coach.goal.reached',
    name: 'The goal has been reached',
    scope: 'coach',
    priority: 88,
    when: (context) => context.achieved(ACHIEVEMENT.GOAL_REACHED) ||
      (context.goalProgressPercent ?? 0) >= 100,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'goal.reached',
        category: COACH_CATEGORY.GOAL,
        priority: COACH.PRIORITY.HIGH,
        severity: COACH_SEVERITY.POSITIVE,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'The goal weight has been reached',
        summary: `${context.goalProgressPercent}% of the way from the starting weight to the goal.`,
        recommendation: 'Set the next goal before deciding anything else. Spend two to four weeks at maintenance first — an immediate switch from a surplus to a deficit, or the reverse, wastes the adaptation the last months bought.',
        reasoning: `The body engine puts progress at ${context.goalProgressPercent}% of the distance from the starting weight to the goal. A goal without a successor tends to become a slow drift back, and the transition period is what protects what was gained.`,
        evidence: {
          goalProgressPercent: context.goalProgressPercent,
          currentWeightKg: context.currentWeightKg,
          goal: context.goal,
          weightRateKgPerWeek: context.weightRateKgPerWeek,
        },
        confidence: context.confidence(),
        sourceEngines: ['body-engine', 'reports-engine'],
        actions: [
          { label: 'Two to four weeks at maintenance', kind: 'plan', target: 'goal' },
          { label: 'Then set the next goal', kind: 'settings', target: 'goal' },
        ],
      }),
      message: 'A reached goal needs a successor and a transition, in that order.',
    }),
  }),

  defineRule({
    id: 'coach.goal.dont-change-goal',
    name: 'Do not change the goal',
    scope: 'coach',
    priority: 48,
    when: (context) => (context.bulking || context.cutting) &&
      context.enoughForTrendAdvice &&
      context.improving('weightKg'),
    apply: (context, draft) => {
      const trend = context.trend('weightKg');

      return {
        patch: add(draft, {
          key: 'goal.dont-change-goal',
          category: COACH_CATEGORY.GOAL,
          priority: COACH.PRIORITY.MEDIUM,
          severity: COACH_SEVERITY.POSITIVE,
          horizon: COACH_HORIZON.WEEKLY,
          title: 'The goal is working — keep it',
          summary: `${trend.perWeek} kg per week toward a ${context.goal} across ${trend.weeks} weeks.`,
          recommendation: 'Do not switch goals now. Changing from a bulk to a cut or back mid-progress restarts the clock on everything, and the current direction is producing what it was set up to produce.',
          reasoning: `The scale has moved ${trend.perWeek} kg per week toward the goal across ${trend.weeks} weeks. Goal-switching is the most common reason a year of training produces no visible change — each switch discards the progress the last one was building.`,
          evidence: {
            perWeek: trend.perWeek,
            weeks: trend.weeks,
            goal: context.goal,
            goalProgressPercent: context.goalProgressPercent,
          },
          confidence: context.confidence(),
          sourceEngines: ['analytics-engine', 'body-engine'],
          actions: [{ label: 'Keep the current goal', kind: 'hold', target: 'goal' }],
        }),
        message: 'A working direction is worth defending against restlessness.',
      };
    },
  }),

  defineRule({
    id: 'coach.goal.wrong-direction',
    name: 'The scale is going the wrong way',
    scope: 'coach',
    priority: 91,
    when: (context) => context.found('risk.goal-reversed'),
    apply: (context, draft) => {
      const finding = context.finding('risk.goal-reversed');

      return {
        patch: add(draft, {
          key: 'goal.wrong-direction',
          category: COACH_CATEGORY.GOAL,
          priority: COACH.PRIORITY.URGENT,
          severity: COACH_SEVERITY.WARNING,
          horizon: COACH_HORIZON.WEEKLY,
          title: 'The scale is moving away from the goal',
          summary: finding.summary,
          recommendation: 'Decide which is wrong: the goal or the intake. Both are legitimate answers — if the mileage or the training matters more than the stated goal right now, change the goal rather than fighting it with food.',
          reasoning: `${finding.reason} A goal the behaviour contradicts for weeks is not a goal, and the honest fix is sometimes to restate it rather than to force compliance.`,
          evidence: finding.evidence,
          confidence: context.confidence(),
          sourceEngines: ['analytics-engine', 'body-engine'],
          actions: [
            { label: 'Adjust intake to match the goal', kind: 'adjust', target: 'calories' },
            { label: 'Or restate the goal to match the behaviour', kind: 'settings', target: 'goal' },
          ],
        }),
        message: 'Weeks against the goal means one of the two has to change, and either may.',
      };
    },
  }),

  defineRule({
    id: 'coach.goal.no-goal-set',
    name: 'No goal is set',
    scope: 'coach',
    priority: 68,
    when: (context) => context.available.profile && !context.statedGoal,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'goal.no-goal-set',
        category: COACH_CATEGORY.GOAL,
        priority: COACH.PRIORITY.MEDIUM,
        severity: COACH_SEVERITY.INFO,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'No goal has been chosen',
        summary: 'The profile carries no goal, so the calorie target has nothing to aim at.',
        recommendation: 'Pick a direction, even a temporary one. Maintenance is a real choice and a better one than none — without a goal the nutrition engine has no rate to build a target around, and none of the weight advice here can apply.',
        reasoning: 'The profile holds no goal. Every calorie figure in the app is derived from an intended rate of change, and an unstated intention defaults to nothing rather than to something sensible.',
        evidence: {
          statedGoal: context.statedGoal,
          currentWeightKg: context.currentWeightKg,
          hasProfile: context.available.profile,
        },
        confidence: context.todayConfidence(),
        sourceEngines: ['nutrition-engine'],
        actions: [{ label: 'Choose a goal, including maintenance', kind: 'settings', target: 'goal' }],
      }),
      message: 'An unstated goal is not a neutral one; it is an absent input.',
    }),
  }),
];

/* ── Motivation ─────────────────────────────────────────────────────────── */

export const motivationRules = [
  defineRule({
    id: 'coach.motivation.great-week',
    name: 'An excellent week',
    scope: 'coach',
    priority: 44,
    when: (context) => (context.adherence ?? 0) >= REPORTS.ADHERENCE_PERFECT &&
      !context.poorRecovery,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'motivation.great-week',
        category: COACH_CATEGORY.MOTIVATION,
        priority: COACH.PRIORITY.MEDIUM,
        severity: COACH_SEVERITY.POSITIVE,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'That was an excellent week',
        summary: `${context.adherence}% adherence with recovery reading ${context.recoveryStatus}.`,
        recommendation: 'Do not reward it by making next week harder. The correct response to a week like this is an identical one.',
        reasoning: `Adherence hit ${context.adherence}%, at or above the ${REPORTS.ADHERENCE_PERFECT}% the reports engine calls perfect, and recovery held at ${context.recoveryStatus}. Weeks like this are the ones that compound, and the usual way they stop is being treated as a reason to escalate.`,
        evidence: {
          adherence: context.adherence,
          perfectLine: REPORTS.ADHERENCE_PERFECT,
          recoveryStatus: context.recoveryStatus,
          sessionsCompleted: context.sessionsThisWeek,
          achievements: (context.achievements ?? []).length,
        },
        confidence: context.confidence(),
        sourceEngines: ['reports-engine'],
      }),
      message: 'The right response to a perfect week is repetition, not escalation.',
    }),
  }),

  defineRule({
    id: 'coach.motivation.something-went-right',
    name: 'Something went right',
    scope: 'coach',
    priority: 28,
    when: (context) => (context.adherence ?? 100) < REPORTS.ADHERENCE_LOW &&
      ((context.achievements ?? []).length > 0 ||
        (context.sessionsThisWeek ?? 0) > 0 ||
        (context.runsThisWeek ?? 0) > 0),
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'motivation.something-went-right',
        category: COACH_CATEGORY.MOTIVATION,
        priority: COACH.PRIORITY.LOW,
        severity: COACH_SEVERITY.POSITIVE,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'The week was not nothing',
        summary: `${context.sessionsThisWeek ?? 0} session${context.sessionsThisWeek === 1 ? '' : 's'} and ${context.runsThisWeek ?? 0} run${context.runsThisWeek === 1 ? '' : 's'} on a week scored at ${context.adherence}%.`,
        recommendation: 'Aim to repeat exactly what did happen next week rather than to hit the original plan. A bad week with two sessions in it is a two-session week, and building from two is easier than restarting from zero.',
        reasoning: `Adherence came in at ${context.adherence}%, below the line — but ${context.sessionsThisWeek ?? 0} sessions and ${context.runsThisWeek ?? 0} runs were still logged. A week measured against a plan it did not follow looks like a failure; measured against nothing, it is not one.`,
        evidence: {
          adherence: context.adherence,
          sessionsCompleted: context.sessionsThisWeek,
          runs: context.runsThisWeek,
          achievements: (context.achievements ?? []).length,
        },
        confidence: context.confidence(),
        sourceEngines: ['reports-engine'],
      }),
      message: 'A bad week with something in it is a smaller week, not a failed one.',
    }),
  }),

  defineRule({
    id: 'coach.motivation.first-weeks',
    name: 'This is early',
    scope: 'coach',
    priority: 26,
    when: (context) => context.hasPlan && context.weeksWithData > 0 &&
      context.weeksWithData < COACH.MIN_WEEKS_FOR_TREND_ADVICE,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'motivation.first-weeks',
        category: COACH_CATEGORY.MOTIVATION,
        priority: COACH.PRIORITY.LOW,
        severity: COACH_SEVERITY.INFO,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'It is early to judge anything',
        summary: `${context.weeksWithData} week${context.weeksWithData === 1 ? '' : 's'} of data so far.`,
        recommendation: 'Log consistently for three weeks before changing anything. The first weeks are for building the record that every later decision reads — the numbers themselves will not mean much yet, and that is normal.',
        reasoning: `${context.weeksWithData} weeks carry data, below the ${COACH.MIN_WEEKS_FOR_TREND_ADVICE} this app needs before it fits a trend. Advice about direction cannot exist yet, and pretending otherwise would be the least useful thing the coach could do.`,
        evidence: {
          weeksWithData: context.weeksWithData,
          minWeeks: COACH.MIN_WEEKS_FOR_TREND_ADVICE,
          adherence: context.adherence,
        },
        confidence: context.confidence(REPORTS.CONFIDENCE_LEVEL.MEDIUM),
        sourceEngines: ['analytics-engine'],
        actions: [{ label: 'Log consistently for three weeks', kind: 'log', target: 'everything' }],
      }),
      message: 'Saying it is too early is more useful than a trend fitted through two points.',
    }),
  }),
];

/* ── Health ─────────────────────────────────────────────────────────────────
   The narrowest rules in the app. None of them names a condition, suggests a
   cause, or interprets a symptom. The strongest thing any of them says is
   "this pattern is worth showing to someone qualified", which is a refusal to
   give medical advice rather than an instance of it.                       */

export const healthRules = [
  defineRule({
    id: 'coach.health.persistent-fatigue',
    name: 'Fatigue that is not resolving',
    scope: 'coach',
    priority: 97,
    when: (context) => context.poorRecovery &&
      context.enoughForTrendAdvice &&
      context.declining('sleepHours') &&
      (context.fatigue ?? 0) >= REPORTS.FATIGUE_HIGH,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'health.persistent-fatigue',
        category: COACH_CATEGORY.HEALTH,
        priority: COACH.PRIORITY.URGENT,
        severity: COACH_SEVERITY.CRITICAL,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'Fatigue is not resolving with rest',
        summary: `Recovery ${context.recoveryStatus}, reported fatigue ${context.fatigue} of 10, sleep trending down across ${context.weeksAnalysed} weeks.`,
        recommendation: 'Reduce training and consider talking to a doctor. This app measures training load and sleep hours; it cannot tell whether persistent fatigue is a training problem, and that distinction needs someone who can examine you.',
        reasoning: `Three figures point the same way over ${context.weeksAnalysed} weeks: recovery reads ${context.recoveryStatus}, reported session fatigue averages ${context.fatigue} against the ${REPORTS.FATIGUE_HIGH}-of-10 line, and sleep is falling. That combination has many possible causes and this app can identify none of them — which is exactly why it is being flagged rather than explained.`,
        evidence: {
          recoveryStatus: context.recoveryStatus,
          avgFatigue: context.fatigue,
          fatigueHighLine: REPORTS.FATIGUE_HIGH,
          sleepTrendPerWeek: context.trend('sleepHours')?.perWeek ?? null,
          weeksAnalysed: context.weeksAnalysed,
        },
        confidence: context.confidence(),
        sourceEngines: ['analytics-engine', 'planner-engine', 'execution-engine'],
        actions: [
          { label: 'Reduce training load', kind: 'adjust', target: 'volume' },
          { label: 'Consider seeing a doctor', kind: 'external', target: 'medical' },
        ],
      }),
      message: 'Named, not explained — the app can see the pattern and cannot diagnose it.',
    }),
  }),

  defineRule({
    id: 'coach.health.injury-restrictions',
    name: 'There are movement restrictions on file',
    scope: 'coach',
    priority: 72,
    when: (context) => (context.restrictedMovements ?? []).length > 0,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'health.injury-restrictions',
        category: COACH_CATEGORY.HEALTH,
        priority: COACH.PRIORITY.MEDIUM,
        severity: COACH_SEVERITY.INFO,
        horizon: COACH_HORIZON.WEEKLY,
        title: `${context.restrictedMovements.length} movement restriction${context.restrictedMovements.length === 1 ? '' : 's'} on file`,
        summary: `The workout engine is excluding: ${context.restrictedMovements.join(', ')}.`,
        recommendation: 'Keep these current. If a restriction has cleared, remove it — the engine excludes whole movement patterns, so a stale entry quietly narrows every session it builds. If one has changed, whoever is treating it should be the one who says so.',
        reasoning: `Settings list ${context.restrictedMovements.length} restricted movement patterns and the workout engine excludes every exercise matching them. That exclusion is deliberately blunt, which is right for a real restriction and costly for an expired one.`,
        evidence: {
          restrictedMovements: context.restrictedMovements,
          excludedExercises: (context.settings?.excludedExercises ?? []).length,
          sessionsThisWeek: context.sessionsThisWeek,
        },
        confidence: context.todayConfidence(),
        sourceEngines: ['workout-engine'],
        actions: [{ label: 'Review restrictions in settings', kind: 'settings', target: 'restrictions' }],
      }),
      message: 'An expired restriction narrows every session and nothing else will notice.',
    }),
  }),

  defineRule({
    id: 'coach.health.not-enough-data',
    name: 'Not enough data to advise',
    scope: 'coach',
    priority: 99,
    when: (context) => context.missing.length >= 4 || (!context.available.report && !context.available.dashboard),
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'health.not-enough-data',
        category: COACH_CATEGORY.HEALTH,
        priority: COACH.PRIORITY.URGENT,
        severity: COACH_SEVERITY.INFO,
        horizon: COACH_HORIZON.DAILY,
        title: 'There is not enough here to advise on',
        summary: `${context.missing.length} of the inputs the coach reads are absent: ${context.missing.map((gap) => gap.input).join(', ')}.`,
        recommendation: 'Nothing below this should be acted on yet. Generate a week and log a few days first — advice built on this little would be a guess presented with a confidence level attached, which is worse than saying nothing.',
        reasoning: `The coach reads eight engines and heard from ${8 - context.missing.length}. Every rule in it compares figures against thresholds, and a missing figure does not fail a comparison — it silently passes or silently fails, which is how confident nonsense gets produced.`,
        evidence: {
          missingInputs: context.missing.map((gap) => gap.input),
          missingEngines: context.missing.map((gap) => gap.engine),
          available: Object.entries(context.available).filter(([, yes]) => yes).map(([name]) => name),
        },
        confidence: REPORTS.CONFIDENCE_LEVEL.LOW,
        sourceEngines: ['coach-engine'],
        actions: [{ label: 'Generate a week and log a few days', kind: 'plan', target: 'week' }],
      }),
      message: 'The coach saying it cannot advise is the most useful thing it can do in this state.',
    }),
  }),

  defineRule({
    id: 'coach.health.high-risk-level',
    name: 'The dashboard is flagging risk',
    scope: 'coach',
    priority: 93,
    when: (context) => context.riskLevel === 'high',
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'health.high-risk-level',
        category: COACH_CATEGORY.HEALTH,
        priority: COACH.PRIORITY.URGENT,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.DAILY,
        title: 'Today\'s risk level is high',
        summary: context.dashboard?.health?.riskReason ?? 'Several signals agreed.',
        recommendation: 'Treat today as a recovery day regardless of what is scheduled. The risk level is high only when more than one independent signal agrees, which is rare enough to be worth respecting.',
        reasoning: `${context.dashboard?.health?.riskReason ?? 'The dashboard raised the level from agreeing signals.'} The dashboard's risk rules escalate to high only on agreement between independent measures — a single bad reading produces "moderate" instead.`,
        evidence: {
          riskLevel: context.riskLevel,
          recoveryStatus: context.recoveryStatus,
          strainIndex: context.strainIndex,
          criticalInsights: context.criticalInsights.length,
        },
        confidence: context.todayConfidence(),
        sourceEngines: ['dashboard-engine'],
        actions: [{ label: 'Make today a recovery day', kind: 'plan', target: 'today' }],
      }),
      message: 'The dashboard already escalated this; the coach is not re-deciding it.',
    }),
  }),
];
