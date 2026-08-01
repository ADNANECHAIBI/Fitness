/**
 * split-rules.js — which muscles each training day is for.
 *
 * One rule wins (selectOne). The split follows from how many gym days the
 * planner allocated, not from a template someone picked: with two days a week
 * a push/pull/legs split leaves every muscle trained once every ten days,
 * which is worse than two full-body sessions.
 *
 * A "template" here is a list of movement-pattern slots per day. It contains
 * no exercise names — exercise-selection.js turns slots into exercises.
 */

import { defineRule } from '../rule.js';
import { MOVEMENT as M, MUSCLE as U } from '../../data/taxonomy.js';

/**
 * A slot is a movement pattern, optionally aimed at particular muscles.
 * An isolation slot without a muscle target would pick the same exercise on
 * every day of the week, which is how a leg day ends up doing lateral raises.
 */
const slot = (movement, muscles = null) => ({ movement, muscles });

const FULL_BODY = [
  slot(M.SQUAT), slot(M.HORIZONTAL_PUSH), slot(M.HORIZONTAL_PULL),
  slot(M.HINGE), slot(M.VERTICAL_PULL), slot(M.ANTI_EXTENSION),
];
const UPPER = [
  slot(M.HORIZONTAL_PUSH), slot(M.HORIZONTAL_PULL), slot(M.VERTICAL_PUSH),
  slot(M.VERTICAL_PULL),
  slot(M.ISOLATION, [U.BICEPS]), slot(M.ISOLATION, [U.TRICEPS]),
];
const LOWER = [
  slot(M.SQUAT), slot(M.HINGE), slot(M.LUNGE),
  slot(M.ISOLATION, [U.CALVES]), slot(M.ANTI_EXTENSION),
];
const PUSH = [
  slot(M.HORIZONTAL_PUSH), slot(M.VERTICAL_PUSH), slot(M.HORIZONTAL_PUSH),
  slot(M.ISOLATION, [U.SIDE_DELTS]), slot(M.ISOLATION, [U.TRICEPS]),
];
const PULL = [
  slot(M.VERTICAL_PULL), slot(M.HORIZONTAL_PULL), slot(M.HORIZONTAL_PULL),
  slot(M.ISOLATION, [U.REAR_DELTS]), slot(M.ISOLATION, [U.BICEPS]),
];
const LEGS = [
  slot(M.SQUAT), slot(M.HINGE), slot(M.LUNGE),
  slot(M.ISOLATION, [U.HAMSTRINGS]), slot(M.ISOLATION, [U.CALVES]),
];

/** name → the day templates it cycles through. */
const TEMPLATES = {
  'full-body': [{ name: 'Full body', slots: FULL_BODY }],
  'upper-lower': [
    { name: 'Upper body', slots: UPPER },
    { name: 'Lower body', slots: LOWER },
  ],
  'push-pull-legs': [
    { name: 'Push', slots: PUSH },
    { name: 'Pull', slots: PULL },
    { name: 'Legs', slots: LEGS },
  ],
};

const template = (key, reason) => ({ patch: { split: key, dayTemplates: TEMPLATES[key] }, message: reason });

export const splitRules = [
  defineRule({
    id: 'split.one-or-two-days-full-body',
    name: 'Full body on one or two days',
    scope: 'week',
    priority: 100,
    when: (context) => context.gymDayCount > 0 && context.gymDayCount <= 2,
    apply: (context) => template('full-body',
      `Full-body sessions. With ${context.gymDayCount} lifting day${context.gymDayCount === 1 ? '' : 's'} a week, a split would leave each muscle trained once every ten days or worse — too infrequent to build anything.`),
  }),

  defineRule({
    id: 'split.three-days-full-body-beginner',
    name: 'Full body three times for a beginner',
    scope: 'week',
    priority: 90,
    when: (context) => context.gymDayCount === 3 && context.level === 'beginner',
    apply: () => template('full-body',
      `Three full-body sessions. At this stage frequency drives progress more than per-session volume, and every pattern gets practised three times a week.`),
  }),

  defineRule({
    id: 'split.three-days-push-pull-legs',
    name: 'Push, pull and legs on three days',
    scope: 'week',
    priority: 80,
    when: (context) => context.gymDayCount === 3,
    apply: () => template('push-pull-legs',
      `Push, pull and legs. Three days is enough volume per session to justify splitting, and it keeps each session inside a sensible length.`),
  }),

  defineRule({
    id: 'split.four-days-upper-lower',
    name: 'Upper and lower twice',
    scope: 'week',
    priority: 70,
    when: (context) => context.gymDayCount === 4,
    apply: () => template('upper-lower',
      `Upper and lower body, twice each. Four days gives every muscle two sessions a week, which is where the evidence for hypertrophy is strongest.`),
  }),

  defineRule({
    id: 'split.five-plus-push-pull-legs',
    name: 'Push, pull and legs rotating',
    scope: 'week',
    priority: 60,
    when: (context) => context.gymDayCount >= 5,
    apply: (context) => template('push-pull-legs',
      `Push, pull and legs on rotation across ${context.gymDayCount} days. At this frequency the split keeps any single session from running too long.`),
  }),

  defineRule({
    id: 'split.no-gym-days',
    name: 'No lifting days planned',
    scope: 'week',
    priority: 10,
    when: (context) => context.gymDayCount === 0,
    apply: () => ({
      patch: { split: 'none', dayTemplates: [] },
      message: `No lifting sessions this week — the planner allocated no gym days, so there is nothing to build.`,
    }),
  }),
];

export { TEMPLATES };
