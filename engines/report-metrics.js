/**
 * report-metrics.js — the summaries a report is made of.
 *
 * One function per domain. Each takes the cleaned context and the report's
 * explainer, and returns plain numbers. Every number it returns was recorded
 * on the way past, so the report can answer "why 82%?" without keeping a
 * second copy of the arithmetic in a sentence somewhere.
 *
 * **Nothing here derives a domain quantity.** Tonnage comes from the strength
 * engine, pace from the running engine, load from the running progress
 * engine, the weight trend from the body engine, session completion from what
 * the execution engine already judged and stored. What is left — averages,
 * counts, ratios of two of those numbers — is the calculation engine's, and
 * it is called, not rewritten.
 *
 * Pure. Given the same context it returns the same numbers, forever.
 */

import { round, mean, sum, percentOf, divide, toNumber } from './calculation-engine.js';
import { StrengthEngine } from './strength-engine.js';
import { RunningEngine } from './running-engine.js';
import { RunningProgressEngine } from './running-progress-engine.js';
import { BodyEngine } from './body-engine.js';
import { SOURCE } from './report-explain.js';
import {
  UNITS, PRECISION, REPORTS, SESSION_STATE, RECOVERY_STATUS, RUNNING_LOAD,
} from './constants.js';

/* ── Weight ─────────────────────────────────────────────────────────────── */

/**
 * What the scale did.
 * The rate comes from the body engine's trend fit, not from subtracting the
 * first reading from the last: two readings a day apart can differ by a kilo
 * of water and say nothing about the week.
 */
export function weightSummary(context, explain) {
  const readings = context.weights;
  const values = readings.map((row) => row.kg);

  if (!readings.length) {
    explain.note('weight.unavailable',
      'No weigh-in was logged inside the week, so every weight figure is null rather than assumed.',
      { source: SOURCE.REPORTS });

    return {
      readings: 0,
      averageKg: null, firstKg: null, lastKg: null,
      changeKg: null, weeklyChangeKg: null, trend: null,
      currentKg: context.profile.weightKg,
      goalKg: context.profile.goalWeightKg,
      progressPercent: null,
    };
  }

  const averageKg = explain.figure('weight.averageKg', round(mean(values), PRECISION.KG), {
    unit: 'kg', source: SOURCE.CALCULATION,
    method: `the mean of the ${readings.length} weigh-in${readings.length === 1 ? '' : 's'} logged inside the week`,
    inputs: { readings: values },
  });

  const firstKg = readings[0].kg;
  const lastKg = readings.at(-1).kg;

  const changeKg = explain.figure('weight.changeKg', round(lastKg - firstKg, PRECISION.KG), {
    unit: 'kg', source: SOURCE.CALCULATION,
    method: 'the last weigh-in of the week minus the first',
    inputs: { firstKg, lastKg, firstDate: readings[0].date, lastDate: readings.at(-1).date },
    note: 'Two readings, so it carries whatever water and gut content differed between them. The trend rate below is the more honest number.',
  });

  /* The fit reads the readings before the week too — a rate per week needs
     more than a week of points to mean anything. */
  const trend = BodyEngine.trend([...context.weightsBefore, ...readings]);

  const weeklyChangeKg = explain.figure('weight.weeklyChangeKg', trend?.ratePerWeek ?? null, {
    unit: 'kg/week', source: SOURCE.BODY,
    method: trend
      ? `the slope of a least-squares line through ${trend.readings} weigh-ins spanning ${trend.spanDays} days, as kg per week`
      : 'not fitted — a trend line needs at least two weigh-ins on different days',
    inputs: { readings: trend?.readings ?? readings.length, spanDays: trend?.spanDays ?? null },
  });

  const progressPercent = context.profile.goalWeightKg !== null && context.profile.startWeightKg !== null
    ? explain.figure('weight.progressPercent',
      BodyEngine.progressToGoal({
        startKg: context.profile.startWeightKg,
        currentKg: lastKg,
        goalKg: context.profile.goalWeightKg,
      }), {
        unit: '%', source: SOURCE.BODY,
        method: 'how far the latest weigh-in sits between the starting weight and the goal weight',
        inputs: {
          startKg: context.profile.startWeightKg,
          currentKg: lastKg,
          goalKg: context.profile.goalWeightKg,
        },
      })
    : null;

  return {
    readings: readings.length,
    averageKg,
    firstKg,
    lastKg,
    changeKg,
    weeklyChangeKg,
    trend,
    currentKg: context.profile.weightKg ?? lastKg,
    goalKg: context.profile.goalWeightKg,
    progressPercent,
  };
}

