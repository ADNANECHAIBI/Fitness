/**
 * progression-rules.js — reading whether the running is going anywhere.
 *
 * One rule wins. The verdict feeds the week's reasons and can be shown on its
 * own; it does not change the distance, which load-rules already decided.
 */

import { defineRule } from '../rule.js';
import { RunningEngine } from '../../engines/running-engine.js';

export const progressionRules = [
  defineRule({
    id: 'run-progress.no-history',
    name: 'Nothing to compare yet',
    scope: 'week',
    priority: 100,
    when: (context) => context.history.totalRuns < 3,
    apply: (context) => ({
      patch: { progress: 'unknown' },
      message: `Too little running logged to say whether anything is improving — ${context.history.totalRuns} run${context.history.totalRuns === 1 ? '' : 's'} on record. Pace targets are estimates until there are a few more.`,
    }),
  }),

  defineRule({
    id: 'run-progress.improving',
    name: 'Pace is improving',
    scope: 'week',
    priority: 90,
    when: (context) => context.history.paceTrend !== null && context.history.paceTrend <= -5,
    apply: (context) => ({
      patch: { progress: 'improving' },
      message: `Your recent runs average ${Math.abs(context.history.paceTrend)} seconds per kilometre faster than the ones before them. The easy-pace target moves with it, so easy stays easy rather than quietly becoming a race.`,
    }),
  }),

  defineRule({
    id: 'run-progress.declining',
    name: 'Pace is slipping',
    scope: 'week',
    priority: 85,
    when: (context) => context.history.paceTrend !== null && context.history.paceTrend >= 15,
    apply: (context) => ({
      patch: { progress: 'declining' },
      message: `Recent runs are averaging ${context.history.paceTrend} seconds per kilometre slower than before. That is usually accumulated fatigue, illness, or heat rather than lost fitness — worth checking sleep and the lifting load before assuming the training is wrong.`,
    }),
  }),

  defineRule({
    id: 'run-progress.steady',
    name: 'Holding steady',
    scope: 'week',
    priority: 10,
    when: () => true,
    apply: (context) => ({
      patch: { progress: 'steady' },
      message: `Pace is holding steady at about ${RunningEngine.formatPace(context.easyPace.secPerKm)} per kilometre for easy running. On a bulk that is the goal — maintaining aerobic fitness while the weight goes up.`,
    }),
  }),
];
