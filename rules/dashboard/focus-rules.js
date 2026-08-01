/**
 * focus-rules.js — which single thing matters most today.
 *
 * Exactly one of these wins, so they are run with `selectOne`. The winner
 * names a *kind*, not a sentence: the dashboard engine then points at the
 * task it already built for that kind, and the page turns it into words.
 *
 * The order is the argument, and the order is priority. An open session beats
 * a planned one because leaving a session half-logged corrupts what
 * progression reads next week. A planned session beats eating because a
 * session missed is gone, while a calorie target can still be met at ten in
 * the evening. Eating beats resting because a rest day has nothing to do.
 *
 * Nothing here reads a number this file computed. `remaining` was recorded by
 * the engine from the nutrition engine's target and the day's logged intake;
 * `priority` came from the planner.
 */

import { defineRule } from '../rule.js';
import { PRIORITY } from '../../engines/constants.js';

export const focusRules = [
  defineRule({
    id: 'focus.finish-session',
    name: 'Finish the open session',
    scope: 'day',
    priority: 100,
    when: (context) => context.sessionInProgress,
    apply: (context) => ({
      patch: { focus: { kind: 'workout', open: true } },
      message: `A lifting session for ${context.date} is open and not yet finished. Progression reads completed sets, so a session left half-logged is a session next week plans around wrongly.`,
    }),
  }),

  defineRule({
    id: 'focus.essential-workout',
    name: "Today's lifting session is essential",
    scope: 'day',
    priority: 90,
    when: (context) => context.hasWorkout &&
      (context.workout.priority ?? PRIORITY.IMPORTANT) === PRIORITY.ESSENTIAL,
    apply: (context) => ({
      patch: { focus: { kind: 'workout', open: false } },
      message: `The planner marked today's session essential in the ${context.plan?.phase ?? 'current'} phase, which is its way of saying that moving it costs the week rather than the day.`,
    }),
  }),

  defineRule({
    id: 'focus.workout',
    name: 'Lift today',
    scope: 'day',
    priority: 80,
    when: (context) => context.hasWorkout,
    apply: (context) => ({
      patch: { focus: { kind: 'workout', open: false } },
      message: `${context.workout.exercises?.length ?? 0} exercises are planned for about ${context.workout.estimatedMinutes} minutes, which is the largest single commitment on today's list.`,
    }),
  }),

  defineRule({
    id: 'focus.run',
    name: 'Run today',
    scope: 'day',
    priority: 70,
    when: (context) => context.hasRun,
    apply: (context) => ({
      patch: { focus: { kind: 'running', open: false } },
      message: `No lifting today, so the ${context.run.distanceKm} km ${String(context.run.type).replace(/-/g, ' ')} run is the session the week is counting on.`,
    }),
  }),

  defineRule({
    id: 'focus.eat',
    name: 'Meet the intake target',
    scope: 'day',
    priority: 60,
    when: (context) => context.hasMeals && (context.remaining?.calories ?? 0) > 0,
    apply: (context) => ({
      patch: { focus: { kind: 'meals', open: false } },
      message: `Nothing is planned to train today, and ${context.remaining.calories} kcal of the target is still unaccounted for. On a rest day intake is the only lever left.`,
    }),
  }),

  defineRule({
    id: 'focus.recover',
    name: 'Rest',
    scope: 'day',
    priority: 50,
    when: (context) => context.restDay,
    apply: (context) => ({
      patch: { focus: { kind: 'rest', open: false } },
      message: `${context.planDay?.focus ?? 'Recovery'} — the plan set today aside deliberately, and an unplanned session on a rest day is what turns a heavy week into an injury.`,
    }),
  }),

  defineRule({
    id: 'focus.set-up',
    name: 'Nothing is planned yet',
    scope: 'day',
    priority: 10,
    when: (context) => !context.hasPlan,
    apply: () => ({
      patch: { focus: { kind: 'setup', open: false } },
      message: 'No week has been generated, so there is nothing to do today that the app knows about. Generating a week is what gives every other figure here something to read.',
    }),
  }),
];