/* ── Gym ────────────────────────────────────────────────────────────────── */

/**
 * What was lifted.
 *
 * Two records describe the same training from different angles: a
 * `WorkoutSession` says whether a session happened and how it went, a Gym row
 * says how much was moved. Tonnage is read from the Gym rows only — the
 * execution engine writes those from the session when it closes, so adding
 * both would count every set twice.
 */
export function gymSummary(context, explain) {
  const sessions = context.sessions;
  const completed = sessions.filter((session) => session.state === SESSION_STATE.COMPLETED);
  const abandoned = sessions.filter((session) =>
    session.state === SESSION_STATE.CANCELLED || session.state === SESSION_STATE.SKIPPED);

  const plannedSessions = plannedGymDays(context);

  const volumeKg = explain.figure('gym.volumeKg', StrengthEngine.totalVolume(context.sets), {
    unit: 'kg', source: SOURCE.STRENGTH,
    method: `tonnage — sets × reps × load — summed over the ${context.sets.length} logged entries, by the strength engine's volume formula`,
    inputs: { entries: context.sets.length },
    note: 'Blind to how hard the work was: easy tonnage and tonnage to failure score the same.',
  });

  const missed = explain.figure('gym.missedSessions',
    plannedSessions === null ? null : Math.max(0, plannedSessions - completed.length), {
      source: SOURCE.REPORTS,
      method: plannedSessions === null
        ? 'not counted — nothing was planned for the week, so a missed session has no meaning'
        : 'planned gym days minus the sessions that reached the completed state',
      inputs: { plannedSessions, completed: completed.length },
    });

  const adherencePercent = explain.figure('gym.adherencePercent',
    plannedSessions ? percentOf(completed.length, plannedSessions) : null, {
      unit: '%', source: SOURCE.EXECUTION,
      method: plannedSessions
        ? `${completed.length} completed of ${plannedSessions} planned sessions, as a percentage`
        : 'not measured — no planned gym days to measure against',
      inputs: { completed: completed.length, planned: plannedSessions },
      note: 'A session counts once it reached the completed state, which the execution engine decides from its own completion rules — not from anything recomputed here.',
    });

  const completionPercent = explain.figure('gym.setCompletionPercent',
    sessions.length ? round(mean(sessions.map((s) => toNumber(s.completionPercent) ?? 0)), 0) : null, {
      unit: '%', source: SOURCE.EXECUTION,
      method: 'the mean of the completion percentage each session already stored',
      inputs: { sessions: sessions.length },
    });

  const muscleDistribution = explain.figure('gym.muscleDistribution',
    StrengthEngine.volumeByMuscle(context.sets), {
      unit: 'kg', source: SOURCE.STRENGTH,
      method: 'the same tonnage, grouped by the muscle on each logged entry',
      inputs: { entries: context.sets.length },
    });

  return {
    plannedSessions,
    sessions: sessions.length,
    completedSessions: completed.length,
    missedSessions: missed,
    abandonedSessions: abandoned.length,
    sets: context.sets.length,
    volumeKg,
    adherencePercent,
    completionPercent,
    muscleDistribution,
    estimated1RM: oneRepMaxChanges(context, explain),
    records: sessions.flatMap((session) => session.records ?? []),
    fatigueScores: sessions.map((s) => toNumber(s.fatigue)).filter((n) => n !== null),
  };
}

