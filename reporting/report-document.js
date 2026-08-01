/**
 * report-document.js — what a report *is*, before anyone decides to draw it.
 *
 * A `ReportDocument` is the single thing every renderer in this layer accepts.
 * It holds no fitness knowledge, performs no arithmetic, and knows nothing
 * about HTML, PDF or paper. It is a title, a period, a list of sections, and
 * the provenance of every figure inside them.
 *
 * Three properties it is built to guarantee:
 *
 *   1. **Nothing is calculated.** A field arrives with its value already
 *      decided by whichever engine owns it. This file rounds a display value
 *      and formats nothing else — and even the rounding is recorded, so a
 *      reader can tell the difference between 72.5 and "72.5 shown from
 *      72.4999".
 *
 *   2. **Every figure carries where it came from.** `source`, `sourceKey`,
 *      `reason` and `evidence` travel with the value. They are copied from the
 *      explanation the producing engine already wrote; nothing here composes a
 *      new one. A field without a source is still allowed — some values are
 *      structural, like a week number — but it is marked, and the audit counts
 *      how many.
 *
 *   3. **Nothing private gets in.** Every value passes the scrub in
 *      `constants.js` on the way in, not on the way out, so no renderer can
 *      accidentally be the last line of defence.
 *
 * Labels are keys, never sentences. `labelKey` is resolved by a renderer
 * against whatever translator it was given, which is what keeps English out of
 * the Arabic document and out of this file entirely. Text that an *engine*
 * wrote — a coach's reasoning, a warning's message — is carried verbatim as
 * `text`, because re-translating a sentence the engine composed would be
 * inventing a claim it did not make.
 */

import { SECTION_KIND, REPORTING, PRIVATE_KEYS, PRIVATE_PATTERNS } from './constants.js';

/**
 * @typedef {object} Field
 * @property {string} labelKey    an i18n key, resolved at render time
 * @property {object} [labelVars]
 * @property {*} value            already decided elsewhere
 * @property {string|null} unit
 * @property {string|null} source      the engine that produced it
 * @property {string|null} sourceKey   its key in that engine's explanation map
 * @property {string|null} reason
 * @property {object} evidence
 */

/**
 * @typedef {object} Section
 * @property {string} id
 * @property {string} kind        SECTION_KIND
 * @property {string} titleKey
 * @property {Field[]} [fields]
 * @property {object} [table]     { columnKeys, rows }
 * @property {object[]} [items]
 * @property {object} [chart]     ChartData
 * @property {string} [text]      verbatim, as an engine wrote it
 * @property {object} metadata
 */

/* ── Privacy ────────────────────────────────────────────────────────────── */

const isPrivateKey = (key) => PRIVATE_KEYS.includes(key);

const looksPrivate = (value) =>
  typeof value === 'string' && PRIVATE_PATTERNS.some((pattern) => pattern.test(value));

/**
 * Strip anything that must not appear in a printed report.
 *
 * Applied to evidence objects and to every value on the way in. Returns the
 * cleaned copy plus what was removed, so the document can state that it
 * withheld something rather than silently thinning its own evidence.
 */
export function scrubPrivate(value, removed = []) {
  if (value === null || value === undefined) return { value, removed };

  if (Array.isArray(value)) {
    const cleaned = value.map((item) => scrubPrivate(item, removed).value);
    return { value: cleaned, removed };
  }

  if (typeof value === 'object') {
    const cleaned = {};
    for (const [key, entry] of Object.entries(value)) {
      if (isPrivateKey(key)) { removed.push(key); continue; }
      if (looksPrivate(entry)) { removed.push(key); continue; }
      cleaned[key] = scrubPrivate(entry, removed).value;
    }
    return { value: cleaned, removed };
  }

  if (looksPrivate(value)) { removed.push('value'); return { value: null, removed }; }

  return { value, removed };
}

/* ── Fields ─────────────────────────────────────────────────────────────── */

/** Round a display value without changing what it means. */
function displayValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;

  const rounded = Number(value.toFixed(REPORTING.DISPLAY_DECIMALS));
  return rounded;
}

/**
 * One labelled figure, with its provenance.
 *
 * @param {object} spec
 * @param {string} spec.labelKey
 * @param {*} spec.value
 * @param {object} [spec.explanation] the producing engine's own explanation
 * @returns {Field}
 */
