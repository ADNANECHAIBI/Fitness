/**
 * recovery-rules.js — running's effect on everything else.
 *
 * These do not change distance; load-rules does that. They set the flags the
 * session rules read, and they report the impact on the lifting week.
 */

import { defineRule } from '../rule.js';
import { RUNNING_LOAD, STRAIN } from '../../engines/constants.js';

export const runningRecoveryRules = [
  defineRule({
    id: 'running-recovery.deload',
    name: 'Deload keeps it easy',
    scope: 'week',
    priority: 100,
    when: (context) => context.deload,
    apply: () => ({
      patch: { easyOnly: true, recoveryImpact: 'minimal' },
      message: `Nothing hard this week. Running stays at an intensity that helps recovery rather than competing with it.`,
    }),
  }),

  defineRule({
    id: 'running-recovery.low-self-report',
    name: 'Low recovery drops the intensity',
    scope: 'week',
    priority: 90,
    when: (context) =>
      (context.profile?.recoveryScore ?? context.settings?.recoveryScore ?? null) !== null &&
      (context.profile?.recoveryScore ?? context.settings?.recoveryScore) <= STRAIN.LOW_RECOVERY_SCORE,
    apply: () => ({
      patch: { easyOnly: true },
      message: `Every run is easy this week — you rated recovery low, and hard running is the first thing that should go.`,
    }),
  }),

  defineRule({
    id: 'running-recovery.impact-on-lifting',
    name: 'Impact on the lifting week',
    scope: 'week',
    priority: 50,
    when: () => true,
    apply: (context, draft) => {
      const km = draft.weeklyKm ?? 0;
      const heavy = context.load.liftingStrain >= RUNNING_LOAD.LIFTING_HEAVY_STRAIN;

      const impact = draft.easyOnly && km < 20 ? 'minimal'
        : km > 40 || (heavy && km > 25) ? 'high'
        : 'moderate';

      const explanation = {
        minimal: `Running should not interfere with lifting this week: ${km} km, all easy.`,
        moderate: `${km} km of running will take some recovery from lifting, mostly on leg days. If squats start feeling heavier than the numbers say, this is the first place to look.`,
        high: `${km} km is enough running to compete with lifting for recovery${heavy ? ', on top of an already demanding lifting week' : ''}. Expect leg sessions to feel harder, and cut the running before cutting the lifting if something has to give.`,
      };

      return {
        patch: { recoveryImpact: impact },
        message: explanation[impact],
      };
    },
  }),
];