/** How many gym days the week planned, from whichever plan object is present. */
function plannedGymDays(context) {
  const { plan, workoutWeek } = context.planned;
  return toNumber(plan?.summary?.gymDays)
    ?? toNumber(plan?.gymDays)
    ?? (Array.isArray(workoutWeek?.days) ? workoutWeek.days.length : null);
}

/**
 * Estimated one-rep max movement, per exercise.
 *
 * Where the execution engine already detected an e1RM record it is read as
 * it stands — value and previous both. Where it did not, the best set of the
 * week is passed through the strength engine's formula so the report still
 * has a number, marked as having no comparison.
 */
function oneRepMaxChanges(context, explain) {
  const fromRecords = context.sessions
    .flatMap((session) => session.records ?? [])
    .filter((record) => record?.type === 'estimated_1rm' && toNumber(record.value) !== null)
    .map((record) => ({
      exerciseId: record.exerciseId,
      valueKg: toNumber(record.value),
      previousKg: toNumber(record.previous),
      changeKg: toNumber(record.previous) === null
        ? null
        : round(toNumber(record.value) - toNumber(record.previous), PRECISION.KG),
      source: 'execution-engine record',
    }));

  const covered = new Set(fromRecords.map((row) => row.exerciseId));
  const byExercise = new Map();

  for (const entry of context.sets) {
    if (!entry.exercise || covered.has(entry.exercise)) continue;

    const estimate = StrengthEngine.oneRepMax({
      weightKg: toNumber(entry.weightKg),
      reps: toNumber(entry.reps),
    });
    if (estimate.value === null || !estimate.reliable) continue;

    const best = byExercise.get(entry.exercise);
    if (!best || estimate.value > best.valueKg) {
      byExercise.set(entry.exercise, {
        exerciseId: entry.exercise,
        valueKg: estimate.value,
        previousKg: null,
        changeKg: null,
        source: `strength-engine ${estimate.formula.id}`,
      });
    }
  }

  const all = [...fromRecords, ...byExercise.values()];

  explain.figure('gym.estimated1RM', all.length, {
    source: SOURCE.STRENGTH,
    method: 'one entry per exercise: the record the execution engine detected where there is one, otherwise the best reliable set of the week through the one-rep-max formula',
    inputs: { fromRecords: fromRecords.length, estimatedHere: byExercise.size },
    note: 'An estimate from a formula, never a lift that was performed. Sets above the formula\'s reliable rep range are left out entirely.',
  });

  return all;
}

/* ── Running ────────────────────────────────────────────────────────────── */

