/**
 * recovery-rules.js — how much the week should be pulled back.
 *
 * These stack: several can apply at once, each folding its adjustment into the
 * draft. Order is by priority, so the strongest brake is applied first and the
 * softer ones refine it.
 *
 * The draft they shape:
 *   volumeFactor      multiplier on planned training volume (1 = full)
 *   extraRestDays     rest days added on top of what the split calls for
 *   mobilityDays      dedicated mobility sessions
 *   intensityCap      the hardest intensity allowed this week
 *   sleepTargetHours  what to aim for
 */

import { defineRule } from './rule.js';
import { PLANNER, STRAIN, SLEEP, LAYOFF, INTENSITY } from '../engines/constants.js';

export const recoveryRules = [
  defineRule({
    id: 'recovery.deload-week',
    name: 'Deload volume',
    scope: 'week',
    priority: 100,
    when: (context, draft) => draft.deload === true,
    apply: () => ({
      patch: {
        volumeFactor: PLANNER.DELOAD_VOLUME_FACTOR,
        intensityCap: INTENSITY.MODERATE,
        extraRestDays: 1,
      },
      message: `Volume is cut to ${Math.round(PLANNER.DELOAD_VOLUME_FACTOR * 100)}% and an extra rest day added, because this is a deload week. Training hard through a deload defeats its purpose.`,
    }),
  }),

  defineRule({
    id: 'recovery.returning-from-break',
    name: 'Reduced load on return',
    scope: 'week',
    priority: 95,
    when: (context) => context.layoff.onBreak,
    apply: (context) => ({
      patch: {
        volumeFactor: LAYOFF.RETURN_VOLUME_FACTOR,
        intensityCap: INTENSITY.MODERATE,
      },
      message: `Volume starts at ${Math.round(LAYOFF.RETURN_VOLUME_FACTOR * 100)}% this week. After ${context.layoff.days} days without a logged session, returning at full load is where injuries come from.`,
    }),
  }),

  defineRule({
    id: 'recovery.high-strain-extra-rest',
    name: 'Extra rest for high strain',
    scope: 'week',
    priority: 80,
    when: (context, draft) =>
      context.strain.index >= PLANNER.DELOAD_STRAIN_THRESHOLD && !draft.deload,
    apply: (context, draft) => ({
      patch: { extraRestDays: (draft.extraRestDays ?? 0) + 1 },
      message: `An extra rest day is added: strain is ${context.strain.index} out of 100, driven mostly by ${context.strain.driver}.`,
    }),
  }),

  defineRule({
    id: 'recovery.sleep-debt',
    name: 'Sleep debt caps intensity',
    scope: 'week',
    priority: 70,
    when: (context) => context.sleep.debtHours >= SLEEP.DEBT_HOURS,
    apply: (context) => ({
      patch: {
        intensityCap: INTENSITY.MODERATE,
        sleepTargetHours: SLEEP.TARGET_HOURS,
      },
      message: `Hard sessions are off the table this week. You are averaging ${context.sleep.hours} hours of sleep against a target of ${SLEEP.TARGET_HOURS} — a shortfall of ${context.sleep.debtHours} hours a night, and strength and recovery both suffer before you notice it.`,
    }),
  }),

  defineRule({
    id: 'recovery.low-self-report',
    name: 'Low recovery score adds mobility',
    scope: 'week',
    priority: 60,
    when: (context) => context.recovery.score <= STRAIN.LOW_RECOVERY_SCORE,
    apply: (context, draft) => ({
      patch: {
        mobilityDays: (draft.mobilityDays ?? 0) + 1,
        volumeFactor: Math.min(draft.volumeFactor ?? 1, 0.85),
      },
      message: `A mobility day replaces a harder session, and volume is trimmed to 85%. You rated recovery ${context.recovery.score} out of ${STRAIN.RECOVERY_SCALE_MAX}, which is low enough to act on.`,
    }),
  }),

  defineRule({
    id: 'recovery.high-strain-raises-sleep-target',
    name: 'Higher sleep target under load',
    scope: 'week',
    priority: 50,
    when: (context) => context.strain.index >= 50,
    apply: (context, draft) => ({
      patch: {
        sleepTargetHours: (draft.sleepTargetHours ?? SLEEP.TARGET_HOURS) + SLEEP.HIGH_STRAIN_BONUS_HOURS,
      },
      message: `Sleep target goes up by ${SLEEP.HIGH_STRAIN_BONUS_HOURS} hours while strain sits at ${context.strain.index}. Recovery is bought with sleep before anything else.`,
    }),
  }),
];
