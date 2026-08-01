import { createLogger } from '../scripts/logger.js';

const log = createLogger('rules');

/**
 * rule.js — how a planning rule is declared and run.
 *
 * A rule is a small, named, testable decision: a condition and what it does
 * when the condition holds. The planner never asks "if this and that" — it
 * runs lists of rules and collects what they decided. Adding a policy means
 * adding a rule file entry, never editing a branch inside the planner.
 *
 * A rule is pure. It reads a context, returns a change and a sentence
 * explaining it, and touches nothing else. No storage, no events, no DOM.
 */

/**
 * @typedef {object} Rule
 * @property {string} id            stable identifier, used in Reasons[]
 * @property {string} name          short human name
 * @property {string} scope         'phase' | 'week' | 'day' | 'nutrition'
 * @property {number} priority      higher wins when rules compete
 * @property {(context: object, draft: object) => boolean} when
 * @property {(context: object, draft: object) => {patch: object, message: string}} apply
 */

/**
 * Declare a rule.
 * @param {Rule} definition
 * @returns {Rule}
 * @throws {Error} when the declaration is incomplete — a silent no-op rule is
 *         worse than a loud failure at import time
 */
export function defineRule(definition) {
  for (const key of ['id', 'name', 'scope', 'when', 'apply']) {
    if (!definition[key]) throw new Error(`rule "${definition.id ?? '?'}" is missing "${key}"`);
  }
  return Object.freeze({ priority: 0, ...definition });
}

/** Sort a rule list by priority, highest first. Stable for equal priorities. */
function byPriority(rules) {
  return [...rules].sort((a, b) => b.priority - a.priority);
}

/** Build one entry for the plan's Reasons[]. */
export function makeReason(rule, message, extra = {}) {
  return { ruleId: rule.id, rule: rule.name, scope: rule.scope, message, ...extra };
}

/**
 * Run the first rule that matches, and stop.
 * Used where exactly one answer is possible — which phase the week is in.
 *
 * @returns {{patch: object, reason: object|null, rule: Rule|null}}
 */
export function selectOne(rules, context, draft = {}) {
  for (const rule of byPriority(rules)) {
    if (!safeWhen(rule, context, draft)) continue;

    const result = safeApply(rule, context, draft);
    if (!result) continue;

    return { patch: result.patch, reason: makeReason(rule, result.message), rule };
  }
  return { patch: {}, reason: null, rule: null };
}

/**
 * Run every matching rule in priority order, folding each patch into the draft.
 * Used where several policies can stack — recovery adjustments, for instance.
 *
 * @returns {{draft: object, reasons: object[], applied: string[]}}
 */
export function applyAll(rules, context, initialDraft = {}) {
  let draft = { ...initialDraft };
  const reasons = [];
  const applied = [];

  for (const rule of byPriority(rules)) {
    if (!safeWhen(rule, context, draft)) continue;

    const result = safeApply(rule, context, draft);
    if (!result) continue;

    draft = { ...draft, ...result.patch };
    reasons.push(makeReason(rule, result.message, result.extra ?? {}));
    applied.push(rule.id);
  }

  return { draft, reasons, applied };
}

/**
 * Run rules against one day, folding into that day's draft.
 * @returns {{day: object, reasons: object[]}}
 */
export function applyToDay(rules, context, day) {
  let draft = { ...day };
  const reasons = [];

  for (const rule of byPriority(rules)) {
    if (!safeWhen(rule, { ...context, day: draft }, draft)) continue;

    const result = safeApply(rule, { ...context, day: draft }, draft);
    if (!result) continue;

    draft = { ...draft, ...result.patch };
    reasons.push(makeReason(rule, result.message, { date: draft.date }));
  }

  return { day: draft, reasons };
}

/* ── Containment ────────────────────────────────────────────────────────────
   A rule that throws must not take the week down with it. The failure is
   logged and the rule is skipped; every other rule still runs.              */

function safeWhen(rule, context, draft) {
  try {
    return Boolean(rule.when(context, draft));
  } catch (error) {
    log.error(`[rules] "${rule.id}" failed while testing its condition`, error);
    return false;
  }
}

function safeApply(rule, context, draft) {
  try {
    const result = rule.apply(context, draft);
    if (!result || typeof result.message !== 'string') {
      log.error(`[rules] "${rule.id}" returned no explanation and was skipped`);
      return null;
    }
    return { patch: result.patch ?? {}, message: result.message, extra: result.extra };
  } catch (error) {
    log.error(`[rules] "${rule.id}" failed while applying`, error);
    return null;
  }
}