/** What was run, and how the load sits against the last four weeks. */
export function runningSummary(context, explain) {
  const runs = context.runs;
  const totals = RunningEngine.totals(runs);

  const distanceKm = explain.figure('running.distanceKm', totals.distanceKm, {
    unit: 'km', source: SOURCE.RUNNING,
    method: `the running engine's totals over the ${runs.length} run${runs.length === 1 ? '' : 's'} logged in the week`,
    inputs: { runs: runs.length },
  });

  const durationMin = explain.figure('running.durationMin', totals.durationMin, {
    unit: 'min', source: SOURCE.RUNNING, method: 'the same totals, as time',
    inputs: { runs: runs.length },
  });

  const avgPaceSecPerKm = explain.figure('running.avgPaceSecPerKm', totals.avgPaceSecPerKm, {
    unit: 'sec/km', source: SOURCE.RUNNING,
    method: 'total time divided by total distance — the pace of the week as one run, not the mean of each run\'s pace',
    inputs: { distanceKm: totals.distanceKm, durationMin: totals.durationMin },
    note: 'Weighted by distance by construction, so a long easy run moves it more than a short fast one.',
  });

  const paces = runs.map((run) => RunningEngine.paceSecPerKm(run)).filter((p) => p !== null);
  const bestPaceSecPerKm = explain.figure('running.bestPaceSecPerKm',
    paces.length ? Math.min(...paces) : null, {
      unit: 'sec/km', source: SOURCE.RUNNING,
      method: 'the fastest single run of the week, by the running engine\'s pace formula',
      inputs: { runsWithPace: paces.length },
    });

  const longestRunKm = explain.figure('running.longestRunKm',
    runs.length ? round(Math.max(...runs.map((run) => toNumber(run.distanceKm) ?? 0)), PRECISION.KM) : null, {
      unit: 'km', source: SOURCE.CALCULATION,
      method: 'the largest distance among the week\'s runs',
      inputs: { runs: runs.length },
    });

  /* Load is a twenty-eight-day quantity. It is read from the progress engine
     over the history up to the end of the week, never from the week alone. */
  const progress = RunningProgressEngine.summary(context.runsToDate, { asOf: context.weekEnd ?? undefined });

  /* The ratio needs a chronic window to divide by. Four days of history
     against a twenty-eight day average is not a spike, it is a first week —
     so the ratio is reported and its reliability is reported beside it. */
  const historyDays = context.runsToDate.length && context.weekEnd
    ? Math.round(
      (new Date(`${context.weekEnd}T00:00:00Z`).getTime()
        - new Date(`${context.runsToDate[0].date}T00:00:00Z`).getTime()) / 86400000)
    : 0;

  const loadReliable = explain.figure('running.trainingLoadReliable',
    historyDays >= RUNNING_LOAD.CHRONIC_DAYS, {
      source: SOURCE.REPORTS,
      method: `the acute:chronic ratio divides by a ${RUNNING_LOAD.CHRONIC_DAYS}-day average, so it means nothing until ${RUNNING_LOAD.CHRONIC_DAYS} days of running history exist`,
      inputs: { historyDays, requiredDays: RUNNING_LOAD.CHRONIC_DAYS, runs: context.runsToDate.length },
      note: 'Until then the ratio is still reported — it is simply not read as a spike.',
    });

  const load = explain.figure('running.trainingLoad', progress.trainingLoad, {
    source: SOURCE.RUNNING_PROGRESS,
    method: `acute load (${RUNNING_LOAD.ACUTE_DAYS} days) against chronic load (${RUNNING_LOAD.CHRONIC_DAYS} days, scaled to the same window), as the running progress engine computes it`,
    inputs: { runsConsidered: context.runsToDate.length, asOf: context.weekEnd },
    note: `Safe band is ${RUNNING_LOAD.SAFE_RATIO.join('–')}; outside it the verdict reads spiking or detraining.`,
  });

  const plannedKm = toNumber(context.planned.plan?.weeklyKm)
    ?? toNumber(context.planned.runningWeek?.totalDistanceKm)
    ?? toNumber(context.planned.runningWeek?.weeklyKm);

  const plannedRuns = toNumber(context.planned.plan?.summary?.runningDays)
    ?? (Array.isArray(context.planned.runningWeek?.days)
      ? context.planned.runningWeek.days.filter((day) => !day.rest).length
      : null);

  const adherencePercent = explain.figure('running.adherencePercent',
    plannedKm ? percentOf(Math.min(totals.distanceKm, plannedKm), plannedKm)
      : (plannedRuns ? percentOf(Math.min(runs.length, plannedRuns), plannedRuns) : null), {
      unit: '%', source: SOURCE.REPORTS,
      method: plannedKm
        ? 'distance run against distance planned, capped at 100 — running further than planned is not more adherent, it is a different week'
        : plannedRuns
          ? 'runs completed against runs planned, capped at 100'
          : 'not measured — the week planned no running',
      inputs: { distanceKm: totals.distanceKm, plannedKm, runs: runs.length, plannedRuns },
    });

  return {
    runs: runs.length,
    plannedRuns,
    plannedKm,
    distanceKm,
    durationMin,
    avgPaceSecPerKm,
    avgPace: RunningEngine.formatPace(avgPaceSecPerKm),
    bestPaceSecPerKm,
    bestPace: RunningEngine.formatPace(bestPaceSecPerKm),
    longestRunKm,
    adherencePercent,
    trainingLoad: load,
    trainingLoadReliable: loadReliable,
    runHistoryDays: historyDays,
    allTime: {
      bestPaceSecPerKm: progress.bestPaceSecPerKm,
      longestRunKm: progress.longestRunKm,
      totalRuns: progress.totalRuns,
      paceTrend: progress.paceTrend,
      consistency: progress.consistency,
    },
  };
}

