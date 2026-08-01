/**
 * coach-advice.js — what a piece of advice is, and what it must carry.
 *
 * Advice is the only output in this app that tells someone to *do* something,
 * which is why it is the most constrained record in it. Three rules, enforced
 * here rather than trusted to forty rule files:
 *
 *   1. **No advice without evidence.** `createAdvice` returns null and the
 *      engine counts the refusal. Evidence made entirely of nulls is refused
 *      too — otherwise a rule could satisfy the requirement by naming the
 *      figures it wished it had.
 *   2. **No advice without a recommendation and its reasoning.** A record
 *      that says something is wrong without saying what to do about it, or
 *      says what to do without saying why, is not coaching.
 *   3. **No advice without naming the engines behind it.** `sourceEngines` is
 *      a list because most advice rests on two or three — a deload suggestion
 *      reads the planner's strain and the analytics trend, and a reader
 *      deserves to know which.
 *
 * Ordering and deduplication come from `ranked-record.js`, shared with the
 * insights engine so the two cannot disagree about which of two records is
 * stronger.
 *
 * Pure. No storage, no events, no display. Every string is data.
 */

import { COACH, COACH_SEVERITY, COACH_CATEGORY, COACH_HORIZON, REPORTS } from './constants.js';
import {
  missingFields, hasRealEvidence, clampPriority, makeComparator, makeMerger,
} from './ranked-record.js';

/**
 * @typedef {object} CoachAdvice
 * @property {string} id              unique within one session
 * @property {string} key             what idea this is — the dedupe key
 * @property {string} category        COACH_CATEGORY
 * @property {number} priority        0–100
 * @property {string} severity        COACH_SEVERITY
 * @property {string} title           one short sentence, as data
 * @property {string} summary         what is happening
 * @property {string} recommendation  what to do about it
 * @property {string} reasoning       why that follows from the evidence
 * @property {object} evidence        the figures it rests on
 * @property {string} confidence      'high' | 'medium' | 'low'
 * @property {string[]} sourceEngines which engines produced those figures
 * @property {object[]} actions       concrete steps, as data
 * @property {string} horizon         COACH_HORIZON — daily or weekly
 * @property {string} createdAt
 * @property {string[]} [mergedFrom]
 */

const REQUIRED = [
  'key', 'category', 'severity', 'title', 'summary',
  'recommendation', 'reasoning',
];

/**
 * Build one piece of advice, or refuse to.
 *
 * @param {object} draft
 * @param {string} [now] the timestamp to stamp; passed in so the record stays pure
 * @returns {{advice: CoachAdvice|null, refusedFor: string|null}}
 */
export function createAdvice(draft = {}, now = null) {
  const missing = missingFields(draft, REQUIRED);
  if (missing.length) return { advice: null, refusedFor: `missing ${missing[0]}` };

  if (!hasRealEvidence(draft.evidence)) {
    return {
      advice: null,
      refusedFor: Object.keys(draft.evidence ?? {}).length
        ? 'evidence is entirely empty'
        : 'no evidence',
    };
  }

  if (!Object.values(COACH_CATEGORY).includes(draft.category)) {
    return { advice: null, refusedFor: `unknown category "${draft.category}"` };
  }

  if (!Object.values(COACH_SEVERITY).includes(draft.severity)) {
    return { advice: null, refusedFor: `unknown severity "${draft.severity}"` };
  }

  const confidence = draft.confidence ?? REPORTS.CONFIDENCE_LEVEL.LOW;
  if (!COACH.CONFIDENCE_RANK[confidence]) {
    return { advice: null, refusedFor: `unknown confidence "${confidence}"` };
  }

  const sourceEngines = normaliseSources(draft.sourceEngines ?? draft.sourceEngine);
  if (!sourceEngines.length) {
    return { advice: null, refusedFor: 'no source engine named' };
  }

  return {
    advice: Object.freeze({
      id: draft.id ?? draft.key,
      key: draft.key,
      category: draft.category,
      priority: clampPriority(draft.priority, COACH.PRIORITY.LOW),
      severity: draft.severity,

      title: draft.title,
      summary: draft.summary,
      recommendation: draft.recommendation,
      reasoning: draft.reasoning,

      evidence: Object.freeze({ ...draft.evidence }),
      confidence,
      sourceEngines: Object.freeze(sourceEngines),

      actions: Object.freeze((draft.actions ?? []).slice(0, COACH.MAX_ACTIONS)
        .map((action) => Object.freeze({ ...action }))),

      horizon: Object.values(COACH_HORIZON).includes(draft.horizon)
        ? draft.horizon
        : COACH_HORIZON.WEEKLY,

      date: draft.date ?? null,
      createdAt: now ?? new Date().toISOString(),
      mergedFrom: Object.freeze(draft.mergedFrom ?? []),
    }),
    refusedFor: null,
  };
}

