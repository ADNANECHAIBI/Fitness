/**
 * WeightService — everything about body weight.
 *
 * Weight lives on the Profile (current) and in the weekly reports (history).
 * The service is the only place that knows that, so a page asking "what does
 * he weigh?" never has to.
 *
 * Emits WEIGHT_CHANGED after every recorded change, so the dashboard, the
 * calorie targets and the goals all update from one write.
 */

import { ProfileRepository, WeeklyReportRepository, GoalsRepository } from '../repositories/index.js';
import { bus, EVENTS } from '../events/index.js';
import { today } from '../models/index.js';
import { BodyEngine } from '../engines/body-engine.js';

export const WeightService = Object.freeze({
  /** Current weight in kg, or null when the profile is empty. */
  current() {
    return ProfileRepository.get()?.weightKg ?? null;
  },

  /** Goal weight in kg, or null. */
  goal() {
    return ProfileRepository.get()?.goalWeightKg ?? null;
  },

  /**
   * Record a new weight. Updates the profile and announces the change.
   * @param {number} kg
   * @param {string} [date] ISO date the reading was taken
   * @throws {ValidationError} when the number is not a plausible body weight
   */
  log(kg, date = today()) {
    const previous = this.current();
    const profile = ProfileRepository.patch({ weightKg: kg });

    bus.emit(EVENTS.WEIGHT_CHANGED, {
      previous,
      current: profile.weightKg,
      delta: previous === null ? null : Number((profile.weightKg - previous).toFixed(2)),
      date,
    });

    return profile;
  },

  /** Every recorded weigh-in, oldest first: [{ date, kg }]. */
  history() {
    const start = ProfileRepository.get();
    const fromReports = WeeklyReportRepository.all()
      .filter((report) => typeof report.weightKg === 'number')
      .map((report) => ({ date: report.weekStart, kg: report.weightKg }));

    // The anchor is the weight recorded at onboarding, not the current one:
    // otherwise every new reading would move the starting point with it.
    const anchor = start?.startWeightKg ?? start?.weightKg;
    const rows = start?.startDate && typeof anchor === 'number'
      ? [...fromReports, { date: start.startDate, kg: anchor }]
      : fromReports;

    return rows.sort((a, b) => a.date.localeCompare(b.date));
  },

  /**
   * Progress toward the goal.
   * @returns {{start: number, current: number, goal: number,
   *            gained: number, remaining: number, percent: number}|null}
   */
  progress() {
    const profile = ProfileRepository.get();
    if (!profile?.weightKg || !profile?.goalWeightKg) return null;

    const history = this.history();
    const start = profile.startWeightKg ?? history[0]?.kg ?? profile.weightKg;
    const current = profile.weightKg;
    const goal = profile.goalWeightKg;

    const moved = current - start;

    return {
      start,
      current,
      goal,
      gained: Number(moved.toFixed(2)),
      remaining: Number((goal - current).toFixed(2)),
      percent: BodyEngine.progressToGoal({ startKg: start, currentKg: current, goalKg: goal }),
    };
  },

  /** Body mass index, or null when height or weight is missing. */
  bmi() {
    return BodyEngine.bmi(ProfileRepository.get() ?? {});
  },

  /**
   * Rate of weight change per week, measured across the recent weigh-ins
   * rather than between two of them.
   * @returns {{ratePerWeek, readings, spanDays}|null}
   */
  trend(days) {
    return BodyEngine.recentTrend(this.history(), days);
  },

  /** Mark a weight goal reached. */
  syncGoals() {
    const current = this.current();
    if (current === null) return 0;

    let closed = 0;
    for (const goal of GoalsRepository.find((g) => g.metric === 'weight' && g.status === 'active')) {
      const reached = goal.startValue !== null && goal.startValue < goal.target
        ? current >= goal.target
        : current <= goal.target;

      if (reached) {
        GoalsRepository.update(goal.id, { status: 'reached' });
        bus.emit(EVENTS.GOAL_CHANGED, { goal: goal.id, status: 'reached' });
        closed += 1;
      }
    }
    return closed;
  },
});