/* ── Nutrition ──────────────────────────────────────────────────────────── */

/** The mean of one field across the logged days, or null when nothing carries it. */
function dailyMean(rows, field, decimals = PRECISION.PERCENT) {
  const values = rows.map((row) => toNumber(row?.[field])).filter((n) => n !== null);
  return values.length ? round(mean(values), decimals) : null;
}

/** What was eaten, against what the nutrition engine asked for. */
export function nutritionSummary(context, explain) {
  const rows = context.nutrition;
  const week = context.planned.nutritionWeek;

  const daysLogged = explain.figure('nutrition.daysLogged', rows.length, {
    unit: 'days', source: SOURCE.REPORTS,
    method: `days inside ${context.weekStart}–${context.weekEnd} carrying a nutrition record`,
    inputs: { daysInWeek: UNITS.DAYS_PER_WEEK },
    note: 'Averages below are over logged days only. An unlogged day is not a zero-calorie day, and treating it as one would understate every figure.',
  });

  const avgCalories = explain.figure('nutrition.avgCalories', dailyMean(rows, 'calories', 0), {
    unit: 'kcal', source: SOURCE.CALCULATION,
    method: 'the mean of the calories on the logged days',
    inputs: { daysLogged: rows.length },
  });

  const avgProteinG = explain.figure('nutrition.avgProteinG', dailyMean(rows, 'proteinG', 0), {
    unit: 'g', source: SOURCE.CALCULATION,
    method: 'the mean of the protein on the logged days',
    inputs: { daysLogged: rows.length },
  });

  /* Fibre and sodium are not fields the nutrition model stores. They are read
     where a row happens to carry them and reported as null otherwise, which
     is the honest answer: the app never asked for them. */
  const avgFibreG = dailyMean(rows, 'fibreG', 0);
  const avgSodiumMg = dailyMean(rows, 'sodiumMg', 0);

  if (avgFibreG === null || avgSodiumMg === null) {
    explain.note('nutrition.fibreAndSodium',
      'Null because the nutrition record has no fibre or sodium field — the targets exist in the plan, the intake is never logged against them.',
      { inputs: { avgFibreG, avgSodiumMg } });
  }

  const targetCalories = toNumber(week?.dailyCalories);
  const targetProteinG = toNumber(week?.proteinTargetG);

  const caloriePercent = explain.figure('nutrition.caloriePercent',
    targetCalories && avgCalories !== null ? percentOf(avgCalories, targetCalories) : null, {
      unit: '%', source: SOURCE.NUTRITION,
      method: targetCalories
        ? 'average intake as a share of the daily target the nutrition engine set for the week'
        : 'not measured — no nutrition plan for the week to compare against',
      inputs: { avgCalories, targetCalories },
    });

  const proteinPercent = explain.figure('nutrition.proteinPercent',
    targetProteinG && avgProteinG !== null ? percentOf(avgProteinG, targetProteinG) : null, {
      unit: '%', source: SOURCE.NUTRITION,
      method: targetProteinG
        ? 'average protein as a share of the target the nutrition engine set'
        : 'not measured — no protein target for the week',
      inputs: { avgProteinG, targetProteinG },
    });

  /* Adherence is a count of days on plan, not a ratio of averages: eating
     3600 one day and 1600 the next averages onto target and is not the week
     that was planned. */
  const onPlanDays = targetCalories
    ? rows.filter((row) => {
      const calories = toNumber(row.calories);
      return calories !== null &&
        Math.abs(calories - targetCalories) <= targetCalories * REPORTS.CALORIE_TOLERANCE;
    }).length
    : null;

  const adherencePercent = explain.figure('nutrition.adherencePercent',
    targetCalories ? percentOf(onPlanDays, UNITS.DAYS_PER_WEEK) : null, {
      unit: '%', source: SOURCE.REPORTS,
      method: targetCalories
        ? `days whose intake landed within ±${Math.round(REPORTS.CALORIE_TOLERANCE * 100)}% of target, over the seven days of the week`
        : 'not measured — no calorie target for the week',
      inputs: { onPlanDays, daysLogged: rows.length, daysInWeek: UNITS.DAYS_PER_WEEK, targetCalories },
      note: 'Measured over seven days, not over logged days: a week logged twice is not a week adhered to twice.',
    });

  return {
    daysLogged,
    avgCalories,
    avgProteinG,
    avgCarbsG: dailyMean(rows, 'carbsG', 0),
    avgFatG: dailyMean(rows, 'fatG', 0),
    avgWaterL: dailyMean(rows, 'waterL', 2),
    avgFibreG,
    avgSodiumMg,
    targetCalories: targetCalories ?? null,
    targetProteinG: targetProteinG ?? null,
    caloriePercent,
    proteinPercent,
    onPlanDays,
    adherencePercent,
  };
}