/** One engine or several, always a clean list. */
function normaliseSources(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(/\s*\+\s*/);
  return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))];
}

/* ── Ranking ────────────────────────────────────────────────────────────── */

/**
 * Order two pieces of advice: priority, then severity, then confidence, then
 * date. Evidence breaks the last tie — between two otherwise identical
 * records, the one resting on more measurements goes first, because that is
 * the one a reader can check.
 */
const byRank = makeComparator({
  severityRank: COACH.SEVERITY_RANK,
  confidenceRank: COACH.CONFIDENCE_RANK,
});

export function compareAdvice(a, b) {
  const ranked = byRank(a, b);
  if (ranked !== 0) return ranked;

  const evidence = Object.keys(b.evidence ?? {}).length - Object.keys(a.evidence ?? {}).length;
  if (evidence !== 0) return evidence;

  return String(a.key).localeCompare(String(b.key));
}

/** Sorted copy, most important first. */
export function rankAdvice(advice) {
  return [...advice].sort(compareAdvice);
}

/* ── Deduplication ──────────────────────────────────────────────────────── */

const mergeAdviceRecords = makeMerger({
  severityRank: COACH.SEVERITY_RANK,
  confidenceRank: COACH.CONFIDENCE_RANK,

  /* Advice carries a recommendation, actions and a list of engines. The
     winner's recommendation survives — two recommendations concatenated is
     not advice — but the actions and the engines are the union, since both
     halves were genuinely read. */
  mergeExtra: (winner, loser) => ({
    sourceEngines: Object.freeze([...new Set([...winner.sourceEngines, ...loser.sourceEngines])]),
    actions: Object.freeze([
      ...winner.actions,
      ...loser.actions.filter((action) =>
        !winner.actions.some((kept) => kept.label === action.label)),
    ].slice(0, COACH.MAX_ACTIONS)),
  }),
});

/**
 * Fold advice that says the same thing into one.
 *
 * Two records are the same idea when they share a `key`. "Eat more" reached
 * from a stalled scale and reached from a calorie trend below target is one
 * piece of advice, not two — and hearing it twice makes a coach sound like a
 * broken machine rather than an attentive one.
 *
 * @param {CoachAdvice[]} advice
 * @returns {{advice: CoachAdvice[], merged: number}}
 */
export function mergeDuplicateAdvice(advice) {
  const result = mergeAdviceRecords(advice);
  return { advice: result.records, merged: result.merged };
}

/**
 * Advice that says the same thing under different keys.
 *
 * Keys catch the same rule firing twice. This catches two *different* rules
 * reaching the same instruction — "add a rest day" and "reduce the load" are
 * separate ideas that become one sentence in practice, and a session
 * containing both reads as nagging. The higher-ranked one survives; the other
 * is recorded as suppressed, not silently dropped.
 *
 * @param {CoachAdvice[]} ranked  already in rank order
 * @param {Record<string, string[]>} conflicts  key → keys it makes redundant
 * @returns {{advice: CoachAdvice[], suppressed: object[]}}
 */
export function suppressOverlaps(ranked, conflicts = {}) {
  const kept = [];
  const suppressed = [];
  /** key → the advice that made it redundant, so the reason survives. */
  const blocked = new Map();

  for (const advice of ranked) {
    if (blocked.has(advice.key)) {
      suppressed.push({ key: advice.key, becauseOf: blocked.get(advice.key) });
      continue;
    }

    kept.push(advice);
    for (const redundant of conflicts[advice.key] ?? []) {
      if (!blocked.has(redundant)) blocked.set(redundant, advice.key);
    }
  }

  return { advice: kept, suppressed };
}

/** Split ranked advice by when it is meant to be read. */
export function groupByHorizon(advice) {
  return {
    daily: advice.filter((item) => item.horizon === COACH_HORIZON.DAILY),
    weekly: advice.filter((item) => item.horizon === COACH_HORIZON.WEEKLY),
  };
}

/** Split ranked advice by how loudly it speaks. */
export function groupBySeverity(advice) {
  return {
    warnings: advice.filter((item) =>
      item.severity === COACH_SEVERITY.CRITICAL || item.severity === COACH_SEVERITY.WARNING),
    achievements: advice.filter((item) => item.severity === COACH_SEVERITY.POSITIVE),
    neutral: advice.filter((item) => item.severity === COACH_SEVERITY.INFO),
  };
}