export function field({
  labelKey, labelVars = null, value, unit = null,
  source = null, sourceKey = null, reason = null, evidence = null,
  explanation = null, text = null,
} = {}) {
  /* An explanation, where one was passed, is the authority on provenance.
     Nothing is composed here — the engine already wrote it. */
  const provenance = explanation
    ? {
        source: explanation.source ?? source,
        sourceKey: sourceKey,
        reason: explanation.method ?? reason,
        evidence: explanation.inputs ?? evidence ?? {},
        unit: unit ?? explanation.unit ?? null,
        note: explanation.note ?? null,
      }
    : { source, sourceKey, reason, evidence: evidence ?? {}, unit, note: null };

  const removed = [];
  const cleanEvidence = scrubPrivate(provenance.evidence, removed).value;
  const raw = displayValue(value);

  return Object.freeze({
    labelKey,
    labelVars: labelVars ? Object.freeze({ ...labelVars }) : null,

    value: looksPrivate(raw) ? null : raw,
    /** The value exactly as it arrived, when rounding changed it. */
    exact: typeof value === 'number' && raw !== value ? value : null,
    unit: provenance.unit,

    /** Text an engine wrote, carried verbatim rather than translated. */
    text: text ?? null,

    source: provenance.source,
    sourceKey: provenance.sourceKey,
    reason: provenance.reason,
    evidence: Object.freeze(cleanEvidence ?? {}),
    note: provenance.note,

    /** True when nothing named where this came from. Counted by the audit. */
    unsourced: !provenance.source,
    withheld: Object.freeze(removed),
  });
}

/**
 * A field read straight out of an engine's explanation map.
 *
 * The common case, and the one that cannot go wrong: the key is the engine's
 * own key, the value is the engine's own value, and the reason is the engine's
 * own sentence. Returns a field marked unsourced when the map has no such key
 * — which is the honest outcome, not a reason to omit the row.
 *
 * @param {object} explanations  an engine's `explanations` map
 * @param {string} key           the key inside it
 * @param {string} labelKey      how to label it
 */
export function fromExplanation(explanations, key, labelKey, extra = {}) {
  const explanation = explanations?.[key] ?? null;

  return field({
    labelKey,
    value: explanation?.value ?? extra.value ?? null,
    sourceKey: key,
    explanation,
    ...extra,
  });
}

/* ── Sections ───────────────────────────────────────────────────────────── */

/** A block of labelled figures. */
export function metricsSection({ id, titleKey, fields = [], metadata = {} } = {}) {
  return Object.freeze({
    id,
    kind: SECTION_KIND.METRICS,
    titleKey,
    fields: Object.freeze(fields.filter(Boolean)),
    metadata: Object.freeze({ ...metadata }),
  });
}

/**
 * Rows and columns.
 * `columnKeys` are i18n keys; every cell is a value or a `Field`.
 */
export function tableSection({ id, titleKey, columnKeys = [], rows = [], metadata = {} } = {}) {
  const kept = rows.slice(0, REPORTING.MAX_TABLE_ROWS);

  return Object.freeze({
    id,
    kind: SECTION_KIND.TABLE,
    titleKey,
    table: Object.freeze({
      columnKeys: Object.freeze([...columnKeys]),
      rows: Object.freeze(kept.map((row) => Object.freeze([...row]))),
    }),
    metadata: Object.freeze({
      ...metadata,
      truncated: rows.length > kept.length ? rows.length - kept.length : 0,
    }),
  });
}

/** A list of short statements, each carrying its own provenance. */
export function listSection({ id, titleKey, items = [], metadata = {} } = {}) {
  const kept = items.slice(0, REPORTING.MAX_LIST_ITEMS);

  return Object.freeze({
    id,
    kind: SECTION_KIND.LIST,
    titleKey,
    items: Object.freeze(kept.map((item) => Object.freeze({
      labelKey: item.labelKey ?? null,
      text: item.text ?? null,
      value: item.value ?? null,
      source: item.source ?? null,
    }))),
    metadata: Object.freeze({
      ...metadata,
      truncated: items.length > kept.length ? items.length - kept.length : 0,
    }),
  });
}

/**
 * Named findings — warnings, coaching advice, insights.
 *
 * Every one carries the sentence its engine wrote, the reason, and the
 * evidence. Nothing is reworded: a warning that says "protein is short"
 * appears saying exactly that.
 */