/* ── Meals ──────────────────────────────────────────────────────────────── */

/** What the meal plan cost and how close it landed. Read, not recomputed. */
export function mealSummary(context, explain) {
  const week = context.planned.mealWeek;

  if (!week) {
    explain.note('meals.unavailable', 'No meal plan was generated for the week.');
    return {
      planned: false,
      budgetMadPerWeek: null, costMad: null, withinBudget: null,
      dailyCostMad: null, varietyFoods: null, macroAccuracyPercent: null, compliancePercent: null,
    };
  }

  const costMad = explain.figure('meals.costMad', toNumber(week.weeklyCostMad), {
    unit: 'MAD', source: SOURCE.MEALS,
    method: 'the cost the meal planning engine totalled for the week',
    inputs: { budgetMadPerWeek: week.budgetMadPerWeek },
    note: 'Built on the food database\'s price estimates, which are the least reliable data in the project.',
  });

  const macroAccuracyPercent = explain.figure('meals.macroAccuracyPercent',
    toNumber(week.macroAccuracy?.overall), {
      unit: '%', source: SOURCE.MEALS,
      method: 'how close the built meals landed to the nutrition targets, as the meal engine already scored it — protein weighted double',
      inputs: week.macroAccuracy ?? {},
    });

  const varietyFoods = explain.figure('meals.varietyFoods',
    toNumber(week.variety?.distinctFoods), {
      unit: 'foods', source: SOURCE.MEALS,
      method: 'distinct foods the plan used across the week',
      inputs: { mostUsed: week.variety?.mostUsed ?? [] },
    });

  /* Compliance compares what was eaten with what the meals were built to
     provide — the plan's own day calories, not the nutrition target. */
  const plannedDays = Array.isArray(week.days) ? week.days : [];
  const byDate = new Map(plannedDays.map((day) => [day.date, day]));

  const matched = context.nutrition.filter((row) => {
    const day = byDate.get(row.date);
    const eaten = toNumber(row.calories);
    const built = toNumber(day?.calories);
    return day && eaten !== null && built !== null &&
      Math.abs(eaten - built) <= built * REPORTS.CALORIE_TOLERANCE;
  }).length;

  const compliancePercent = explain.figure('meals.compliancePercent',
    plannedDays.length ? percentOf(matched, plannedDays.length) : null, {
      unit: '%', source: SOURCE.REPORTS,
      method: plannedDays.length
        ? `days where the logged intake landed within ±${Math.round(REPORTS.CALORIE_TOLERANCE * 100)}% of what that day's meals were built to provide`
        : 'not measured — the meal plan has no days',
      inputs: { matched, plannedDays: plannedDays.length, daysLogged: context.nutrition.length },
      note: 'An unlogged day counts against compliance, because there is no evidence the meals were eaten.',
    });

  return {
    planned: true,
    budgetMadPerWeek: toNumber(week.budgetMadPerWeek),
    costMad,
    dailyCostMad: toNumber(week.dailyCostAverageMad),
    withinBudget: Boolean(week.withinBudget),
    varietyFoods,
    macroAccuracyPercent,
    compliancePercent,
  };
}

