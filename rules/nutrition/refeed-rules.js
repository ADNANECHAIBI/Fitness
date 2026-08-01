/**
 * refeed-rules.js — one day at maintenance inside a deficit.
 *
 * A refeed is a carbohydrate-led day at maintenance. Its value is mostly in
 * training quality and in making a long deficit tolerable; the metabolic
 * claims made for it are larger than the evidence supports, and the engine
 * says so rather than overselling it.
 */

import { defineRule } from '../rule.js';
import { REFEED } from '../../engines/constants.js';

export const refeedRules = [
  defineRule({
    id: 'refeed.not-in-a-deficit',
    name: 'No refeed outside a deficit',
    scope: 'week',
    priority: 100,
    when: (context) => !context.inDeficit,
    apply: () => ({
      patch: { refeed: false },
      message: `No refeed day — a refeed is a break from a deficit, and you are not in one.`,
    }),
  }),

  defineRule({
    id: 'refeed.too-early',
    name: 'Too early for a refeed',
    scope: 'week',
    priority: 95,
    when: (context) => context.inDeficit && context.weeksInDeficit < REFEED.MIN_DEFICIT_WEEKS,
    apply: (context) => ({
      patch: { refeed: false },
      message: `No refeed yet — that is week ${REFEED.MIN_DEFICIT_WEEKS} of a deficit onward, and this is week ${context.weeksInDeficit}. Before then there is nothing to recover from.`,
    }),
  }),

  defineRule({
    id: 'refeed.low-recovery-brings-it-forward',
    name: 'Low recovery brings a refeed forward',
    scope: 'week',
    priority: 90,
    when: (context, draft) =>
      context.inDeficit &&
      draft.dietBreak !== true &&
      context.recovery.score !== null &&
      context.recovery.score <= REFEED.LOW_RECOVERY_TRIGGER &&
      context.weeksInDeficit >= 2,
    apply: (context) => ({
      patch: { refeed: true, refeedReason: 'recovery' },
      message: `A refeed day this week, brought forward because you rated recovery ${context.recovery.score} out of 10. One day at maintenance, carbohydrate-led, on the heaviest training day.`,
    }),
  }),

  defineRule({
    id: 'refeed.scheduled',
    name: 'Scheduled refeed',
    scope: 'week',
    priority: 80,
    when: (context, draft) =>
      context.inDeficit &&
      draft.dietBreak !== true &&
      context.weeksInDeficit >= REFEED.MIN_DEFICIT_WEEKS,
    apply: (context) => ({
      patch: { refeed: true, refeedReason: 'scheduled' },
      message: `A refeed day this week — ${context.weeksInDeficit} weeks into the deficit. It lands on the hardest training day, at maintenance calories with the extra coming from carbohydrate. Most of what it buys is a better session and a break from being hungry; the metabolic claims made for refeeds are bigger than the evidence behind them.`,
    }),
  }),

  defineRule({
    id: 'refeed.suppressed-by-diet-break',
    name: 'A diet break replaces a refeed',
    scope: 'week',
    priority: 98,
    when: (context, draft) => draft.dietBreak === true,
    apply: () => ({
      patch: { refeed: false },
      message: `No separate refeed day — the whole week is already at maintenance.`,
    }),
  }),
];
