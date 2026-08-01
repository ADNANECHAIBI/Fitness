/**
 * ReportService — closing a week.
 *
 * It assembles a WeeklyReport from what the other services already measured.
 * The summaries it writes are the ones the running, workout and nutrition
 * services produce; nothing is recalculated here.
 */

import { RunningService } from '../services/running-service.js';
import { WorkoutService } from '../services/workout-service.js';
import { NutritionService } from '../services/nutrition-service.js';
import { WeightService } from '../services/weight-service.js';
import { PlannerService } from '../services/planner-service.js';
import { WorkoutPlanService } from '../services/workout-plan-service.js';
import { RunningProgramService } from '../services/running-program-service.js';
import { NutritionPlanService } from '../services/nutrition-plan-service.js';
import { MealPlanService } from '../services/meal-plan-service.js';
import {
  WeeklyReportRepository, snapshotFor, SessionRepository, WorkoutRepository,
  RunningRepository, NutritionRepository, ProfileRepository, SettingsRepository,
} from '../repositories/index.js';
import { ProgressService } from './progress-service.js';
import { RecoveryService } from './recovery-service.js';
import { ReportsEngine } from '../engines/reports-engine.js';
import { register, GLOBAL_INVALIDATION } from './cache.js';
import { bus, EVENTS } from '../events/index.js';
import { startOfWeek } from '../engines/plan-context.js';
import { today } from '../models/index.js';
import { createLogger } from '../scripts/logger.js';

const log = createLogger('report');

/** How many earlier weeks a report is given for streaks, stalls and deltas. */
const LOOKBACK_WEEKS = 4;

/** The Monday n weeks before another Monday. */
function weeksBefore(weekStart, count) {
  return new Date(new Date(`${weekStart}T00:00:00Z`).getTime() - count * 7 * 86400000)
    .toISOString().slice(0, 10);
}

/** The last day of the week starting on a date. */
function weekEnd(weekStart) {
  return new Date(new Date(`${weekStart}T00:00:00Z`).getTime() + 6 * 86400000)
    .toISOString().slice(0, 10);
}

export const ReportService = Object.freeze({
  /**
   * Build the report for a week without saving it.
   * @param {string} [weekStart] ISO date
   */
  build(weekStart = startOfWeek(today())) {
    const end = weekEnd(weekStart);

    return {
      weekStart,
      weightKg: WeightService.current() ?? undefined,

      runningSummary: RunningService.summary(weekStart, end),
      gymSummary: WorkoutService.summary(weekStart, end),
      nutritionSummary: NutritionService.summary(weekStart, end),

      recovery: RecoveryService.snapshot().reportedScore ?? undefined,
      notes: '',
    };
  },

  /**
   * Build and store the report, then announce it.
   * @returns {object|null} the saved record
   */
  close(weekStart = startOfWeek(today()), { notes = '', recovery = null } = {}) {
    const report = { ...this.build(weekStart) };
    if (notes) report.notes = notes;
    if (recovery !== null) report.recovery = recovery;

    /* Shape the summaries to what the WeeklyReport model accepts. */
    const record = {
      weekStart: report.weekStart,
      weightKg: report.weightKg,
      recovery: report.recovery,
      notes: report.notes,
      runningSummary: {
        runs: report.runningSummary.runs,
        distanceKm: report.runningSummary.distanceKm,
        durationMin: report.runningSummary.durationMin,
      },
      gymSummary: {
        sessions: report.gymSummary.sessions,
        sets: report.gymSummary.sets,
        volumeKg: report.gymSummary.volumeKg,
      },
      nutritionSummary: {
        avgCalories: report.nutritionSummary.avgCalories,
        avgProteinG: report.nutritionSummary.avgProteinG,
        daysLogged: report.nutritionSummary.daysLogged,
      },
    };

    try {
      const existing = WeeklyReportRepository.find((row) => row.weekStart === weekStart)[0];
      const saved = existing
        ? WeeklyReportRepository.update(existing.id, record)
        : WeeklyReportRepository.create(record);

      bus.emit(EVENTS.WEEK_CLOSED, { weekStart, reportId: saved.id });
      return saved;
    } catch (error) {
      log.error('[report] could not save the weekly report', error);
      bus.emit(EVENTS.ERROR, { source: 'ReportService.close', error });
      return null;
    }
  },

  /** Every stored report, newest first. */
  history() { return WeeklyReportRepository.all(); },

  /** The plan that was generated for a week, beside what actually happened. */
  planVersusActual(weekStart = startOfWeek(today())) {
    const planned = snapshotFor(weekStart);
    const actual = this.build(weekStart);

    if (!planned) {
      return { planned: null, actual, note: 'No plan snapshot for that week — it was never generated, or storage was cleared.' };
    }

    return {
      planned,
      actual,
      gaps: {
        gymSessions: (actual.gymSummary.sessions ?? 0) - (planned.gymDays ?? 0),
        runningKm: Number(((actual.runningSummary.distanceKm ?? 0) - (planned.weeklyKm ?? 0)).toFixed(2)),
        avgCalories: (actual.nutritionSummary.avgCalories ?? 0) - (planned.dailyCalories ?? 0),
      },
    };
  },

  /** Everything, for a consumer that wants the whole picture at once. */
  full(weekStart = startOfWeek(today())) {
    return {
      week: this.build(weekStart),
      comparison: this.planVersusActual(weekStart),
      progress: ProgressService.snapshot(),
    };
  },

  /* ── Phase 16: the reports engine ─────────────────────────────────────── */

  /**
   * The analysed report for a week — summaries, adherence, achievements,
   * warnings, evidence-backed recommendations and an explanation per figure.
   *
   * This service gathers; the engine decides. Nothing is calculated here.
   *
   * @param {string} [weekStart]
   * @returns {object} WeeklyReport, as the reports engine builds it
   */
  analyze(weekStart = startOfWeek(today())) {
    return analysed(weekStart, LOOKBACK_WEEKS);
  },

  /**
   * The month a week belongs to, built from the analysed weeks inside it.
   * @param {string} [month] 'YYYY-MM'
   */
  month(month = today().slice(0, 7)) {
    const weeks = [];
    let cursor = startOfWeek(`${month}-01`);

    /* Mondays from the one on or before the first of the month until the
       month is behind us. A week is placed in the month its Monday falls in,
       which is the same rule the engine groups by. */
    for (let index = 0; index < 6; index += 1) {
      if (cursor.slice(0, 7) === month) weeks.push(analysed(cursor, LOOKBACK_WEEKS));
      cursor = weeksBefore(cursor, -1);
    }

    return ReportsEngine.monthly({ month, weeklyReports: weeks });
  },

  /** One figure from a week's report, taken apart. @returns {object|null} */
  explain(figureKey, weekStart = startOfWeek(today())) {
    return this.analyze(weekStart).explain(figureKey);
  },

  /** What the engine was handed for a week. For debugging, not for display. */
  inputs(weekStart = startOfWeek(today())) { return gatherInputs(weekStart, 0); },
});

