/**
 * body-rules.js — running, food, and the scale.
 *
 * Three categories in one file because they are one argument. A bulk that is
 * not moving the scale is a food problem, not a training problem; a cut that
 * is losing too fast is a food problem showing up as poor recovery; and added
 * cardio on a surplus is a food problem being created deliberately. Splitting
 * them across three files would hide that they read each other's evidence.
 *
 * Every threshold below is the one the engine that owns it already uses — the
 * nutrition engine's rate bands, the reports engine's protein share, the
 * running progress engine's safe load ratio. The coach picks none of its own.
 */

import { defineRule } from '../rule.js';
import {
  COACH, COACH_CATEGORY, COACH_SEVERITY, COACH_HORIZON,
  REPORTS, WARNING, RUNNING_LOAD,
} from '../../engines/constants.js';

const add = (draft, item) => ({ advice: [...(draft.advice ?? []), item] });

/* ── Running ────────────────────────────────────────────────────────────── */

export const runningRules = [
  defineRule({
    id: 'coach.running.add-easy-run',
    name: 'Make the next run easy',
    scope: 'coach',
    priority: 90,
    when: (context) => context.loadSpiking,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'running.add-easy-run',
        category: COACH_CATEGORY.RUNNING,
        priority: COACH.PRIORITY.HIGH,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'Running load has jumped',
        summary: `The acute:chronic ratio sits at ${context.recovery?.runningLoad?.ratio ?? 'above the safe band'}, outside ${RUNNING_LOAD.SAFE_RATIO.join('–')}.`,
        recommendation: 'Make the next two runs easy — conversational pace, no intervals, no long run. Keep the frequency and drop the intensity; stopping entirely undoes the base you have built.',
        reasoning: `The running progress engine compares the last ${RUNNING_LOAD.ACUTE_DAYS} days against the last ${RUNNING_LOAD.CHRONIC_DAYS} and calls this ratio spiking. That gap between recent and habitual load is the single best-documented predictor of a running injury, and it is fixed by easing intensity rather than by stopping.`,
        evidence: {
          ratio: context.recovery?.runningLoad?.ratio ?? null,
          verdict: context.loadVerdict,
          safeRatio: RUNNING_LOAD.SAFE_RATIO,
          weeklyKm: context.weeklyKm,
          runs: context.runsThisWeek,
        },
        confidence: context.confidence(),
        sourceEngines: ['running-progress-engine', 'reports-engine'],
        actions: [
          { label: 'Next two runs easy only', kind: 'adjust', target: 'running' },
          { label: 'Keep the frequency', kind: 'hold', target: 'running' },
        ],
      }),
      message: 'A spiking ratio is eased by intensity, not by stopping.',
    }),
  }),

  defineRule({
    id: 'coach.running.no-extra-cardio',
    name: 'Do not add cardio',
    scope: 'coach',
    priority: 80,
    when: (context) => context.bulking &&
      context.enoughForTrendAdvice &&
      context.improving('distanceKm') &&
      (context.weightRateKgPerWeek ?? 1) < REPORTS.WEIGHT_STALL_KG,
    apply: (context, draft) => {
      const trend = context.trend('distanceKm');

      return {
        patch: add(draft, {
          key: 'running.no-extra-cardio',
          category: COACH_CATEGORY.RUNNING,
          priority: COACH.PRIORITY.HIGH,
          severity: COACH_SEVERITY.WARNING,
          horizon: COACH_HORIZON.WEEKLY,
          title: 'Running is climbing while the scale is not',
          summary: `Distance up ${trend.perWeek} km per week; body weight moving ${context.weightRateKgPerWeek ?? 0} kg per week on a ${context.goal}.`,
          recommendation: 'Hold the running where it is this week rather than adding to it. If the mileage matters more than the weight gain, say so and the calorie target should rise to match — but do not add both a training load and a stalled scale and expect either to resolve.',
          reasoning: `Distance has risen ${trend.perWeek} km per week across ${trend.weeks} weeks while the scale moved ${context.weightRateKgPerWeek ?? 0} kg per week against a ${context.goal}. Added running is added expenditure, and a surplus that was correct before the mileage went up is not a surplus now.`,
          evidence: {
            distancePerWeek: trend.perWeek,
            weeks: trend.weeks,
            weightRateKgPerWeek: context.weightRateKgPerWeek,
            goal: context.goal,
            avgCalories: context.avgCalories,
          },
          confidence: context.confidence(),
          sourceEngines: ['analytics-engine', 'body-engine', 'nutrition-engine'],
          actions: [
            { label: 'Hold weekly distance', kind: 'hold', target: 'running' },
            { label: 'Or raise the calorie target to match', kind: 'adjust', target: 'calories' },
          ],
        }),
        message: 'Rising mileage and a stalled bulk are the same problem seen twice.',
      };
    },
  }),

  defineRule({
    id: 'coach.running.build-base',
    name: 'Build a base first',
    scope: 'coach',
    priority: 55,
    when: (context) => (context.runsThisWeek ?? 0) > 0 &&
      (context.weeklyKm ?? 0) < COACH.RUNNING_BASE_KM &&
      !context.loadSpiking,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'running.build-base',
        category: COACH_CATEGORY.RUNNING,
        priority: COACH.PRIORITY.MEDIUM,
        severity: COACH_SEVERITY.INFO,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'There is not much of a base yet',
        summary: `${context.weeklyKm} km across ${context.runsThisWeek} run${context.runsThisWeek === 1 ? '' : 's'} this week.`,
        recommendation: 'Add distance before adding intensity — one more easy kilometre per run beats one interval session. Intervals on a small base produce fatigue without the aerobic adaptation that makes them useful.',
        reasoning: `The reports engine measured ${context.weeklyKm} km this week, below the ${COACH.RUNNING_BASE_KM} km the coach treats as a base. At this volume the limiting factor is aerobic capacity rather than speed, and capacity is built by easy volume.`,
        evidence: {
          weeklyKm: context.weeklyKm,
          runs: context.runsThisWeek,
          baseKm: COACH.RUNNING_BASE_KM,
          loadVerdict: context.loadVerdict,
        },
        confidence: context.confidence(),
        sourceEngines: ['reports-engine', 'running-engine'],
        actions: [{ label: 'Add an easy kilometre per run', kind: 'adjust', target: 'running' }],
      }),
      message: 'Volume before intensity, when there is little volume.',
    }),
  }),

  defineRule({
    id: 'coach.running.pace-improving',
    name: 'Pace is coming down',
    scope: 'coach',
    priority: 35,
    when: (context) => context.enoughForTrendAdvice && context.improving('paceSecPerKm'),
    apply: (context, draft) => {
      const trend = context.trend('paceSecPerKm');

      return {
        patch: add(draft, {
          key: 'running.pace-improving',
          category: COACH_CATEGORY.RUNNING,
          priority: COACH.PRIORITY.LOW,
          severity: COACH_SEVERITY.POSITIVE,
          horizon: COACH_HORIZON.WEEKLY,
          title: 'Pace is improving',
          summary: `${Math.abs(trend.perWeek)} seconds per kilometre faster each week across ${trend.weeks} weeks.`,
          recommendation: 'Keep the easy runs easy. The improvement is coming from the aerobic base rather than from the hard sessions, and the fastest way to lose it is to start racing the easy days.',
          reasoning: `Average pace has fallen ${Math.abs(trend.perWeek)} sec/km per week across ${trend.weeks} weeks of readings the running engine produced. A steady improvement at unchanged effort is the signature of aerobic adaptation.`,
          evidence: {
            pacePerWeek: trend.perWeek,
            weeks: trend.weeks,
            first: trend.first ?? null,
            last: trend.last ?? null,
            weeklyKm: context.weeklyKm,
          },
          confidence: context.confidence(),
          sourceEngines: ['analytics-engine', 'running-engine'],
        }),
        message: 'A working base is worth naming so it is not accidentally dismantled.',
      };
    },
  }),

  defineRule({
    id: 'coach.running.reduce-frequency',
    name: 'Too many runs for the recovery available',
    scope: 'coach',
    priority: 75,
    when: (context) => (context.runsThisWeek ?? 0) >= 4 && context.poorRecovery,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'running.reduce-frequency',
        category: COACH_CATEGORY.RUNNING,
        priority: COACH.PRIORITY.HIGH,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'Four runs and no recovery',
        summary: `${context.runsThisWeek} runs this week with recovery reading ${context.recoveryStatus}.`,
        recommendation: 'Drop one run and keep the total distance by lengthening another. Frequency costs recovery; distance mostly does not.',
        reasoning: `${context.runsThisWeek} runs were logged while the recovery snapshot reads ${context.recoveryStatus} at a strain index of ${context.strainIndex}. Each session carries a fixed recovery cost regardless of its length, so consolidating the same distance into fewer runs reduces the cost without reducing the training.`,
        evidence: {
          runs: context.runsThisWeek,
          weeklyKm: context.weeklyKm,
          recoveryStatus: context.recoveryStatus,
          strainIndex: context.strainIndex,
        },
        confidence: context.confidence(),
        sourceEngines: ['reports-engine', 'planner-engine'],
        actions: [{ label: 'Consolidate into fewer, longer runs', kind: 'adjust', target: 'running' }],
      }),
      message: 'Frequency is the expensive variable when recovery is short.',
    }),
  }),

  defineRule({
    id: 'coach.running.run-today',
    name: 'Today has a run in it',
    scope: 'coach',
    priority: 40,
    when: (context) => context.hasRunToday && !context.poorRecovery,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'running.run-today',
        category: COACH_CATEGORY.RUNNING,
        priority: COACH.PRIORITY.MEDIUM,
        severity: COACH_SEVERITY.INFO,
        horizon: COACH_HORIZON.DAILY,
        title: `${String(context.dashboard.running.type).replace(/-/g, ' ')} today`,
        summary: `${context.dashboard.running.distanceKm} km at about ${context.dashboard.running.targetPace} per km.`,
        recommendation: 'Hold the target pace even if it feels too slow. The pace was set from your current easy pace, and running it faster converts an aerobic session into a hard one without recording it as such.',
        reasoning: `The running program engine placed this session today and paced it off the easy pace it holds for your current fitness. The distinction between easy and hard only exists if the easy sessions are actually easy.`,
        evidence: {
          type: context.dashboard.running.type,
          distanceKm: context.dashboard.running.distanceKm,
          targetPace: context.dashboard.running.targetPace,
          totalMinutes: context.dashboard.running.totalMinutes,
        },
        confidence: context.todayConfidence(),
        sourceEngines: ['running-program-engine', 'dashboard-engine'],
      }),
      message: 'Today\'s run, with the instruction most often ignored.',
    }),
  }),
];

