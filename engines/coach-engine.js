/**
 * coach-engine.js — phase 21. Saying what to do about all of it.
 *
 * Twenty phases produced a description. A `WeeklyReport` says what happened, a
 * `WeeklyInsights` set says what stood out, an `AnalyticsSummary` says which
 * way it is going, a `DashboardSnapshot` says what today holds. None of them
 * says what to *do*, and that gap is the whole of this phase.
 *
 * **It is rule-based and it contains no model.** No API, no language model, no
 * network. Fifty rules read the conclusions the other engines reached and each
 * one names a recommendation with its reasoning attached. That is a narrower
 * thing than the phrase "AI coach" suggests, and the narrowness is the point:
 * every sentence it produces can be traced to a threshold in constants.js and
 * a figure some named engine measured. Nothing in it is generated.
 *
 * **How a piece of advice is chosen.** Every rule runs — none excludes another
 * at match time, because a week can genuinely need less volume, more food and
 * more sleep at once. A rule appends a draft; `createAdvice` refuses any draft
 * missing evidence, a recommendation, its reasoning, or the engines behind it,
 * and the refusal is counted rather than swallowed.
 *
 * **How it is ranked.** Priority, then severity, then confidence, then the
 * amount of evidence, then the key for stability. The machinery is shared with
 * the insights engine, so the two cannot disagree about which of two records
 * is stronger.
 *
 * **How duplicates are handled.** Twice over. Advice sharing a `key` is merged
 * — same idea, two paths to it. Then advice that a stronger piece makes
 * *redundant as a sentence* is suppressed through the table in
 * `rules/coach/index.js`: "do not train today" already implies "take the
 * volume down", and printing both makes a coach sound like a broken machine.
 * Suppression runs after ranking, so what survives is the more important one.
 *
 * **How confidence works.** It is never chosen by a rule. The context computes
 * the weakest of the report's coverage and the analytics window's, and a rule
 * may cap it lower but cannot raise it. Advice cannot be surer than the
 * thinnest evidence under it.
 *
 * **Safety.** No rule names a condition, offers a cause, or interprets a
 * symptom. The strongest thing the health rules say is that a pattern is worth
 * showing to someone qualified — a refusal to give medical advice rather than
 * an instance of one. And when the inputs are too thin, the coach says so
 * instead of advising: `health.not-enough-data` outranks almost everything.
 *
 * Pure. No storage, no events, no clock except the timestamp a caller passes.
 */

import { createCoachContext } from './coach-context.js';
import {
  createAdvice, rankAdvice, mergeDuplicateAdvice, suppressOverlaps,
  groupByHorizon, groupBySeverity,
} from './coach-advice.js';
import { applyAll, makeReason } from '../rules/rule.js';
import { allCoachRules, COACH_RULE_SETS, SUPPRESSES } from '../rules/coach/index.js';
import { COACH, COACH_CATEGORY, COACH_SEVERITY, COACH_HORIZON, REPORTS } from './constants.js';

export const COACH_ENGINE_VERSION = '1.0.0';

/* ── The session ────────────────────────────────────────────────────────── */

/**
 * Coach one week.
 *
 * @param {import('./coach-context.js').CoachInput} input
 * @returns {object} CoachSession, frozen
 */
