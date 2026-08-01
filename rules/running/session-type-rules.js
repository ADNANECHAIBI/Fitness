/**
 * session-type-rules.js — what kind of run each day is.
 *
 * One rule wins per slot. The order matters: the conditions that must
 * override everything sit highest, and the default easy run sits last.
 */

import { defineRule } from '../rule.js';
import { RUN_TYPE, RUNNING_PROGRAM, QUALITY_TYPES } from '../../engines/constants.js';

const pick = (type, message) => ({ patch: { type }, message });

export const sessionTypeRules = [
  defineRule({
    id: 'run-type.easy-only-week',
    name: 'Easy running only',
    scope: 'slot',
    priority: 100,
    when: (context) => context.week.easyOnly === true,
    apply: (context) => pick(
      context.slot.position === 0 && context.week.longRunAllowed ? RUN_TYPE.EASY : RUN_TYPE.EASY,
      `An easy run. Something earlier in the week — a deload, a break, or the load ratio — put a ceiling on intensity, and this session sits under it.`
    ),
  }),

  defineRule({
    id: 'run-type.first-runs-are-walks',
    name: 'Start with walking',
    scope: 'slot',
    priority: 95,
    when: (context) =>
      context.level === 'beginner' && !context.history.hasHistory,
    apply: () => pick(RUN_TYPE.WALK,
      `A brisk walk rather than a run. With nothing logged yet, the first sessions build the habit and the tissue tolerance that running needs — the running comes next.`),
  }),

  defineRule({
    id: 'run-type.long-run',
    name: 'The week\'s long run',
    scope: 'slot',
    priority: 85,
    when: (context) =>
      context.slot.isLast && context.runningDayCount >= 2 && !context.week.easyOnly,
    apply: (context) => pick(RUN_TYPE.LONG,
      `The long run of the week, at easy pace. It is the session that builds the aerobic base everything else rests on, and it goes last so the harder work happens on fresher legs.`),
  }),

  defineRule({
    id: 'run-type.no-quality-yet',
    name: 'Too early for hard running',
    scope: 'slot',
    priority: 80,
    when: (context) =>
      context.history.weeksRunning < RUNNING_PROGRAM.QUALITY_UNLOCK_WEEKS &&
      context.slot.position > 0,
    apply: (context) => pick(RUN_TYPE.EASY,
      `An easy run. Hard sessions start after about ${RUNNING_PROGRAM.QUALITY_UNLOCK_WEEKS} weeks of consistent running — you have ${context.history.weeksRunning} so far, and interval work on an unbuilt base is where injuries come from.`),
  }),

  defineRule({
    id: 'run-type.quality-cap-reached',
    name: 'Enough hard running this week',
    scope: 'slot',
    priority: 78,
    when: (context) => context.week.qualityUsed >= RUNNING_PROGRAM.MAX_QUALITY_SESSIONS,
    apply: () => pick(RUN_TYPE.EASY,
      `An easy run — the week already has its ${RUNNING_PROGRAM.MAX_QUALITY_SESSIONS} hard sessions, and a third would cost more than it returns.`),
  }),

  defineRule({
    id: 'run-type.tempo-for-endurance-goal',
    name: 'Tempo work',
    scope: 'slot',
    priority: 70,
    when: (context) =>
      context.slot.position === 0 &&
      context.runningDayCount >= 3 &&
      context.history.weeksRunning >= RUNNING_PROGRAM.QUALITY_UNLOCK_WEEKS,
    apply: () => pick(RUN_TYPE.TEMPO,
      `A tempo run: a sustained, comfortably hard effort. It is the highest return per minute of any running session, which is why it goes first in the week.`),
  }),

  defineRule({
    id: 'run-type.intervals-when-there-is-room',
    name: 'Interval session',
    scope: 'slot',
    priority: 65,
    when: (context) =>
      context.runningDayCount >= 4 &&
      context.slot.position === 1 &&
      context.history.weeksRunning >= RUNNING_PROGRAM.QUALITY_UNLOCK_WEEKS &&
      context.goal !== 'bulk',
    apply: () => pick(RUN_TYPE.INTERVAL,
      `Intervals. With four or more running days there is room for a second hard session, and short repeats raise the ceiling that tempo work then fills in.`),
  }),

  defineRule({
    id: 'run-type.fartlek-instead-of-intervals',
    name: 'Fartlek instead of intervals',
    scope: 'slot',
    priority: 63,
    when: (context) =>
      context.runningDayCount >= 4 &&
      context.slot.position === 1 &&
      context.goal === 'bulk' &&
      context.history.weeksRunning >= RUNNING_PROGRAM.QUALITY_UNLOCK_WEEKS,
    apply: () => pick(RUN_TYPE.FARTLEK,
      `A fartlek rather than a structured interval session. It gives most of the stimulus at a lower total cost, which matters while you are trying to gain weight.`),
  }),

  defineRule({
    id: 'run-type.recovery-after-hard-lifting',
    name: 'Recovery jog after heavy lifting',
    scope: 'slot',
    priority: 60,
    when: (context) => context.slot.followsHardLifting === true,
    apply: () => pick(RUN_TYPE.RECOVERY,
      `A recovery jog — short and slower than easy pace. It falls the day after a hard lifting session, so its job is blood flow, not fitness.`),
  }),

  defineRule({
    id: 'run-type.strides-on-a-short-slot',
    name: 'Strides on a short slot',
    scope: 'slot',
    priority: 50,
    when: (context) =>
      context.slot.availableMinutes < RUNNING_PROGRAM.MIN_SESSION_MIN + 5 &&
      context.runningDayCount > 1,
    apply: (context) => pick(RUN_TYPE.STRIDES,
      `Strides: a few short accelerations with full recovery. Only ${context.slot.availableMinutes} minutes are free, which is not enough for a run that changes anything, but is enough to keep the legs quick.`),
  }),

  defineRule({
    id: 'run-type.default-easy',
    name: 'Easy run',
    scope: 'slot',
    priority: 10,
    when: () => true,
    apply: () => pick(RUN_TYPE.EASY,
      `An easy run at conversational pace. Most running should be easy — it builds the aerobic base without adding fatigue that the hard sessions need.`),
  }),
];

export { QUALITY_TYPES };
