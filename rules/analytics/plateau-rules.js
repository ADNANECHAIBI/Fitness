/**
 * plateau-rules.js — a figure that has stopped moving.
 *
 * A plateau is not the same as a low number. It is a slope inside the flat
 * band for long enough that the flatness is unlikely to be noise, and it is
 * only interesting where movement was the point: nobody is stalled on their
 * calorie intake, which is meant to sit still.
 *
 * The weight plateau is deliberately not detected here. The reports engine
 * already counts consecutive flat weeks — `weight.flatWeeks` — and rebuilding
 * that count from a fitted slope would give a second answer to a question
 * that is already answered. The rule below reads the report's count.
 */

import { defineRule } from '../rule.js';
import {
  ANALYTICS, ANALYTICS_FINDING, ANALYTICS_DIRECTION, REPORTS,
} from '../../engines/constants.js';

const add = (draft, item) => ({ findings: [...(draft.findings ?? []), item] });

/** Metrics where standing still is worth naming. */
const PROGRESS_METRICS = ['volumeKg', 'oneRepMaxKg', 'distanceKm', 'paceSecPerKm'];

export const plateauRules = [
  defineRule({
    id: 'plateau.weight',
    name: 'The scale has stopped',
    scope: 'analytics',
    priority: 100,
    when: (context) =>
      context.directionalGoal &&
      (context.flatWeightWeeks ?? 0) >= REPORTS.WEIGHT_STALL_WEEKS,
    apply: (context, draft) => {
      const weeks = context.flatWeightWeeks;
      const trend = context.trend('weightKg');

      return {
        patch: add(draft, {
          key: 'plateau.weight',
          kind: ANALYTICS_FINDING.PLATEAU,
          metric: 'weightKg',
          title: 'Body weight has stalled',
          summary: `${weeks} weeks without meaningful movement on a ${context.goal}.`,
          reason: `The reports engine counted ${weeks} consecutive weeks whose rate stayed inside ±${REPORTS.WEIGHT_STALL_KG} kg per week, past the ${REPORTS.WEIGHT_STALL_WEEKS} it calls a stall. Over the window the fitted slope is ${trend.perWeek} ${trend.unit}, which agrees. A ${context.goal} that is not moving the scale is not doing the thing it was set up to do.`,
          evidence: {
            flatWeeks: weeks,
            stallThresholdKg: REPORTS.WEIGHT_STALL_KG,
            stallWeeks: REPORTS.WEIGHT_STALL_WEEKS,
            fittedSlopePerWeek: trend.perWeek,
            goal: context.goal,
          },
          confidence: context.confidence(),
          sourceEngine: 'reports-engine + body-engine',
        }),
        message: `A weight plateau was reported from the reports engine's own count of ${weeks} flat weeks, not from a second measurement of the same thing.`,
      };
    },
  }),

  defineRule({
    id: 'plateau.performance',
    name: 'A performance figure has stopped moving',
    scope: 'analytics',
    priority: 80,
    when: (context) => PROGRESS_METRICS.some((metric) => context.stalled(metric)),
    apply: (context, draft) => {
      const items = PROGRESS_METRICS
        .filter((metric) => context.stalled(metric))
        .slice(0, ANALYTICS.MAX_PER_KIND)
        .map((metric) => {
          const trend = context.trend(metric);
          return {
            key: `plateau.${metric}`,
            kind: ANALYTICS_FINDING.PLATEAU,
            metric,
            title: `${capitalise(trend.label)} is flat`,
            summary: `${trend.perWeek} ${trend.unit} across ${trend.weeks} weeks.`,
            reason: `The slope through ${trend.weeks} weeks of ${trend.label} is ${trend.perWeek} ${trend.unit}, inside the ±${trend.band} band that counts as no movement. ${trend.weeks} readings is past the ${ANALYTICS.PLATEAU_WEEKS} a plateau needs, so this is flatness rather than a quiet fortnight.`,
            evidence: {
              perWeek: trend.perWeek,
              flatBand: trend.band,
              weeks: trend.weeks,
              first: trend.first ?? null,
              last: trend.last ?? null,
            },
            confidence: context.confidence(),
            sourceEngine: trend.source,
          };
        });

      return {
        patch: { findings: [...(draft.findings ?? []), ...items] },
        message: `${items.length} performance figure${items.length === 1 ? '' : 's'} sat inside the flat band for the whole window: ${items.map((item) => item.metric).join(', ')}.`,
      };
    },
  }),

  defineRule({
    id: 'plateau.adherence-ceiling',
    name: 'Adherence is flat because it is already at the top',
    scope: 'analytics',
    priority: 60,
    when: (context) => {
      const trend = context.trend('adherencePercent');
      const last = trend.last;
      return trend.direction === ANALYTICS_DIRECTION.FLAT &&
        last !== null && last !== undefined && last >= REPORTS.ADHERENCE_PERFECT;
    },
    apply: (context, draft) => {
      const trend = context.trend('adherencePercent');
      return {
        patch: add(draft, {
          key: 'plateau.adherence-ceiling',
          kind: ANALYTICS_FINDING.PLATEAU,
          metric: 'adherencePercent',
          title: 'Adherence is flat at the ceiling',
          summary: `Holding at ${trend.last}%.`,
          reason: `Adherence has not moved across ${trend.weeks} weeks, but it is sitting at ${trend.last}%, at or above the ${REPORTS.ADHERENCE_PERFECT}% the reports engine calls perfect. A figure that cannot rise is not stalled, and reporting it as a plateau alongside a stalled squat would be misleading.`,
          evidence: {
            perWeek: trend.perWeek,
            last: trend.last,
            ceiling: REPORTS.ADHERENCE_PERFECT,
            weeks: trend.weeks,
          },
          confidence: context.confidence(),
          sourceEngine: 'reports-engine',
        }),
        message: 'A flat adherence line at the ceiling was named as such rather than reported as a stall.',
      };
    },
  }),
];

/** Sentence case for a label an engine wrote in lower case. */
function capitalise(text) {
  return String(text).charAt(0).toUpperCase() + String(text).slice(1);
}
