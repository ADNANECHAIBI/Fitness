/**
 * risk-rules.js — what a long window shows that a single week cannot.
 *
 * Every risk here is a shape across weeks. A spiking load in one week is the
 * running progress engine's business and the reports engine already warns
 * about it; what belongs here is load spiking *while recovery drifts down for
 * a quarter*, or four unlogged weeks in a row, which no weekly report can see
 * because it only ever looks at one week.
 *
 * None of these rules measures anything. Each reads trends the analytics
 * engine fitted through figures other engines produced, or counts weeks that
 * the context already marked as empty.
 */

import { defineRule } from '../rule.js';
import {
  ANALYTICS, ANALYTICS_FINDING, ANALYTICS_DIRECTION, RUNNING_LOAD,
  SURPLUS_GOALS, DEFICIT_GOALS, REPORTS,
} from '../../engines/constants.js';

const add = (draft, item) => ({ findings: [...(draft.findings ?? []), item] });

export const riskRules = [
  defineRule({
    id: 'risk.layoff',
    name: 'Training stopped for a stretch',
    scope: 'analytics',
    priority: 100,
    when: (context) => context.longestGapWeeks >= ANALYTICS.LAYOFF_WEEKS,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'risk.layoff',
        kind: ANALYTICS_FINDING.RISK,
        metric: null,
        title: `${context.longestGapWeeks} weeks with nothing logged`,
        summary: `${context.emptyWeeks.length} of ${context.weeksInWindow} weeks in the window carry no record at all.`,
        reason: `${context.longestGapWeeks} consecutive weeks hold no session, no run, no food and no weigh-in, past the ${ANALYTICS.LAYOFF_WEEKS} that reads as a break. Every trend in this analysis is fitted across that gap, and a line drawn over missing weeks is a line through an assumption. The app cannot tell a break in training from a break in logging.`,
        evidence: {
          longestGapWeeks: context.longestGapWeeks,
          emptyWeeks: context.emptyWeeks,
          weeksInWindow: context.weeksInWindow,
          weeksWithData: context.weeksWithData,
        },
        confidence: context.confidence(),
        sourceEngine: 'reports-engine',
      }),
      message: `A ${context.longestGapWeeks}-week gap was reported as a gap, so nothing below it reads as a measured decline.`,
    }),
  }),

  defineRule({
    id: 'risk.load-against-recovery',
    name: 'Load is climbing while recovery falls',
    scope: 'analytics',
    priority: 95,
    when: (context) => {
      const load = context.trend('trainingLoad');
      const strain = context.trend('strainIndex');
      return load.movement === 'rising' && strain.movement === 'rising' &&
        load.weeks >= ANALYTICS.REGRESSION_WEEKS;
    },
    apply: (context, draft) => {
      const load = context.trend('trainingLoad');
      const strain = context.trend('strainIndex');

      return {
        patch: add(draft, {
          key: 'risk.load-against-recovery',
          kind: ANALYTICS_FINDING.RISK,
          metric: 'trainingLoad',
          title: 'Load and strain are rising together',
          summary: `Load ${load.perWeek} per week, strain ${strain.perWeek} points per week.`,
          reason: `The acute:chronic running ratio rose by ${load.perWeek} per week across ${load.weeks} weeks while the planner's strain index rose by ${strain.perWeek} points per week over the same window. Either alone is a training block; both together for ${load.weeks} weeks is the shape that precedes an injury, and the safe band for the ratio is ${RUNNING_LOAD.SAFE_RATIO.join('–')}.`,
          evidence: {
            loadPerWeek: load.perWeek, loadLast: load.last ?? null,
            strainPerWeek: strain.perWeek, strainLast: strain.last ?? null,
            weeks: load.weeks, safeRatio: RUNNING_LOAD.SAFE_RATIO,
          },
          confidence: context.confidence(),
          sourceEngine: 'running-progress-engine + planner-engine',
        }),
        message: 'Two rising signals that no single week could have put beside each other.',
      };
    },
  }),

  defineRule({
    id: 'risk.adherence-slipping',
    name: 'Adherence is drifting down',
    scope: 'analytics',
    priority: 85,
    when: (context) => context.trend('adherencePercent').direction === ANALYTICS_DIRECTION.DECLINING &&
      context.trend('adherencePercent').weeks >= ANALYTICS.REGRESSION_WEEKS,
    apply: (context, draft) => {
      const trend = context.trend('adherencePercent');

      return {
        patch: add(draft, {
          key: 'risk.adherence-slipping',
          kind: ANALYTICS_FINDING.RISK,
          metric: 'adherencePercent',
          title: 'Adherence is drifting down',
          summary: `From ${trend.first}% to ${trend.last}% across ${trend.weeks} weeks.`,
          reason: `Overall adherence fell by ${Math.abs(trend.perWeek)} points per week across ${trend.weeks} weeks, from ${trend.first}% to ${trend.last}%. Adherence is the input every other figure here depends on: a plan followed less is not a plan that stopped working, and the two are easy to confuse once the results follow.`,
          evidence: {
            perWeek: trend.perWeek, first: trend.first ?? null, last: trend.last ?? null,
            weeks: trend.weeks, lowLine: REPORTS.ADHERENCE_LOW,
          },
          confidence: context.confidence(),
          sourceEngine: 'reports-engine',
        }),
        message: 'A slipping adherence line was named before the figures that depend on it are read as physiology.',
      };
    },
  }),

  defineRule({
    id: 'risk.goal-reversed',
    name: 'The scale is moving away from the goal',
    scope: 'analytics',
    priority: 90,
    when: (context) => context.directionalGoal &&
      context.trend('weightKg').direction === ANALYTICS_DIRECTION.DECLINING &&
      context.trend('weightKg').weeks >= ANALYTICS.REGRESSION_WEEKS,
    apply: (context, draft) => {
      const trend = context.trend('weightKg');
      const wanted = SURPLUS_GOALS.includes(context.goal.goal) ? 'up' : 'down';

      return {
        patch: add(draft, {
          key: 'risk.goal-reversed',
          kind: ANALYTICS_FINDING.RISK,
          metric: 'weightKg',
          title: 'The scale is going the wrong way',
          summary: `${trend.perWeek} kg per week on a ${context.goal.goal}.`,
          reason: `A ${context.goal.goal} wants the scale to go ${wanted}; the fitted slope through ${trend.weeks} weeks is ${trend.perWeek} kg per week, going the other way. This is the direction of travel over the whole window, not a single week's reading, which is why it is worth separating from ordinary week-to-week noise.`,
          evidence: {
            perWeek: trend.perWeek, first: trend.first ?? null, last: trend.last ?? null,
            weeks: trend.weeks, goal: context.goal.goal, wantedDirection: wanted,
          },
          confidence: context.confidence(),
          sourceEngine: 'body-engine',
        }),
        message: 'The scale is moving against the stated goal across the window.',
      };
    },
  }),

  defineRule({
    id: 'risk.protein-falling-on-surplus',
    name: 'Protein is falling while building',
    scope: 'analytics',
    priority: 70,
    when: (context) => SURPLUS_GOALS.includes(context.goal.goal) &&
      context.trend('proteinG').direction === ANALYTICS_DIRECTION.DECLINING &&
      context.trend('proteinG').weeks >= ANALYTICS.REGRESSION_WEEKS,
    apply: (context, draft) => {
      const trend = context.trend('proteinG');

      return {
        patch: add(draft, {
          key: 'risk.protein-falling',
          kind: ANALYTICS_FINDING.RISK,
          metric: 'proteinG',
          title: 'Protein is falling on a surplus',
          summary: `From ${trend.first} g to ${trend.last} g across ${trend.weeks} weeks.`,
          reason: `Daily protein fell by ${Math.abs(trend.perWeek)} g per week across ${trend.weeks} weeks while the goal is ${context.goal.goal}. A surplus with falling protein still adds weight; what it adds is the question, and no figure in this app can answer that one.`,
          evidence: {
            perWeek: trend.perWeek, first: trend.first ?? null, last: trend.last ?? null,
            weeks: trend.weeks, goal: context.goal.goal,
          },
          confidence: context.confidence(),
          sourceEngine: 'nutrition-engine',
        }),
        message: 'Falling protein on a surplus was named; what it means for composition is beyond what is measured here.',
      };
    },
  }),

  defineRule({
    id: 'risk.thin-window',
    name: 'The window is too short for its own claims',
    scope: 'analytics',
    priority: 60,
    when: (context) => !context.sufficient,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'risk.thin-window',
        kind: ANALYTICS_FINDING.RISK,
        metric: null,
        title: 'Not enough weeks yet',
        summary: `${context.weeksInWindow} of the ${context.minWeeks} a ${context.period} analysis expects.`,
        reason: `A ${context.period} analysis is built on ${context.minWeeks} weeks; this window holds ${context.weeksInWindow}, of which ${context.weeksWithData} carry any data. The trends below are still fitted and still honest about their own inputs, but a slope through this few points is a description of these weeks, not a direction of travel.`,
        evidence: {
          weeksInWindow: context.weeksInWindow,
          weeksWithData: context.weeksWithData,
          minWeeks: context.minWeeks,
          period: context.period,
        },
        confidence: REPORTS.CONFIDENCE_LEVEL.LOW,
        sourceEngine: 'analytics-engine',
      }),
      message: `The window holds ${context.weeksInWindow} weeks against the ${context.minWeeks} its period expects, and says so rather than presenting the result as settled.`,
    }),
  }),

  defineRule({
    id: 'risk.deficit-and-strain',
    name: 'Cutting while strain climbs',
    scope: 'analytics',
    priority: 80,
    when: (context) => DEFICIT_GOALS.includes(context.goal.goal) &&
      context.trend('strainIndex').movement === 'rising' &&
      context.trend('strainIndex').weeks >= ANALYTICS.REGRESSION_WEEKS,
    apply: (context, draft) => {
      const strain = context.trend('strainIndex');

      return {
        patch: add(draft, {
          key: 'risk.deficit-and-strain',
          kind: ANALYTICS_FINDING.RISK,
          metric: 'strainIndex',
          title: 'Strain is rising through a deficit',
          summary: `${strain.perWeek} points per week while on a ${context.goal.goal}.`,
          reason: `The planner's strain index rose by ${strain.perWeek} points per week across ${strain.weeks} weeks while the goal is ${context.goal.goal}. Recovery is bought with food, and a deficit is a smaller budget for it — the two moving together for ${strain.weeks} weeks is worth seeing side by side.`,
          evidence: {
            strainPerWeek: strain.perWeek, last: strain.last ?? null,
            weeks: strain.weeks, goal: context.goal.goal,
          },
          confidence: context.confidence(),
          sourceEngine: 'planner-engine',
        }),
        message: 'Rising strain and a deficit were put beside each other, which is a comparison only a long window can make.',
      };
    },
  }),
];
