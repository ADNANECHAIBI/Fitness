/**
 * ranked-record.js — the discipline shared by insights and coaching advice.
 *
 * Phase 17 built a record that refuses to exist without evidence, orders
 * itself by priority then severity then confidence, and folds duplicates into
 * one. Phase 21 needed exactly the same three behaviours for a different
 * record. Copying them would have produced two answers to "which of these two
 * is stronger", so the machinery moved here and both callers pass in their own
 * vocabulary.
 *
 * Nothing here knows what an insight or a piece of advice is. It is handed
 * rank tables and a field list; it enforces the rules and says nothing about
 * the domain.
 *
 * `insight.js` behaves identically after the move — the functions are the same
 * ones, parameterised rather than rewritten.
 *
 * Pure. No storage, no events, no display.
 */

/** Every field on this list must be present and truthy, or the record is refused. */
export function missingFields(draft, required) {
  return required.filter((field) => !draft?.[field]);
}

/**
 * Is this evidence, or is it an empty shape?
 *
 * A key whose value is null says "this was not measured", which cannot be the
 * ground for a conclusion. An object of nothing but nulls is refused as firmly
 * as no object at all — otherwise every rule could satisfy the requirement by
 * naming the fields it wished it had.
 */
export function hasRealEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') return false;

  const keys = Object.keys(evidence);
  if (!keys.length) return false;

  return keys.some((key) => evidence[key] !== null && evidence[key] !== undefined);
}

/** Priority is a band, not an opinion: anything outside 0–100 is clamped. */
export function clampPriority(value, fallback = 0) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(100, Math.max(0, Math.round(number)));
}

/**
 * Build a comparator.
 *
 * The order is fixed on purpose and the same for both callers: priority, then
 * severity, then confidence, then date. Severity alone would put every warning
 * above a personal record; priority alone would ignore how sure the conclusion
 * is. Date breaks the remaining ties so the ordering is reproducible rather
 * than dependent on the order the rules happened to run in.
 *
 * @param {{severityRank: Record<string, number>, confidenceRank: Record<string, number>}} vocabulary
 */
export function makeComparator({ severityRank, confidenceRank }) {
  return function compare(a, b) {
    if (b.priority !== a.priority) return b.priority - a.priority;

    const severity = (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0);
    if (severity !== 0) return severity;

    const confidence = (confidenceRank[b.confidence] ?? 0) - (confidenceRank[a.confidence] ?? 0);
    if (confidence !== 0) return confidence;

    return String(b.date ?? '').localeCompare(String(a.date ?? ''));
  };
}

/**
 * Which of two records holds the stronger explanation.
 *
 * Strength is not rank. A merged record keeps the explanation resting on the
 * most evidence at the highest confidence, even when the other one shouted
 * louder; priority only breaks the tie.
 */
function strongerOf(a, b, confidenceRank) {
  const score = (record) => [
    confidenceRank[record.confidence] ?? 0,
    Object.keys(record.evidence ?? {}).length,
    record.priority,
  ];

  const [confidenceA, evidenceA, priorityA] = score(a);
  const [confidenceB, evidenceB, priorityB] = score(b);

  if (confidenceA !== confidenceB) return confidenceA > confidenceB ? a : b;
  if (evidenceA !== evidenceB) return evidenceA > evidenceB ? a : b;
  return priorityA >= priorityB ? a : b;
}

/**
 * Build a deduplicator.
 *
 * Two records are the same idea when they share a `key`. The survivor keeps
 * the stronger explanation, the union of both evidence sets, the higher
 * priority and the more severe label — merging must never make a week look
 * calmer than either half of it did — and lists what was folded in.
 *
 * @param {object} vocabulary
 * @param {Record<string, number>} vocabulary.severityRank
 * @param {Record<string, number>} vocabulary.confidenceRank
 * @param {(winner: object, loser: object) => object} [vocabulary.mergeExtra]
 *        extra fields to carry across, for a record with more than the basics
 */
export function makeMerger({ severityRank, confidenceRank, mergeExtra = () => ({}) }) {
  return function mergeDuplicates(records) {
    const byKey = new Map();
    let merged = 0;

    for (const record of records) {
      const existing = byKey.get(record.key);

      if (!existing) {
        byKey.set(record.key, record);
        continue;
      }

      merged += 1;
      const winner = strongerOf(existing, record, confidenceRank);
      const loser = winner === existing ? record : existing;

      byKey.set(record.key, Object.freeze({
        ...winner,
        severity: (severityRank[winner.severity] ?? 0) >= (severityRank[loser.severity] ?? 0)
          ? winner.severity : loser.severity,
        priority: Math.max(winner.priority, loser.priority),
        evidence: Object.freeze({ ...loser.evidence, ...winner.evidence }),
        mergedFrom: Object.freeze([...new Set([
          ...(winner.mergedFrom ?? []), ...(loser.mergedFrom ?? []), loser.id,
        ])]),
        ...mergeExtra(winner, loser),
      }));
    }

    return { records: [...byKey.values()], merged };
  };
}
