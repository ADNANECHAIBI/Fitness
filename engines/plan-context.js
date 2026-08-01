/**
 * plan-context.js — turns raw records into the facts the rules read.
 *
 * The rules never see a repository, a Date object or a raw history array.
 * They see this: a flat, normalised, fully-derived snapshot of the week's
 * starting conditions. Everything expensive or fiddly happens once, here.
 *
 * Pure: it is handed data and returns data. It fetches nothing.
 */

import { defineFormula } from './formula.js';
import { round, clamp, sum, mean, divide } from './calculation-engine.js';
import { BodyEngine } from './body-engine.js';
import { StrengthEngine } from './strength-engine.js';
import { RunningEngine } from './running-engine.js';
import { EnergyEngine } from './energy-engine.js';
import {
  STRAIN, SLEEP, LAYOFF, PLANNER, ADJUSTMENT, UNITS,
} from './constants.js';
import { WEEKDAYS } from '../models/profile.js';

const MS_PER_DAY = 86400000;

/** ISO date string for a Date. */
function toISO(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** Parse an ISO date into a timestamp, or null. */
function parseISO(value) {
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : null;
}

/** The Monday on or before a date. Weeks start on Monday throughout. */
export function startOfWeek(isoDate) {
  const time = parseISO(isoDate);
  if (time === null) return null;

  const date = new Date(time);
  const shift = (date.getDay() + 6) % 7;        // Sunday is 0 in JS
  return toISO(new Date(time - shift * MS_PER_DAY));
}

/** The seven dates of a week, Monday first. */
export function weekDates(weekStartISO) {
  const start = parseISO(weekStartISO);
  if (start === null) return [];

  return Array.from({ length: UNITS.DAYS_PER_WEEK }, (_, i) => ({
    date: toISO(new Date(start + i * MS_PER_DAY)),
    weekday: WEEKDAYS[i],
  }));
}

/* ── Strain ─────────────────────────────────────────────────────────────── */

export const STRAIN_INDEX = defineFormula({
  id: 'strain-index',
  name: 'Composite strain index',
  source: 'Composite of established load markers: week-on-week volume change (acute:chronic workload ratio, Gabbett TJ. Br J Sports Med. 2016;50(5):273-280), running volume, sleep shortfall (Watson AM. Curr Sports Med Rep. 2017;16(6):413-418) and self-reported recovery. The weighting is a policy choice, not a published index.',
  accuracy: 'estimate',
  useWhen: 'Deciding how much load a week can carry. It is a relative signal — useful for comparing this week to last, not as an absolute measure of fatigue.',
  caveat: 'Only as good as its inputs. With no logged history and no self-report it falls back to neutral values and says so, rather than inventing a number.',

  /**
   * @returns {{index, components, driver, confident}} index runs 0–100
   */
  compute({ volumeThisWeek, volumeLastWeek, runningMinutes, sleepHours, recoveryScore }) {
    // A rise in volume, as a share of the previous week.
    const rise = volumeLastWeek > 0
      ? clamp(divide(volumeThisWeek - volumeLastWeek, volumeLastWeek) ?? 0, 0, STRAIN.VOLUME_RISE_AT_MAX)
      : 0;
    const volume = round((rise / STRAIN.VOLUME_RISE_AT_MAX) * 100, 0);

    const running = round(
      clamp((runningMinutes / STRAIN.RUNNING_MINUTES_AT_MAX) * 100, 0, 100),
      0
    );

    const debt = Math.max(0, SLEEP.TARGET_HOURS - sleepHours);
    const sleep = round(clamp((debt / SLEEP.TARGET_HOURS) * 100 * 2, 0, 100), 0);

    const recovery = round(
      clamp(
        ((STRAIN.RECOVERY_SCALE_MAX - recoveryScore) /
         (STRAIN.RECOVERY_SCALE_MAX - STRAIN.RECOVERY_SCALE_MIN)) * 100,
        0, 100
      ),
      0
    );

    const components = { volume, running, sleep, recovery };
    const index = round(
      volume * STRAIN.WEIGHTS.volume +
      running * STRAIN.WEIGHTS.running +
      sleep * STRAIN.WEIGHTS.sleep +
      recovery * STRAIN.WEIGHTS.recovery,
      0
    );

    // Which component contributed most, for the explanation.
    const driver = Object.entries(components)
      .map(([name, value]) => [name, value * STRAIN.WEIGHTS[name]])
      .sort((a, b) => b[1] - a[1])[0][0];

    const labels = {
      volume: 'a jump in lifting volume',
      running: 'running volume',
      sleep: 'short sleep',
      recovery: 'how you rated your recovery',
    };

    return {
      index,
      components,
      driver: labels[driver],
      confident: volumeLastWeek > 0 || runningMinutes > 0,
    };
  },
});

/* ── Context ────────────────────────────────────────────────────────────── */

/**
 * Build the planning context.
 *
 * @param {object} input
 * @param {object} input.profile
 * @param {object[]} [input.goals]
 * @param {object[]} [input.schedule]        active slots
 * @param {{date, kg}[]} [input.weightHistory]
 * @param {object[]} [input.runningHistory]
 * @param {object[]} [input.gymHistory]
 * @param {{score}} [input.recovery]         self-reported, 1–10
 * @param {object} [input.settings]
 * @param {string} [input.weekStart]         ISO date; defaults to this week
 * @param {string} [input.today]             ISO date, for deterministic tests
 * @returns {object} the context the rules read
 */
export function createPlanContext({
  profile = null,
  goals = [],
  schedule = [],
  weightHistory = [],
  runningHistory = [],
  gymHistory = [],
  recovery = null,
  settings = null,
  weekStart = null,
  today = null,
} = {}) {
  const reference = today ?? toISO(new Date());
  const start = weekStart ?? startOfWeek(reference);
  const days = weekDates(start);
  const end = days.at(-1)?.date ?? start;

  /* Week number, counted from the profile start date. */
  const startTime = parseISO(profile?.startDate ?? start);
  const weekTime = parseISO(start);
  const weekNumber = startTime !== null && weekTime !== null
    ? Math.max(1, Math.floor((weekTime - startOfWeekTime(startTime)) / (MS_PER_DAY * 7)) + 1)
    : 1;

  /* Which days are usable. Schedule wins; the profile is the fallback. */
  const fromSchedule = schedule
    .filter((slot) => slot?.active !== false && WEEKDAYS.includes(slot?.day))
    .map((slot) => slot.day);

  const availableDays = unique(
    fromSchedule.length ? fromSchedule : (profile?.availableDays ?? [])
  ).sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));

  /* Session length: the schedule's median, or the profile window, or a default. */
  const scheduledMinutes = schedule
    .map((slot) => slot?.durationMin)
    .filter((n) => typeof n === 'number' && n > 0);

  const sessionMinutes = clamp(
    scheduledMinutes.length
      ? Math.round(mean(scheduledMinutes))
      : (windowMinutes(profile) ?? PLANNER.DEFAULT_SESSION_MIN),
    PLANNER.MIN_SESSION_MIN,
    PLANNER.MAX_SESSION_MIN
  );

  /* Recent training load. */
  const windowStart = toISO(new Date(parseISO(start) - 7 * MS_PER_DAY));
  const priorStart = toISO(new Date(parseISO(start) - 14 * MS_PER_DAY));

  const lastWeekGym = gymHistory.filter((row) => row.date >= windowStart && row.date < start);
  const priorWeekGym = gymHistory.filter((row) => row.date >= priorStart && row.date < windowStart);
  const lastWeekRuns = runningHistory.filter((row) => row.date >= windowStart && row.date < start);

  const volumeThisWeek = StrengthEngine.totalVolume(lastWeekGym);
  const volumeLastWeek = StrengthEngine.totalVolume(priorWeekGym);
  const runningMinutes = round(sum(lastWeekRuns.map((run) => run.durationMin)), 0);

  /* Sleep and self-reported recovery. */
  const sleepHours = settings?.sleepHours ?? SLEEP.TARGET_HOURS;
  const recoveryScore = clamp(
    recovery?.score ?? settings?.recoveryScore ?? STRAIN.DEFAULT_RECOVERY_SCORE,
    STRAIN.RECOVERY_SCALE_MIN,
    STRAIN.RECOVERY_SCALE_MAX
  );

  const strain = STRAIN_INDEX.compute({
    volumeThisWeek, volumeLastWeek, runningMinutes, sleepHours, recoveryScore,
  });

  /* Time since the last logged session of any kind. */
  const lastSession = [...gymHistory, ...runningHistory]
    .map((row) => row.date)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  const layoffDays = lastSession
    ? Math.floor((parseISO(start) - parseISO(lastSession)) / MS_PER_DAY)
    : null;

  const layoff = {
    days: layoffDays,
    lastSession,
    // No history at all is a fresh start, not a break.
    onBreak: layoffDays !== null && layoffDays >= LAYOFF.DAYS_TO_COUNT_AS_BREAK,
  };

  /* Weight trend against what the goal asks for. */
  const trend = BodyEngine.recentTrend(weightHistory, ADJUSTMENT.WINDOW_DAYS);
  const targetRate = profile?.weightKg
    ? round((ADJUSTMENT.TARGET_RATE_FRACTION[profile.goal] ?? 0) * profile.weightKg, 3)
    : null;

  const weightTrend = buildTrend(trend, targetRate, profile?.weightKg);

  const goalProgress = profile?.startWeightKg && profile?.goalWeightKg
    ? BodyEngine.progressToGoal({
        startKg: profile.startWeightKg,
        currentKg: profile.weightKg,
        goalKg: profile.goalWeightKg,
      })
    : null;

  const trainingSlots = eligibleSlots(days, availableDays);

  return Object.freeze({
    weekStart: start,
    weekEnd: end,
    weekDays: days,
    weekNumber,

    profile,
    goals,
    goal: profile?.goal ?? 'maintain',
    targets: EnergyEngine.target(profile ?? {}),

    availableDays,
    availableDayCount: availableDays.length,

    /**
     * The days that can actually hold a session once the limit on consecutive
     * training days is respected. Rules count against this, not against the
     * raw availability — otherwise they would plan sessions the layout has to
     * throw away afterwards.
     */
    trainingSlots,
    maxTrainingDays: trainingSlots.length,

    sessionMinutes,

    history: {
      volumeThisWeek, volumeLastWeek, runningMinutes,
      gymSessions: unique(lastWeekGym.map((row) => row.date)).length,
      runs: lastWeekRuns.length,
    },

    strain,
    sleep: {
      hours: sleepHours,
      debtHours: round(Math.max(0, SLEEP.TARGET_HOURS - sleepHours), 1),
    },
    recovery: { score: recoveryScore, reported: recovery?.score !== undefined },
    layoff,
    weightTrend,
    goalProgress,
  });
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function unique(values) { return [...new Set(values)]; }

