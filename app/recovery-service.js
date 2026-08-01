/**
 * RecoveryService — one view of how recovered the person is.
 *
 * It computes nothing. The strain index was calculated by the planner's
 * context, the weight trend by the body engine, the training load by the
 * running progress engine, and adherence by the execution engines. This
 * service reads those numbers, puts them side by side, and applies the
 * thresholds in constants.js to give them a label.
 */

import { PlannerService } from '../services/planner-service.js';
import { RunningProgramService } from '../services/running-program-service.js';
import { WeightService } from '../services/weight-service.js';
import { SettingsRepository, SessionRepository } from '../repositories/index.js';
import { makeReason } from '../rules/rule.js';
import { register, GLOBAL_INVALIDATION } from './cache.js';
import { EVENTS } from '../events/index.js';
import { RECOVERY_STATUS, RECOVERY_BANDS, STRAIN, SLEEP } from '../engines/constants.js';

/** Label a strain index. A threshold read, not a formula. */
function statusFor(strainIndex, reportedScore) {
  if (strainIndex === null || strainIndex === undefined) return RECOVERY_STATUS.UNKNOWN;
  if (reportedScore !== null && reportedScore <= STRAIN.LOW_RECOVERY_SCORE) return RECOVERY_STATUS.POOR;
  if (strainIndex >= RECOVERY_BANDS.POOR_AT_OR_ABOVE) return RECOVERY_STATUS.POOR;
  if (strainIndex < RECOVERY_BANDS.GOOD_BELOW) return RECOVERY_STATUS.GOOD;
  return RECOVERY_STATUS.MODERATE;
}

const build = register('recovery', () => {
  const plan = PlannerService.plan();
  const running = RunningProgramService.progress();
  const settings = SettingsRepository.get();

  const strain = plan.recovery?.strainIndex ?? null;
  const components = plan.recovery?.strainComponents ?? {};
  const reported = plan.recovery?.score ?? null;

  const trend = WeightService.trend();

  /* Adherence, from the sessions the execution engine already judged. */
  const recent = SessionRepository.all().slice(0, 10);
  const finished = recent.filter((session) => session.state === 'completed');
  const compliance = recent.length
    ? Math.round((finished.length / recent.length) * 100)
    : null;

  const status = statusFor(strain, reported);

  const reasons = [];

  reasons.push(makeReason(
    { id: 'recovery.strain', name: 'Strain index', scope: 'recovery' },
    strain === null
      ? 'No strain index yet — it needs a planned week to read from.'
      : `Strain is ${strain} out of 100, driven mostly by ${plan.recovery?.strainComponents ? topDriver(components) : 'nothing in particular'}.`,
    { strain, components }
  ));

  if (settings?.sleepHours !== undefined && settings.sleepHours < SLEEP.TARGET_HOURS) {
    reasons.push(makeReason(
      { id: 'recovery.sleep', name: 'Sleep', scope: 'recovery' },
      `Sleeping ${settings.sleepHours} hours against a target of ${SLEEP.TARGET_HOURS}. Sleep is the largest single input to everything else here.`,
      { hours: settings.sleepHours }
    ));
  }

  if (running.trainingLoad.verdict === 'spiking') {
    reasons.push(makeReason(
      { id: 'recovery.running-load', name: 'Running load', scope: 'recovery' },
      `Running load is spiking — the last week is ${running.trainingLoad.ratio} times the recent average.`,
      running.trainingLoad
    ));
  }

  if (compliance !== null && compliance < 60) {
    reasons.push(makeReason(
      { id: 'recovery.compliance', name: 'Sessions finished', scope: 'recovery' },
      `${compliance}% of recent sessions were finished. Unfinished sessions can mean the plan is too much, or simply that life happened — the number alone does not say which.`,
      { compliance }
    ));
  }

  return {
    status,
    strainIndex: strain,
    strainComponents: components,
    reportedScore: reported,
    sleepHours: settings?.sleepHours ?? null,
    weightTrendKgPerWeek: trend?.ratePerWeek ?? null,
    runningLoad: running.trainingLoad,
    compliancePercent: compliance,
    reasons,
    generatedAt: new Date().toISOString(),
  };
}, [
  ...GLOBAL_INVALIDATION,
  EVENTS.PLAN_GENERATED,
  EVENTS.WORKOUT_COMPLETED,
  EVENTS.RUN_COMPLETED,
  EVENTS.RUN_LOGGED,
  EVENTS.WEIGHT_CHANGED,
]);

/** Which strain component contributed most. Reads what plan-context computed. */
function topDriver(components) {
  const entries = Object.entries(components ?? {});
  if (!entries.length) return 'nothing in particular';

  const [name] = entries.sort((a, b) => b[1] - a[1])[0];
  return {
    volume: 'lifting volume', running: 'running volume',
    sleep: 'short sleep', recovery: 'your own recovery rating',
  }[name] ?? name;
}

export const RecoveryService = Object.freeze({
  /** @returns {object} the recovery snapshot */
  snapshot() { return build(); },
  refresh() { build.invalidate(); return build(); },
  STATUS: RECOVERY_STATUS,
});