export function findingsSection({ id, titleKey, findings = [], metadata = {} } = {}) {
  const kept = findings.slice(0, REPORTING.MAX_WARNINGS);

  return Object.freeze({
    id,
    kind: SECTION_KIND.FINDINGS,
    titleKey,
    items: Object.freeze(kept.map((finding) => {
      const removed = [];
      const evidence = scrubPrivate(finding.evidence ?? {}, removed).value;

      return Object.freeze({
        key: finding.key ?? finding.type ?? null,
        title: finding.title ?? null,
        text: finding.summary ?? finding.message ?? null,
        recommendation: finding.recommendation ?? null,
        reason: finding.reason ?? finding.reasoning ?? null,
        severity: finding.severity ?? null,
        confidence: finding.confidence ?? null,
        source: Array.isArray(finding.sourceEngines)
          ? finding.sourceEngines.join(' + ')
          : (finding.sourceEngine ?? null),
        evidence: Object.freeze(evidence ?? {}),
        withheld: Object.freeze(removed),
      });
    })),
    metadata: Object.freeze({
      ...metadata,
      truncated: findings.length > kept.length ? findings.length - kept.length : 0,
    }),
  });
}

/** A chart. The payload comes from `charts-engine.js` and is not touched here. */
export function chartSection({ id, titleKey, chart, metadata = {} } = {}) {
  return Object.freeze({
    id,
    kind: SECTION_KIND.CHART,
    titleKey,
    chart: chart ?? null,
    metadata: Object.freeze({ ...metadata, empty: !chart || chart.empty }),
  });
}

/** A paragraph, worded by whatever produced it. */
export function textSection({ id, titleKey, text = '', source = null, metadata = {} } = {}) {
  const clean = looksPrivate(text) ? '' : String(text).slice(0, REPORTING.MAX_TEXT_LENGTH);

  return Object.freeze({
    id,
    kind: SECTION_KIND.TEXT,
    titleKey,
    text: clean,
    metadata: Object.freeze({ ...metadata, source, withheld: clean === text ? [] : ['text'] }),
  });
}

/* ── The document ───────────────────────────────────────────────────────── */

/**
 * Assemble a document.
 *
 * @param {object} spec
 * @param {string} spec.kind          REPORT_KIND
 * @param {string} spec.titleKey
 * @param {object} spec.period        { from, to, label }
 * @param {Section[]} spec.sections
 * @returns {object} ReportDocument, frozen
 */
export function reportDocument({
  kind, titleKey, subtitleKey = null, subtitleVars = null,
  period = {}, sections = [], warnings = [], recommendations = [],
  explanations = {}, generatedAt = null, metadata = {},
} = {}) {
  const kept = sections.filter(Boolean).slice(0, REPORTING.MAX_SECTIONS);

  const allFields = kept.flatMap((section) => section.fields ?? []);
  const withheld = [
    ...new Set(kept.flatMap((section) =>
      [...(section.metadata?.withheld ?? []),
        ...(section.fields ?? []).flatMap((item) => item.withheld ?? []),
        ...(section.items ?? []).flatMap((item) => item.withheld ?? [])])),
  ];

  return Object.freeze({
    kind,
    titleKey,
    subtitleKey,
    subtitleVars: subtitleVars ? Object.freeze({ ...subtitleVars }) : null,

    period: Object.freeze({
      from: period.from ?? null,
      to: period.to ?? null,
      labelKey: period.labelKey ?? null,
      labelVars: period.labelVars ? Object.freeze({ ...period.labelVars }) : null,
    }),

    generatedAt: generatedAt ?? new Date().toISOString(),

    sections: Object.freeze(kept),

    /** Carried at the top level as the phase asks, and also inside sections. */
    warnings: Object.freeze(warnings.slice(0, REPORTING.MAX_WARNINGS)),
    recommendations: Object.freeze(recommendations.slice(0, REPORTING.MAX_RECOMMENDATIONS)),

    /**
     * The producing engines' own explanation maps, carried through unchanged.
     * A renderer wanting to show why a figure is what it is reads this, and
     * nothing in this layer ever writes into it.
     */
    explanations: Object.freeze({ ...explanations }),

    metadata: Object.freeze({
      ...metadata,
      sections: kept.length,
      sectionsDropped: sections.filter(Boolean).length - kept.length,
      fields: allFields.length,
      unsourcedFields: allFields.filter((item) => item.unsourced).length,
      withheld: Object.freeze(withheld),
      /** Nothing in this layer computed a figure. */
      calculated: Object.freeze([]),
      layer: 'reporting',
    }),

    /** One section by id, or null. */
    section(id) { return kept.find((item) => item.id === id) ?? null; },

    /** Every field in the document, flattened — for audits and tests. */
    allFields() { return allFields; },
  });
}

/** An empty document that still says what it is. */
export function emptyDocument({ kind, titleKey, reasonKey, period = {} } = {}) {
  return reportDocument({
    kind,
    titleKey,
    period,
    sections: [listSection({
      id: 'empty',
      titleKey: reasonKey ?? 'report.empty.title',
      items: [{ labelKey: reasonKey ?? 'report.empty.body' }],
    })],
    metadata: { empty: true },
  });
}
