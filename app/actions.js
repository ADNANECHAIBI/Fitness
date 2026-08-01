/**
 * actions.js — everything the UI can do, in one place.
 *
 * Pure delegation. It exists so a page imports from `app/` and nothing else:
 * without it every screen would reach into services directly, and the boundary
 * would only be a convention rather than something you can check.
 */

import { ExecutionService } from '../services/execution-service.js';
import { RunningProgramService } from '../services/running-program-service.js';
import { WeightService } from '../services/weight-service.js';
import { NutritionService } from '../services/nutrition-service.js';
import {
  ProfileRepository, SettingsRepository, ScheduleRepository, GoalsRepository,
  OnboardingRepository,
} from '../repositories/index.js';
import { bus, EVENTS } from '../events/index.js';
import { today } from '../models/index.js';

export const Actions = Object.freeze({
  /* ── Lifting ──────────────────────────────────────────────────────────── */

  activeSession() { return ExecutionService.active(); },
  startWorkout(date) { return ExecutionService.start(date); },
  logSet(session, exerciseId, entry) { return ExecutionService.logSet(session, exerciseId, entry); },
  skipExercise(session, exerciseId, options) { return ExecutionService.skipExercise(session, exerciseId, options); },
  finishWorkout(session, options) { return ExecutionService.complete(session, options); },
  cancelWorkout(session, options) { return ExecutionService.cancel(session, options); },
  sessionProgress(session) { return ExecutionService.progress(session); },

  /* ── Running ──────────────────────────────────────────────────────────── */

  startRun(date, options) { return RunningProgramService.start(date, options); },
  finishRun(execution, actual) { return RunningProgramService.complete(execution, actual); },
  skipRun(execution, options) { return RunningProgramService.skip(execution, options); },
  cancelRun(execution, options) { return RunningProgramService.cancel(execution, options); },

  /* ── Logging ──────────────────────────────────────────────────────────── */

  logWeight(kg, date) { return WeightService.log(kg, date); },
  logIntake(entry) { return NutritionService.log(entry); },

  /* ── Onboarding ───────────────────────────────────────────────────────── */

  /** The wizard's draft, so it can resume where it stopped. */
  onboardingDraft() { return OnboardingRepository.get() ?? {}; },

  saveOnboardingDraft(answers) {
    try { return OnboardingRepository.save(answers); }
    catch { return null; }
  },

  /**
   * Turn a finished wizard into real records, in order. Orchestration, not
   * logic: every value was already validated by the field it came from, and
   * each repository validates again on write.
   *
   * @throws {ValidationError} when the profile itself is rejected
   */
  completeOnboarding(answers) {
    const profile = ProfileRepository.save({
      age: answers.age,
      sex: answers.sex,
      heightCm: answers.heightCm,
      weightKg: answers.weightKg,
      startWeightKg: answers.weightKg,
      goalWeightKg: answers.goalWeightKg ?? null,
      activityLevel: answers.activityLevel,
      goal: answers.goal,
      startDate: today(),
      trainingDays: answers.trainingDays,
      availableDays: answers.availableDays ?? [],
      sessionStart: answers.sessionStart,
      sessionEnd: answers.sessionEnd,
    });

    SettingsRepository.save({
      sleepHours: answers.sleepHours,
      appetite: answers.appetite,
      budgetLevel: answers.budgetLevel,
      injuries: answers.injuries ?? '',
      onboarded: true,
    });

    const minutes = (time) => {
      const [h, m] = String(time).split(':').map(Number);
      return h * 60 + m;
    };
    const duration = Math.max(5, minutes(answers.sessionEnd) - minutes(answers.sessionStart));

    for (const day of answers.availableDays ?? []) {
      ScheduleRepository.create({ day, type: 'gym', startTime: answers.sessionStart, durationMin: duration });
    }

    if (answers.goalWeightKg) {
      GoalsRepository.create({
        metric: 'weight',
        label: `Reach ${answers.goalWeightKg} kg`,
        target: answers.goalWeightKg,
        unit: 'kg',
        startValue: answers.weightKg,
        startDate: today(),
      });
    }

    OnboardingRepository.clear();
    bus.emit(EVENTS.ONBOARDED, profile);
    return profile;
  },
});