/**
 * The week's available days, minus whatever has to become rest to keep
 * training from running more than PLANNER.MAX_CONSECUTIVE_TRAINING_DAYS in a
 * row. Deterministic and order-preserving.
 *
 * @returns {{date, weekday}[]}
 */
export function eligibleSlots(days, availableDays) {
  const slots = [];
  let streak = 0;

  for (const day of days) {
    if (!availableDays.includes(day.weekday)) { streak = 0; continue; }

    if (streak >= PLANNER.MAX_CONSECUTIVE_TRAINING_DAYS) { streak = 0; continue; }

    slots.push(day);
    streak += 1;
  }
  return slots;
}

function startOfWeekTime(time) {
  const date = new Date(time);
  const shift = (date.getDay() + 6) % 7;
  return time - shift * MS_PER_DAY;
}

/** Minutes between the profile's session start and end, or null. */
function windowMinutes(profile) {
  if (!profile?.sessionStart || !profile?.sessionEnd) return null;
  const toMinutes = (time) => {
    const [h, m] = String(time).split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const start = toMinutes(profile.sessionStart);
  const end = toMinutes(profile.sessionEnd);
  return start === null || end === null || end <= start ? null : end - start;
}

/** Classify the observed rate against the target, with the tolerance band. */
function buildTrend(trend, targetRate, weightKg) {
  if (!trend || targetRate === null || !weightKg) {
    return {
      status: 'unknown',
      observedRate: null,
      targetRate,
      readings: trend?.readings ?? 0,
    };
  }

  const tolerance = targetRate === 0
    ? ADJUSTMENT.FLAT_TOLERANCE_FRACTION * weightKg
    : Math.abs(targetRate) * ADJUSTMENT.TOLERANCE_FRACTION;

  const observed = trend.ratePerWeek;
  const enough = trend.readings >= ADJUSTMENT.MIN_READINGS;

  let status = 'on-target';
  if (!enough) status = 'unknown';
  else if (observed < targetRate - tolerance) status = 'below-target';
  else if (observed > targetRate + tolerance) status = 'above-target';

  return {
    status,
    observedRate: observed,
    targetRate,
    toleranceKgPerWeek: round(tolerance, 3),
    readings: trend.readings,
  };
}