/* ── Recovery ───────────────────────────────────────────────────────────── */

/** How recovered the week was, and whether it was a deload. */
export function recoverySummary(context, explain) {
  const snapshot = context.recovery;

  const fatigueScores = context.sessions
    .map((session) => toNumber(session.fatigue))
    .filter((n) => n !== null);

  const avgFatigue = explain.figure('recovery.avgFatigue',
    fatigueScores.length ? round(mean(fatigueScores), PRECISION.PERCENT) : null, {
      unit: '1–10', source: SOURCE.EXECUTION,
      method: 'the mean of the fatigue each session was rated at, as reported at the time',
      inputs: { sessionsRated: fatigueScores.length, sessions: context.sessions.length },
      note: 'Self-reported. It measures how the sessions felt, not what they cost.',
    });

  const avgRecovery = explain.figure('recovery.avgScore',
    toNumber(snapshot?.reportedScore), {
      unit: '1–10', source: SOURCE.RECOVERY,
      method: snapshot
        ? 'the recovery score reported for the week, as the recovery snapshot holds it'
        : 'no recovery snapshot for the week',
      inputs: { status: snapshot?.status ?? null },
    });

  const strainIndex = explain.figure('recovery.strainIndex', toNumber(snapshot?.strainIndex), {
    unit: '0–100', source: SOURCE.PLANNER,
    method: 'the strain index the planner\'s context computed for the week from volume, running, sleep and the reported score',
    inputs: snapshot?.strainComponents ?? {},
  });

  const sleepHours = explain.figure('recovery.avgSleepHours',
    toNumber(snapshot?.sleepHours) ?? context.settings.sleepHours, {
      unit: 'hours', source: SOURCE.RECOVERY,
      method: 'the habitual sleep on record — a setting, not a nightly measurement',
      inputs: { fromSnapshot: toNumber(snapshot?.sleepHours), fromSettings: context.settings.sleepHours },
      note: 'The app never logs sleep per night, so this cannot vary within a week.',
    });

  return {
    status: snapshot?.status ?? RECOVERY_STATUS.UNKNOWN,
    avgRecoveryScore: avgRecovery,
    avgFatigue,
    strainIndex,
    strainComponents: snapshot?.strainComponents ?? {},
    avgSleepHours: sleepHours,
    compliancePercent: toNumber(snapshot?.compliancePercent),
  };
}

/**
 * Was this a deload week?
 *
 * Three ways to know, in order of how much they can be trusted: the plan said
 * so; tonnage fell by a fifth or more against last week's report; neither, so
 * no. The volume comparison needs the previous report, and says so when it is
 * missing.
 */
export function deloadDetection(context, gym, explain) {
  const planned = Boolean(context.planned.plan?.deload ?? context.planned.workoutWeek?.deload);
  const previous = context.previousReports.at(-1);
  const previousVolume = toNumber(previous?.gym?.volumeKg ?? previous?.gymSummary?.volumeKg);

  const dropRatio = previousVolume && previousVolume > 0 && gym.volumeKg !== null
    ? divide(previousVolume - gym.volumeKg, previousVolume)
    : null;

  const detected = planned || (dropRatio !== null && dropRatio >= REPORTS.DELOAD_VOLUME_DROP);

  explain.figure('recovery.deload', detected, {
    source: SOURCE.REPORTS,
    method: planned
      ? 'the plan for this week was generated as a deload'
      : dropRatio === null
        ? `no previous weekly report to compare tonnage against, so only the plan's own flag could be read${planned ? '' : ' — and it was not set'}`
        : `tonnage moved ${Math.round(dropRatio * 100)}% against last week, and a fall of ${Math.round(REPORTS.DELOAD_VOLUME_DROP * 100)}% or more reads as a deload`,
    inputs: { planned, volumeKg: gym.volumeKg, previousVolumeKg: previousVolume, dropRatio: dropRatio === null ? null : round(dropRatio, 2) },
  });

  return { detected, planned, volumeDropRatio: dropRatio === null ? null : round(dropRatio, 2) };
}