function session(input = {}) {
  const context = createCoachContext(input);
  const now = input.generatedAt ?? new Date().toISOString();

  /* 1. Every rule runs. None of them excludes another. */
  const applied = applyAll(allCoachRules(), context, { advice: [] });

  /* 2. Each draft becomes advice or is refused, and the refusal is recorded.
        A rule that produces a sentence without evidence behind it has failed
        at the one thing this engine is for. */
  const built = [];
  const refused = [];

  for (const draft of applied.draft.advice ?? []) {
    const { advice, refusedFor } = createAdvice(draft, now);
    if (advice) built.push(advice);
    else refused.push({ key: draft?.key ?? 'unnamed', refusedFor });
  }

  /* 3. Same idea twice → once. */
  const { advice: unique, merged } = mergeDuplicateAdvice(built);

  /* 4. Rank, then suppress. The order matters: suppressing first would let a
        low-priority rule silence a high-priority one it happens to cover. */
  const ranked = rankAdvice(unique);
  const { advice: kept, suppressed } = suppressOverlaps(ranked, SUPPRESSES);

  /* 5. Split by when it is meant to be read, then cap each list. */
  const byHorizon = groupByHorizon(kept);
  const dailyAdvice = byHorizon.daily.slice(0, COACH.MAX_DAILY);
  const weeklyAdvice = byHorizon.weekly.slice(0, COACH.MAX_WEEKLY);

  const bySeverity = groupBySeverity(kept);

  const reasons = [...applied.reasons];

  if (refused.length) {
    reasons.push(makeReason(
      { id: 'coach.refused', name: 'Advice refused', scope: 'coach' },
      `${refused.length} rule${refused.length === 1 ? '' : 's'} produced advice that could not be published: ${refused.map((item) => `${item.key} (${item.refusedFor})`).join(', ')}. Telling someone to change what they eat or how they train without being able to show why is the one failure this engine will not commit.`,
      { refused }
    ));
  }

  if (suppressed.length) {
    reasons.push(makeReason(
      { id: 'coach.suppressed', name: 'Advice suppressed', scope: 'coach' },
      `${suppressed.length} piece${suppressed.length === 1 ? '' : 's'} of advice were true but redundant beside something stronger: ${suppressed.map((item) => `${item.key} (covered by ${item.becauseOf})`).join(', ')}.`,
      { suppressed }
    ));
  }

  const trimmed = kept.length - (dailyAdvice.length + weeklyAdvice.length);
  if (trimmed > 0) {
    reasons.push(makeReason(
      { id: 'coach.capped', name: 'Advice capped', scope: 'coach' },
      `${kept.length} pieces of advice survived and the strongest ${dailyAdvice.length + weeklyAdvice.length} are carried. A coach that says twelve things gets none of them done; the rest remain in the engines that raised them.`,
      { survived: kept.length, carried: dailyAdvice.length + weeklyAdvice.length, trimmed }
    ));
  }

  if (!kept.length) {
    reasons.push(makeReason(
      { id: 'coach.quiet', name: 'Nothing to advise', scope: 'coach' },
      'No rule matched. That is a result rather than a failure: a week inside every threshold, with no trend crossing a line, has nothing that needs changing.',
      { available: context.available }
    ));
  }

  const focus = kept[0] ?? null;

  return Object.freeze({
    date: context.date,
    period: input.period ?? 'weekly',

    /* ── The lists ──────────────────────────────────────────────────── */
    dailyAdvice,
    weeklyAdvice,
    advice: kept,

    warnings: bySeverity.warnings.slice(0, COACH.MAX_WARNINGS),
    achievements: bySeverity.achievements.slice(0, COACH.MAX_ACHIEVEMENTS),

    /* ── The single answers ─────────────────────────────────────────── */

    /** The one thing that matters most, of everything above. */
    focus,

    /** The next concrete step, taken from the focus rather than invented. */
    nextStep: focus
      ? {
          label: focus.actions[0]?.label ?? focus.recommendation,
          fromAdvice: focus.key,
          category: focus.category,
          reason: focus.reasoning,
          evidence: focus.evidence,
        }
      : {
          label: null,
          fromAdvice: null,
          category: null,
          reason: 'Nothing matched, so there is no next step beyond continuing.',
          evidence: {},
        },

    priorityAdvice: kept.slice(0, 3),

    /** The worst thing and the best thing, each chosen by rank within its kind. */
    biggestRisk: bySeverity.warnings[0] ?? null,
    biggestOpportunity: kept.find((item) =>
      item.severity !== COACH_SEVERITY.POSITIVE &&
      item.category !== COACH_CATEGORY.HEALTH) ?? null,

    weeklySummary: summarise(context, kept, bySeverity),

    /* ── Provenance ─────────────────────────────────────────────────── */
    confidence: context.confidence(),
    available: context.available,
    missing: context.missing,

    byCategory: Object.fromEntries(
      Object.values(COACH_CATEGORY).map((category) =>
        [category, kept.filter((item) => item.category === category)])
    ),

    reasons,
    evidence: Object.fromEntries(kept.map((item) => [item.key, item.evidence])),

    /** One piece of advice by key, or null. */
    find(key) { return kept.find((item) => item.key === key) ?? null; },

    meta: {
      generatedAt: now,
      engineVersion: COACH_ENGINE_VERSION,
      engineId: 'coach-engine',
      rulesAvailable: allCoachRules().length,
      rulesApplied: applied.applied,
      produced: built.length,
      merged,
      suppressed,
      refused,
      carried: dailyAdvice.length + weeklyAdvice.length,
      sourceEngines: [...new Set(kept.flatMap((item) => item.sourceEngines))].sort(),
      /** Nothing in this list was measured here. */
      recalculated: [],
    },
  });
}

