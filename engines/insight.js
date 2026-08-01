/**
 * insight.js — what an insight is, how two are ordered, and how two that say
 * the same thing become one.
 *
 * An insight is an observation about data that already exists. It carries no
 * new number: every figure inside it was produced by an engine that owns it,
 * and `sourceEngine` names which. What this file adds is the discipline —
 *
 *   • an insight without evidence is not created (`createInsight` returns
 *     null and the engine counts the refusal),
 *   • an insight is ordered by priority, then severity, then confidence,
 *     then date, in that order and no other,
 *   • two insights with the same `key` are the same idea, and are merged
 *     rather than both shown.
 *
 * Pure. No storage, no events, no display.
 */

import { INSIGHTS, INSIGHT_SEVERITY, REPORTS } from './constants.js';
import {
  missingFields, hasRealEvidence, clampPriority, makeComparator, makeMerger,
} from './ranked-record.js';

/**
 * @typedef {object} Insight
 * @property {string} id            unique within one set: `${key}` plus a suffix when merged
 * @property {string} key           what idea this is — the dedupe key
 * @property {string} category      INSIGHT_CATEGORY
 * @property {string} severity      INSIGHT_SEVERITY
 * @property {number} priority      0–100
 * @property {string} title         one short sentence, as data
 * @property {string} summary       one longer sentence, as data
 * @property {string} reason        why this was concluded
 * @property {object} evidence      the numbers it was concluded from
 * @property {string} confidence    'high' | 'medium' | 'low'
 * @property {string} sourceEngine  who produced those numbers
 * @property {string|null} date     the date the observation belongs to
 * @property {object} relatedData   pointers back into the report it came from
 * @property {string[]} [mergedFrom] ids folded into this one
 */

/** Everything an insight must carry before it exists at all. */
const REQUIRED = ['key', 'category', 'severity', 'title', 'summary', 'reason', 'sourceEngine'];

/**
 * Build an insight, or refuse to.
 *
 * @param {object} draft
 * @returns {{insight: Insight|null, refusedFor: string|null}}
 */
export function createInsight(draft = {}) {
  const missing = missingFields(draft, REQUIRED);
  if (missing.length) return { insight: null, refusedFor: `missing ${missing[0]}` };

  const evidence = draft.evidence ?? {};
  if (!Object.keys(evidence).length) {
    return { insight: null, refusedFor: 'no evidence' };
  }

  /* Evidence made of nothing is not evidence. A key whose value is null says
     "this was not measured", which cannot be the ground for an observation. */
  if (!hasRealEvidence(evidence)) {
    return { insight: null, refusedFor: 'evidence is entirely empty' };
  }

  if (!Object.values(INSIGHT_SEVERITY).includes(draft.severity)) {
    return { insight: null, refusedFor: `unknown severity "${draft.severity}"` };
  }

  const confidence = draft.confidence ?? REPORTS.CONFIDENCE_LEVEL.LOW;
  if (!INSIGHTS.CONFIDENCE_RANK[confidence]) {
    return { insight: null, refusedFor: `unknown confidence "${confidence}"` };
  }

  return {
    insight: Object.freeze({
      id: draft.id ?? draft.key,
      key: draft.key,
      category: draft.category,
      severity: draft.severity,
      priority: clampPriority(draft.priority, INSIGHTS.PRIORITY.LOW),
      title: draft.title,
      summary: draft.summary,
      reason: draft.reason,
      evidence: Object.freeze({ ...evidence }),
      confidence,
      sourceEngine: draft.sourceEngine,
      date: draft.date ?? null,
      relatedData: Object.freeze({ ...(draft.relatedData ?? {}) }),
      mergedFrom: Object.freeze(draft.mergedFrom ?? []),
    }),
    refusedFor: null,
  };
}

/* ── Ranking ────────────────────────────────────────────────────────────── */

/**
 * Order two insights: priority, then severity, then confidence, then date.
 *
 * The order itself lives in `ranked-record.js`, which coaching advice uses
 * too — two records in this app cannot disagree about which of them is
 * stronger.
 */
export const compareInsights = makeComparator({
  severityRank: INSIGHTS.SEVERITY_RANK,
  confidenceRank: INSIGHTS.CONFIDENCE_RANK,
});

/** Sorted copy, strongest first. */
export function rankInsights(insights) {
  return [...insights].sort(compareInsights);
}

/* ── Deduplication ──────────────────────────────────────────────────────── */

/**
 * Fold insights that say the same thing into one.
 *
 * Two insights are the same idea when they share a `key` — "the scale has
 * stopped" reached from the weight trend and reached from the report's own
 * stall warning is one observation, not two. The survivor keeps the stronger
 * explanation, the union of both evidence sets, the higher priority and the
 * more severe label, and lists what was folded into it.
 *
 * @param {Insight[]} insights
 * @returns {{insights: Insight[], merged: number}}
 */
export function mergeDuplicates(insights) {
  const result = mergeInsightRecords(insights);
  return { insights: result.records, merged: result.merged };
}

const mergeInsightRecords = makeMerger({
  severityRank: INSIGHTS.SEVERITY_RANK,
  confidenceRank: INSIGHTS.CONFIDENCE_RANK,

  /* An insight also carries pointers back into its report, and the source
     engine has to name both contributors once two have been folded. */
  mergeExtra: (winner, loser) => ({
    relatedData: Object.freeze({ ...loser.relatedData, ...winner.relatedData }),
    sourceEngine: winner.sourceEngine === loser.sourceEngine
      ? winner.sourceEngine
      : `${winner.sourceEngine} + ${loser.sourceEngine}`,
  }),
});

/** Split a ranked list by severity, keeping the order inside each group. */
export function groupBySeverity(insights) {
  return {
    positive: insights.filter((insight) => insight.severity === INSIGHT_SEVERITY.POSITIVE),
    neutral: insights.filter((insight) => insight.severity === INSIGHT_SEVERITY.NEUTRAL),
    warning: insights.filter((insight) =>
      insight.severity === INSIGHT_SEVERITY.WARNING || insight.severity === INSIGHT_SEVERITY.CRITICAL),
  };
}