/* ── Gathering ──────────────────────────────────────────────────────────────
   Reading storage is this layer's job and the engine's forbidden one, so
   everything the report needs is collected here and handed over as plain
   data. The engine windows and cleans it; nothing is filtered on the way.  */

/**
 * What was planned for a week.
 *
 * For the current week the live services are asked — they hold the plan that
 * is in force. For a week that has passed the stored snapshot is used
 * instead: regenerating an old week from today's profile would describe a
 * plan that was never followed, and then measure adherence against it.
 */
function plannedFor(weekStart) {
  if (weekStart === startOfWeek(today())) {
    return {
      plan: PlannerService.plan(weekStart),
      workoutWeek: WorkoutPlanService.week(weekStart),
      runningWeek: RunningProgramService.week(weekStart),
      nutritionWeek: NutritionPlanService.week(weekStart),
      mealWeek: MealPlanService.week(weekStart),
    };
  }

  const snapshot = snapshotFor(weekStart);
  if (!snapshot) return {};

  /* The snapshot is a summary, not a week. It carries what adherence needs
     and nothing else — no days, so no meal plan can be reconstructed from
     it, and the report will say the meals were not planned rather than
     invent them. */
  return {
    plan: {
      weekNumber: snapshot.weekNumber,
      goal: snapshot.goal,
      phase: snapshot.phase,
      deload: snapshot.deload,
      weeklyKm: snapshot.weeklyKm,
      summary: { gymDays: snapshot.gymDays, runningDays: snapshot.runningDays },
    },
    nutritionWeek: {
      weekNumber: snapshot.weekNumber,
      goal: snapshot.goal,
      dailyCalories: snapshot.dailyCalories,
      proteinTargetG: snapshot.proteinG,
    },
  };
}

/**
 * Everything the engine needs for one week.
 * @param {string} weekStart
 * @param {number} depth how many earlier weeks to analyse for context
 */
function gatherInputs(weekStart, depth) {
  const profile = ProfileRepository.get() ?? {};
  const planned = plannedFor(weekStart);

  return {
    weekStart,
    weekNumber: planned.plan?.weekNumber ?? planned.nutritionWeek?.weekNumber,
    goal: planned.nutritionWeek?.goal ?? planned.plan?.goal ?? profile.goal,

    profile: {
      weightKg: profile.weightKg,
      goalWeightKg: profile.goalWeightKg,
      startWeightKg: profile.startWeightKg ?? profile.weightKg,
    },

    planned,

    history: {
      sessions: SessionRepository.all(),
      sets: WorkoutRepository.all(),
      runs: RunningRepository.all(),
      nutrition: NutritionRepository.all(),
      weights: WeightService.history(),
      reports: depth > 0 ? earlierReports(weekStart, depth) : [],
    },

    recovery: weekStart === startOfWeek(today()) ? RecoveryService.snapshot() : null,
    settings: SettingsRepository.get() ?? {},
  };
}

/**
 * The analysed reports for the weeks before this one, oldest first.
 * They are built at depth 0: a week's context needs its predecessors, not
 * its predecessors' predecessors, and without the floor this recurses.
 */
function earlierReports(weekStart, count) {
  const reports = [];
  for (let back = count; back >= 1; back -= 1) {
    reports.push(analysed(weeksBefore(weekStart, back), 0));
  }
  return reports;
}

/** Build and cache one week's analysis. Cleared by anything that changes it. */
const analysed = register('weekly-report', (weekStart, depth) =>
  ReportsEngine.weekly(gatherInputs(weekStart, depth)), [
  ...GLOBAL_INVALIDATION,
  EVENTS.WEIGHT_CHANGED,
  EVENTS.WORKOUT_LOGGED,
  EVENTS.WORKOUT_COMPLETED,
  EVENTS.RUN_LOGGED,
  EVENTS.RUN_COMPLETED,
  EVENTS.NUTRITION_LOGGED,
  EVENTS.PLAN_GENERATED,
  EVENTS.WEEK_CLOSED,
]);