/* ── Adherence and load ─────────────────────────────────────────────────── */

/**
 * The three adherence figures as one.
 *
 * A component with nothing planned is not zero adherence — it is not a
 * component. It is dropped and the remaining weights are renormalised, and
 * the explanation names which ones survived, so 82% can always be taken
 * apart into the numbers it came from.
 */
export function adherenceSummary({ gym, running, nutrition }, explain) {
  const parts = [
    { key: 'gym', value: gym.adherencePercent, weight: REPORTS.ADHERENCE_WEIGHTS.gym },
    { key: 'running', value: running.adherencePercent, weight: REPORTS.ADHERENCE_WEIGHTS.running },
    { key: 'nutrition', value: nutrition.adherencePercent, weight: REPORTS.ADHERENCE_WEIGHTS.nutrition },
  ].filter((part) => part.value !== null && part.value !== undefined);

  const totalWeight = sum(parts.map((part) => part.weight));

  const overall = explain.figure('adherence.overall',
    parts.length && totalWeight > 0
      ? round(sum(parts.map((part) => part.value * part.weight)) / totalWeight, 0)
      : null, {
      unit: '%', source: SOURCE.REPORTS,
      method: parts.length
        ? `a weighted mean of ${parts.map((part) => `${part.key} ${part.value}% × ${part.weight}`).join(', ')}, divided by the weights that applied (${round(totalWeight, 2)})`
        : 'not measured — none of the three components had a plan to be measured against',
      inputs: Object.fromEntries(parts.map((part) => [part.key, part.value])),
      note: parts.length < 3
        ? `Only ${parts.length} of 3 components counted; the rest had nothing planned and were dropped rather than scored as zero.`
        : undefined,
    });

  return {
    overall,
    gym: gym.adherencePercent,
    running: running.adherencePercent,
    nutrition: nutrition.adherencePercent,
    componentsCounted: parts.map((part) => part.key),
  };
}

/** Training load, both kinds, side by side. Neither is recomputed here. */
export function trainingLoadSummary({ gym, running }, explain) {
  const total = explain.figure('load.gymVolumeKg', gym.volumeKg, {
    unit: 'kg', source: SOURCE.STRENGTH,
    method: 'the week\'s tonnage, as the gym summary already read it',
    inputs: { sets: gym.sets },
  });

  return {
    gymVolumeKg: total,
    gymSets: gym.sets,
    runningLoad: running.trainingLoad,
    runningKm: running.distanceKm,
    verdict: running.trainingLoad?.verdict ?? 'unknown',
  };
}

/**
 * How much of the week is actually on record, 0–1, and what that earns.
 * Every recommendation carries this: advice from two logged days is not
 * advice from seven, and should not be presented as though it were.
 */
export function coverage(context, explain) {
  const logged = new Set([
    ...context.nutrition.map((row) => row.date),
    ...context.sessions.map((row) => row.date),
    ...context.runs.map((row) => row.date),
  ]);

  const ratio = round(divide(logged.size, UNITS.DAYS_PER_WEEK) ?? 0, 2);

  const level = ratio >= REPORTS.CONFIDENCE.HIGH_COVERAGE
    ? REPORTS.CONFIDENCE_LEVEL.HIGH
    : ratio >= REPORTS.CONFIDENCE.MEDIUM_COVERAGE
      ? REPORTS.CONFIDENCE_LEVEL.MEDIUM
      : REPORTS.CONFIDENCE_LEVEL.LOW;

  explain.figure('coverage.ratio', ratio, {
    source: SOURCE.REPORTS,
    method: 'distinct days of the week carrying any log at all — a meal, a session or a run — over seven',
    inputs: { daysWithData: logged.size, daysInWeek: UNITS.DAYS_PER_WEEK, dropped: context.quality.dropped },
    note: `Below ${REPORTS.CONFIDENCE.MEDIUM_COVERAGE} the report still builds, but every recommendation it makes is marked low confidence.`,
  });

  return { ratio, daysWithData: logged.size, level };
}