/* ── Nutrition ──────────────────────────────────────────────────────────── */

export const nutritionRules = [
  defineRule({
    id: 'coach.nutrition.increase-calories',
    name: 'Eat more',
    scope: 'coach',
    priority: 95,
    when: (context) => context.bulking &&
      (context.warned(WARNING.WEIGHT_STALLED) || context.found('plateau.weight')),
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'nutrition.increase-calories',
        category: COACH_CATEGORY.NUTRITION,
        priority: COACH.PRIORITY.URGENT,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'The bulk has stopped moving',
        summary: `Weight changed ${context.weightRateKgPerWeek ?? 0} kg per week against a ${context.goal} target of ${context.targetCalories ?? 'the current'} kcal.`,
        recommendation: 'Add roughly 200 kcal a day and hold it for two weeks before judging. One week of a new intake tells you almost nothing — water and glycogen move more than tissue does over that span.',
        reasoning: `The scale has been flat for long enough that the reports engine calls it stalled, while the goal is ${context.goal}. A surplus that no longer produces weight gain is not a surplus any more: expenditure rose, or intake drifted, and either way the number has to move for the goal to.`,
        evidence: {
          weightRateKgPerWeek: context.weightRateKgPerWeek,
          targetCalories: context.targetCalories,
          avgCalories: context.avgCalories,
          goal: context.goal,
          stallThresholdKg: REPORTS.WEIGHT_STALL_KG,
        },
        confidence: context.confidence(),
        sourceEngines: ['reports-engine', 'nutrition-engine', 'body-engine'],
        actions: [
          { label: 'Add about 200 kcal per day', kind: 'adjust', target: 'calories' },
          { label: 'Hold for two weeks before judging', kind: 'hold', target: 'calories' },
        ],
      }),
      message: 'A stalled bulk is an intake problem before it is anything else.',
    }),
  }),

  defineRule({
    id: 'coach.nutrition.reduce-calories',
    name: 'Eat less',
    scope: 'coach',
    priority: 95,
    when: (context) => context.cutting &&
      (context.warned(WARNING.WEIGHT_STALLED) || context.found('plateau.weight')),
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'nutrition.reduce-calories',
        category: COACH_CATEGORY.NUTRITION,
        priority: COACH.PRIORITY.HIGH,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'The cut has stalled',
        summary: `Weight changed ${context.weightRateKgPerWeek ?? 0} kg per week on a ${context.goal}.`,
        recommendation: 'Before cutting calories further, check that the logging is complete — an unlogged day looks identical to a compliant one in every figure here. If the logging is honest, take about 150 kcal off and hold for two weeks.',
        reasoning: `The scale has been flat long enough to count as stalled while the goal is ${context.goal}. Under-logging is the more common explanation than metabolic adaptation, and it is the one worth ruling out first because cutting further on top of it makes the deficit steeper than intended.`,
        evidence: {
          weightRateKgPerWeek: context.weightRateKgPerWeek,
          daysLogged: context.daysLogged,
          avgCalories: context.avgCalories,
          targetCalories: context.targetCalories,
          goal: context.goal,
        },
        confidence: context.confidence(),
        sourceEngines: ['reports-engine', 'nutrition-engine', 'body-engine'],
        actions: [
          { label: 'Verify every day is logged', kind: 'review', target: 'nutrition' },
          { label: 'Then take off about 150 kcal', kind: 'adjust', target: 'calories' },
        ],
      }),
      message: 'A stalled cut is a logging question before it is a metabolic one.',
    }),
  }),

  defineRule({
    id: 'coach.nutrition.increase-protein',
    name: 'More protein',
    scope: 'coach',
    priority: 88,
    when: (context) => context.warned(WARNING.LOW_PROTEIN) ||
      (context.avgProteinG !== null && context.targetProteinG !== null &&
        context.avgProteinG < context.targetProteinG * REPORTS.PROTEIN_HIT_SHARE),
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'nutrition.increase-protein',
        category: COACH_CATEGORY.NUTRITION,
        priority: COACH.PRIORITY.HIGH,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'Protein is short',
        summary: `${context.avgProteinG ?? 'Below target'} g per day against a target of ${context.targetProteinG ?? 'the planned amount'} g.`,
        recommendation: 'Add one protein source to the meal you already eat most reliably rather than adding a new meal. The reliable meal is the one that will still be happening in three weeks.',
        reasoning: `Average intake sits below ${Math.round(REPORTS.PROTEIN_HIT_SHARE * 100)}% of the nutrition engine's target. Protein is the one macro whose shortfall cannot be compensated for later — a surplus with too little of it adds weight that is not the kind being trained for.`,
        evidence: {
          avgProteinG: context.avgProteinG,
          targetProteinG: context.targetProteinG,
          hitShare: REPORTS.PROTEIN_HIT_SHARE,
          daysLogged: context.daysLogged,
        },
        confidence: context.confidence(),
        sourceEngines: ['reports-engine', 'nutrition-engine'],
        actions: [{ label: 'Add protein to your most reliable meal', kind: 'adjust', target: 'protein' }],
      }),
      message: 'Protein short of the engine\'s own target, fixed at the meal most likely to persist.',
    }),
  }),

  defineRule({
    id: 'coach.nutrition.log-more',
    name: 'Log more days',
    scope: 'coach',
    priority: 82,
    when: (context) => context.daysLogged !== null && context.daysLogged < 4,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'nutrition.log-more',
        category: COACH_CATEGORY.NUTRITION,
        priority: COACH.PRIORITY.HIGH,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.WEEKLY,
        title: `${context.daysLogged} of 7 days logged`,
        summary: `Every nutrition figure this week rests on ${context.daysLogged} day${context.daysLogged === 1 ? '' : 's'}.`,
        recommendation: 'Log four days, including one weekend day. Four honest days beat seven guessed ones, and the weekend day is the one that changes the average.',
        reasoning: `The reports engine had ${context.daysLogged} days to average, so its confidence in every intake figure is ${context.reportConfidence}. Advice about calories built on this is advice about a sample, and the weekend is systematically the part of the sample that goes missing.`,
        evidence: {
          daysLogged: context.daysLogged,
          reportConfidence: context.reportConfidence,
          avgCalories: context.avgCalories,
        },
        confidence: context.confidence(REPORTS.CONFIDENCE_LEVEL.MEDIUM),
        sourceEngines: ['reports-engine'],
        actions: [{ label: 'Log four days including a weekend day', kind: 'log', target: 'nutrition' }],
      }),
      message: 'Nothing about intake can be advised on until intake is recorded.',
    }),
  }),

  defineRule({
    id: 'coach.nutrition.hold-calories',
    name: 'Leave the calories alone',
    scope: 'coach',
    priority: 45,
    when: (context) => context.weightRateKgPerWeek !== null &&
      !context.warned(WARNING.WEIGHT_STALLED) &&
      !context.warned(WARNING.CALORIES_TOO_LOW) &&
      (context.daysLogged ?? 0) >= 5 &&
      (context.bulking || context.cutting),
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'nutrition.hold-calories',
        category: COACH_CATEGORY.NUTRITION,
        priority: COACH.PRIORITY.MEDIUM,
        severity: COACH_SEVERITY.POSITIVE,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'The intake is right',
        summary: `${context.weightRateKgPerWeek} kg per week on a ${context.goal}, with ${context.daysLogged} days logged.`,
        recommendation: 'Change nothing about the food. The rate is where it should be and the logging is good enough to trust it.',
        reasoning: `The scale is moving ${context.weightRateKgPerWeek} kg per week and neither a stall nor a low-intake warning was raised, across ${context.daysLogged} logged days. An intake that is producing the intended rate does not need adjusting, and adjusting it removes the only reliable reference point you have.`,
        evidence: {
          weightRateKgPerWeek: context.weightRateKgPerWeek,
          daysLogged: context.daysLogged,
          avgCalories: context.avgCalories,
          goal: context.goal,
        },
        confidence: context.confidence(),
        sourceEngines: ['reports-engine', 'body-engine'],
        actions: [{ label: 'Keep the current calorie target', kind: 'hold', target: 'calories' }],
      }),
      message: 'A correct intake is worth confirming, or it gets changed out of restlessness.',
    }),
  }),

  defineRule({
    id: 'coach.nutrition.hydration',
    name: 'Drink more water',
    scope: 'coach',
    priority: 32,
    when: (context) => context.targetWaterL !== null &&
      (context.report?.nutrition?.avgWaterL ?? null) !== null &&
      context.report.nutrition.avgWaterL < context.targetWaterL * 0.8,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'nutrition.hydration',
        category: COACH_CATEGORY.NUTRITION,
        priority: COACH.PRIORITY.LOW,
        severity: COACH_SEVERITY.INFO,
        horizon: COACH_HORIZON.DAILY,
        title: 'Water is below target',
        summary: `${context.report.nutrition.avgWaterL} L logged against a target of ${context.targetWaterL} L.`,
        recommendation: 'Put a filled bottle where the training happens. Intake tracks availability far more than intention.',
        reasoning: `The nutrition engine set ${context.targetWaterL} L from body weight and training volume, and the week averaged ${context.report.nutrition.avgWaterL} L. Dehydration shows up first as heavier-feeling sessions, which is easy to read as fatigue and act on wrongly.`,
        evidence: {
          avgWaterL: context.report.nutrition.avgWaterL,
          targetWaterL: context.targetWaterL,
          daysLogged: context.daysLogged,
        },
        confidence: context.confidence(),
        sourceEngines: ['nutrition-engine', 'reports-engine'],
      }),
      message: 'Low water reads as fatigue, which invites the wrong correction.',
    }),
  }),

  defineRule({
    id: 'coach.nutrition.eat-today',
    name: 'What is left to eat today',
    scope: 'coach',
    priority: 42,
    when: (context) => context.intakeLogged && (context.remainingCalories ?? 0) > 300,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'nutrition.eat-today',
        category: COACH_CATEGORY.NUTRITION,
        priority: COACH.PRIORITY.MEDIUM,
        severity: COACH_SEVERITY.INFO,
        horizon: COACH_HORIZON.DAILY,
        title: `${context.remainingCalories} kcal left today`,
        summary: `${context.remainingProteinG ?? 0} g of protein still to eat.`,
        recommendation: 'Put the remaining protein in the next meal rather than the last one. Protein late in the evening is the portion most often skipped when the day runs long.',
        reasoning: `The dashboard subtracted what you logged from the nutrition engine's target for today. What is left is not a shortfall yet — the day is not over — but the protein share of it is the part that gets lost when plans change.`,
        evidence: {
          remainingCalories: context.remainingCalories,
          remainingProteinG: context.remainingProteinG,
          targetCalories: context.targetCalories,
        },
        confidence: context.todayConfidence(),
        sourceEngines: ['dashboard-engine', 'nutrition-engine'],
      }),
      message: 'Today\'s remaining intake, with the part that usually goes missing named.',
    }),
  }),
];