/**
 * The week in a few sentences, assembled from what the advice already says.
 *
 * Not a summary the coach writes: every clause below is a figure some engine
 * produced or a count of the advice above. It exists so a caller has one
 * paragraph rather than having to walk the lists.
 */
function summarise(context, advice, bySeverity) {
  if (!context.available.report && !context.available.dashboard) {
    return {
      headline: 'There is not enough recorded yet to say anything about the week.',
      detail: `${context.missing.length} of the eight inputs the coach reads are absent.`,
      confidence: REPORTS.CONFIDENCE_LEVEL.LOW,
      sourceEngines: ['coach-engine'],
    };
  }

  const parts = [];

  if (context.adherence !== null) parts.push(`${context.adherence}% adherence`);
  if (context.sessionsThisWeek !== null) parts.push(`${context.sessionsThisWeek} sessions`);
  if (context.runsThisWeek) parts.push(`${context.weeklyKm ?? 0} km run`);
  if (context.weightRateKgPerWeek !== null) parts.push(`${context.weightRateKgPerWeek} kg per week on the scale`);
  if (context.recoveryStatus) parts.push(`recovery ${context.recoveryStatus}`);

  return {
    headline: advice.length
      ? `${bySeverity.warnings.length} thing${bySeverity.warnings.length === 1 ? '' : 's'} to change, ${bySeverity.achievements.length} going well.`
      : 'Nothing needs changing this week.',
    detail: parts.length ? `${parts.join(', ')}.` : 'No figures were recorded for the week.',
    confidence: context.confidence(),
    sourceEngines: ['reports-engine', 'dashboard-engine'],
  };
}

/* ── Narrower views ─────────────────────────────────────────────────────── */

/**
 * Only what applies to today.
 *
 * The same session, filtered — not a second pass with different rules, so a
 * daily view can never contradict the weekly one it came from.
 */
function daily(input = {}) {
  const full = session(input);

  return Object.freeze({
    ...full,
    period: 'daily',
    advice: full.dailyAdvice,
    weeklyAdvice: [],
    focus: full.dailyAdvice[0] ?? full.focus,
  });
}

export const CoachEngine = Object.freeze({
  /** The full week. @returns {object} CoachSession */
  session,

  /** Today only, filtered out of the same session. */
  daily,

  /** Advice in one category, ranked. */
  forCategory(category, input = {}) {
    return session(input).byCategory[category] ?? [];
  },

  /** The rule sets, for a caller that wants to know what could have fired. */
  rules: COACH_RULE_SETS,
  ruleCount: allCoachRules().length,

  CATEGORY: COACH_CATEGORY,
  SEVERITY: COACH_SEVERITY,
  HORIZON: COACH_HORIZON,

  version: COACH_ENGINE_VERSION,
});