/* ── Weight ─────────────────────────────────────────────────────────────── */

export const weightRules = [
  defineRule({
    id: 'coach.weight.gaining-too-fast',
    name: 'Gaining faster than intended',
    scope: 'coach',
    priority: 78,
    when: (context) => context.bulking &&
      context.weightRateKgPerWeek !== null &&
      context.maxGainKgPerWeek !== null &&
      context.weightRateKgPerWeek > context.maxGainKgPerWeek,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'weight.gaining-too-fast',
        category: COACH_CATEGORY.WEIGHT,
        priority: COACH.PRIORITY.MEDIUM,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'The scale is moving fast',
        summary: `${context.weightRateKgPerWeek} kg per week.`,
        recommendation: 'Take about 150 kcal a day back off. Past a certain rate the extra weight stops being the kind you are training for, and the app cannot tell you which kind it is.',
        reasoning: `The body engine fitted ${context.weightRateKgPerWeek} kg per week, above the ${context.maxGainKgPerWeek} kg the nutrition engine's safety ceiling for a week. Faster gain is not faster progress past that point — and nothing measured here distinguishes muscle from the alternative.`,
        evidence: {
          weightRateKgPerWeek: context.weightRateKgPerWeek,
          maxGainKgPerWeek: context.maxGainKgPerWeek,
          goal: context.goal,
          avgCalories: context.avgCalories,
          targetCalories: context.targetCalories,
        },
        confidence: context.confidence(),
        sourceEngines: ['body-engine', 'nutrition-engine'],
        actions: [{ label: 'Reduce by about 150 kcal per day', kind: 'adjust', target: 'calories' }],
      }),
      message: 'Above the intended rate, and the app cannot say what the extra is.',
    }),
  }),

  defineRule({
    id: 'coach.weight.losing-too-fast',
    name: 'Losing faster than intended',
    scope: 'coach',
    priority: 85,
    when: (context) => context.cutting &&
      context.weightRateKgPerWeek !== null &&
      context.maxLossKgPerWeek !== null &&
      context.weightRateKgPerWeek < -context.maxLossKgPerWeek,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'weight.losing-too-fast',
        category: COACH_CATEGORY.WEIGHT,
        priority: COACH.PRIORITY.HIGH,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'The cut is steeper than planned',
        summary: `${context.weightRateKgPerWeek} kg per week, with recovery reading ${context.recoveryStatus}.`,
        recommendation: 'Add about 200 kcal a day back. A deficit this steep costs training quality and recovery, and both of those are what preserve muscle while losing fat.',
        reasoning: `The measured rate is ${context.weightRateKgPerWeek} kg per week, beyond the ${context.maxLossKgPerWeek} kg the nutrition engine's safety floor for a week. The faster the loss, the larger the share of it that is not fat — and the training that would protect against that is the first thing a steep deficit degrades.`,
        evidence: {
          weightRateKgPerWeek: context.weightRateKgPerWeek,
          maxLossKgPerWeek: context.maxLossKgPerWeek,
          recoveryStatus: context.recoveryStatus,
          avgCalories: context.avgCalories,
          avgProteinG: context.avgProteinG,
        },
        confidence: context.confidence(),
        sourceEngines: ['body-engine', 'nutrition-engine', 'planner-engine'],
        actions: [{ label: 'Add about 200 kcal per day', kind: 'adjust', target: 'calories' }],
      }),
      message: 'A steep cut degrades the training that makes the cut worth doing.',
    }),
  }),

  defineRule({
    id: 'coach.weight.weigh-more-often',
    name: 'Weigh in more often',
    scope: 'coach',
    priority: 65,
    when: (context) => (context.weightReadings ?? 0) > 0 &&
      context.weightReadings < COACH.MIN_WEIGHINGS_PER_WEEK * 1,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'weight.weigh-more-often',
        category: COACH_CATEGORY.WEIGHT,
        priority: COACH.PRIORITY.MEDIUM,
        severity: COACH_SEVERITY.INFO,
        horizon: COACH_HORIZON.WEEKLY,
        title: `${context.weightReadings} weigh-in this week`,
        summary: 'A rate cannot be fitted through one reading.',
        recommendation: 'Weigh in three mornings a week, at the same time, before eating. Daily weight swings by more than a week of real change, so the average is the signal and a single reading is mostly noise.',
        reasoning: `The body engine had ${context.weightReadings} reading to work with, so it cannot separate a trend from a fluctuation. Every piece of advice about calories on this page is downstream of that rate.`,
        evidence: {
          weightReadings: context.weightReadings,
          minPerWeek: COACH.MIN_WEIGHINGS_PER_WEEK,
          weightRateKgPerWeek: context.weightRateKgPerWeek,
        },
        confidence: context.confidence(REPORTS.CONFIDENCE_LEVEL.MEDIUM),
        sourceEngines: ['body-engine', 'reports-engine'],
        actions: [{ label: 'Weigh in three mornings a week', kind: 'log', target: 'weight' }],
      }),
      message: 'One reading is not a rate, and the rate is what everything else is built on.',
    }),
  }),

  defineRule({
    id: 'coach.weight.watch-the-scale',
    name: 'Watch the scale after a change',
    scope: 'coach',
    priority: 38,
    when: (context) => (context.bulking || context.cutting) &&
      context.enoughForTrendAdvice &&
      context.flat('weightKg') &&
      !context.found('plateau.weight'),
    apply: (context, draft) => {
      const trend = context.trend('weightKg');

      return {
        patch: add(draft, {
          key: 'weight.watch-the-scale',
          category: COACH_CATEGORY.WEIGHT,
          priority: COACH.PRIORITY.LOW,
          severity: COACH_SEVERITY.INFO,
          horizon: COACH_HORIZON.WEEKLY,
          title: 'The scale is flat but not yet stalled',
          summary: `${trend.perWeek} kg per week across ${trend.weeks} weeks, inside the band that reads as no movement.`,
          recommendation: 'Do not change the calories yet. Give it another week of consistent logging first — a flat fortnight inside a bulk is ordinary, and reacting to it is how people end up chasing the scale.',
          reasoning: `The fitted slope is ${trend.perWeek} kg per week, inside the ±${trend.band} band that reads as flat, but the reports engine has not yet counted enough consecutive flat weeks to call it a stall. Those two facts together mean "wait", not "act".`,
          evidence: {
            perWeek: trend.perWeek,
            weeks: trend.weeks,
            flatBand: trend.band,
            stallWeeks: REPORTS.WEIGHT_STALL_WEEKS,
          },
          confidence: context.confidence(),
          sourceEngines: ['analytics-engine', 'reports-engine'],
          actions: [{ label: 'Hold and reassess next week', kind: 'hold', target: 'calories' }],
        }),
        message: 'Flat is not stalled, and the difference is worth a week of patience.',
      };
    },
  }),
];
