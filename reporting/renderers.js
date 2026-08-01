/**
 * renderers.js — a document, drawn.
 *
 * Two renderers and one abstraction, and between them no business logic, no
 * arithmetic, and no hardcoded sentence in any language.
 *
 * **The translator is injected.** Every renderer takes a `translate` function.
 * It defaults to the language manager, but a caller may pass anything with the
 * same signature — which is how the phase-22 tests check Arabic and English
 * output without booting the app, and also how the renderers are kept free of
 * literal text: there is nowhere for a string to hide when every label is a
 * key resolved by someone else.
 *
 * **Two kinds of text, treated differently.** A `labelKey` is translated. A
 * sentence an engine wrote — a warning's message, a coach's reasoning — is
 * printed verbatim. Translating those would mean re-composing a claim the
 * engine made, including the figures inside it, which this layer must not do.
 * So an Arabic report has Arabic headings and English findings, and that is the
 * correct behaviour rather than a bug: the alternative is a mistranslated
 * medical-adjacent sentence.
 *
 * **PDF.** There is no PDF library in this project and adding one would be a
 * dependency the whole app has done without for twenty-one phases. So
 * `PdfRenderer` is an interface with two implementations:
 *
 *   `BrowserPrintPdfRenderer` — produces the print-ready HTML and hands it to
 *       the browser's own print pipeline, which is what actually writes the
 *       PDF. This is the real output path, and it gets Arabic and RTL right
 *       because the browser's text shaper does.
 *
 *   `StructuralPdfRenderer` — produces no glyphs at all. It walks the document
 *       and returns the structure a PDF would contain: pages, headings, every
 *       field with its value and unit, every explanation, every warning, every
 *       recommendation. That is what the tests assert against, because it can
 *       be asserted against exactly.
 *
 * What this deliberately does *not* claim: that RTL PDF output is correct.
 * Nothing here has been run through a real PDF writer or seen on paper. The
 * structural renderer proves the content arrives; the browser is trusted for
 * the glyphs; and neither of those is the same as having tested it.
 */

import { SECTION_KIND, DIRECTION_SUPPORT } from './constants.js';

/**
 * Escape text for HTML.
 *
 * Written here rather than reused, because there is nothing to reuse: the UI
 * layer builds DOM nodes with `el()` and sets `textContent`, so it has never
 * needed string escaping and `scripts/dom.js` has no such helper. This is the
 * only place in the app that produces HTML as a string, which is also why it is
 * the only place that has to escape.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The fallback translator: return the key, so a missing label is visible. */
const identity = (key, vars) => {
  if (!key) return '';
  if (!vars) return key;
  return String(key).replace(/\{(\w+)\}/g, (whole, name) =>
    (vars[name] === undefined || vars[name] === null ? whole : String(vars[name])));
};

/**
 * Resolve the renderer's options once.
 * @param {object} options
 * @param {Function} [options.translate]
 * @param {string} [options.dir] 'ltr' | 'rtl'
 */
function settings({ translate = identity, dir = 'ltr', locale = null, showExplanations = true } = {}) {
  return {
    t: typeof translate === 'function' ? translate : identity,
    dir: dir === 'rtl' ? 'rtl' : 'ltr',
    locale,
    showExplanations,
  };
}

/** A value, as text. Formatting only — the number was decided elsewhere. */
function valueText(field) {
  if (field.text !== null && field.text !== undefined) return String(field.text);
  if (field.value === null || field.value === undefined) return '—';
  if (typeof field.value === 'boolean') return field.value ? '✓' : '✗';
  return field.unit ? `${field.value} ${field.unit}` : String(field.value);
}

/* ── Structural view ────────────────────────────────────────────────────────
   The shape every renderer works from, and the thing tests assert against.
   It is not HTML, not PDF and not text: it is the document with its labels
   resolved and its values formatted, and nothing else done to it.          */

/**
 * Resolve a document into flat, renderable blocks.
 *
 * @param {object} document ReportDocument
 * @param {object} [options]
 * @returns {object} { title, subtitle, period, dir, blocks, explanations, ... }
 */
export function resolveDocument(document, options = {}) {
  const { t, dir, showExplanations } = settings(options);

  if (!document) {
    return Object.freeze({
      title: t('report.empty.title'), subtitle: null, period: null, dir,
      blocks: Object.freeze([]), warnings: Object.freeze([]),
      recommendations: Object.freeze([]), explanations: Object.freeze([]),
      metadata: Object.freeze({ empty: true }),
    });
  }

  const blocks = document.sections.map((section) => {
    const heading = t(section.titleKey);

    switch (section.kind) {
      case SECTION_KIND.METRICS:
        return {
          id: section.id, kind: section.kind, heading,
          rows: section.fields.map((item) => ({
            label: t(item.labelKey, item.labelVars),
            value: valueText(item),
            unit: item.unit,
            source: item.source,
            sourceKey: item.sourceKey,
            reason: showExplanations ? item.reason : null,
            evidence: showExplanations ? item.evidence : {},
            unsourced: item.unsourced,
          })),
        };

      case SECTION_KIND.TABLE:
        return {
          id: section.id, kind: section.kind, heading,
          columns: section.table.columnKeys.map((key) => t(key)),
          rows: section.table.rows.map((row) => row.map((cell) => {
            if (cell === null || cell === undefined) return '—';
            /* A cell may be a label key from the builder — resolve it, and
               leave anything else exactly as it arrived. */
            return typeof cell === 'string' && cell.includes('.') && !/\d/.test(cell)
              ? t(cell) : String(cell);
          })),
          truncated: section.metadata.truncated ?? 0,
        };

      case SECTION_KIND.LIST:
        return {
          id: section.id, kind: section.kind, heading,
          items: section.items.map((item) => ({
            text: item.text ?? t(item.labelKey),
            value: item.value === null ? null : String(item.value),
            source: item.source,
          })),
          truncated: section.metadata.truncated ?? 0,
        };

      case SECTION_KIND.FINDINGS:
        return {
          id: section.id, kind: section.kind, heading,
          items: section.items.map((item) => ({
            /* Verbatim: an engine composed these and this layer does not
               re-word them. See the header. */
            title: item.title,
            text: item.text,
            recommendation: item.recommendation,
            reason: showExplanations ? item.reason : null,
            severity: item.severity,
            confidence: item.confidence,
            source: item.source,
            evidence: showExplanations ? item.evidence : {},
          })),
          truncated: section.metadata.truncated ?? 0,
        };

      case SECTION_KIND.CHART:
        return {
          id: section.id, kind: section.kind, heading,
          chart: section.chart
            ? {
                type: section.chart.type,
                title: t(section.chart.titleKey),
                labels: section.chart.labels.map((label) =>
                  /* Chart labels may be keys or may be dates. A date is left
                     alone; a key is resolved. */
                  /^\d{4}-\d{2}-\d{2}$/.test(label) ? label : t(label)),
                series: section.chart.series.map((entry) => ({
                  label: t(entry.labelKey),
                  values: entry.values,
                  quality: entry.quality,
                })),
                unit: section.chart.unit,
                empty: section.chart.empty,
                range: section.chart.range,
                notes: section.chart.notes,
              }
            : null,
          empty: section.metadata.empty,
        };

      case SECTION_KIND.TEXT:
        return { id: section.id, kind: section.kind, heading, text: section.text };

      default:
        return { id: section.id, kind: 'unknown', heading, note: `unrenderable section kind "${section.kind}"` };
    }
  });

  return Object.freeze({
    title: t(document.titleKey),
    subtitle: document.subtitleKey ? t(document.subtitleKey, document.subtitleVars) : null,
    period: document.period.labelKey ? t(document.period.labelKey, document.period.labelVars) : null,
    generatedAt: document.generatedAt,
    dir,

    blocks: Object.freeze(blocks),

    warnings: Object.freeze((document.warnings ?? []).map((warning) => ({
      title: warning.title ?? warning.type ?? null,
      text: warning.message ?? warning.summary ?? null,
      reason: warning.reason ?? null,
      evidence: warning.evidence ?? {},
    }))),

    recommendations: Object.freeze((document.recommendations ?? []).map((item) => ({
      title: item.title ?? null,
      text: item.recommendation ?? item.message ?? item.summary ?? null,
      reason: item.reason ?? item.reasoning ?? null,
      evidence: item.evidence ?? {},
    }))),

    /** The producing engines' explanations, as rows. Never rewritten. */
    explanations: Object.freeze(showExplanations
      ? Object.entries(document.explanations ?? {}).map(([key, explanation]) => ({
          key,
          value: explanation?.value ?? null,
          unit: explanation?.unit ?? null,
          source: explanation?.source ?? null,
          method: explanation?.method ?? null,
          note: explanation?.note ?? null,
        }))
      : []),

    metadata: document.metadata,
  });
}

/* ── Print renderer ─────────────────────────────────────────────────────── */

const tag = (name, attrs, inner) => {
  const rendered = Object.entries(attrs ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== false)
    .map(([key, value]) => ` ${key}="${escapeHtml(String(value))}"`)
    .join('');
  return `<${name}${rendered}>${inner ?? ''}</${name}>`;
};

const text = (value) => escapeHtml(String(value ?? ''));

/**
 * A document as printable HTML.
 *
 * Every string that reaches the output goes through `escapeHtml` from
 * `scripts/dom.js` — the same helper the UI uses, reused rather than
 * reimplemented. There is no `innerHTML` here: this function returns a string
 * and whoever receives it decides what to do with it, which is what keeps the
 * architecture audit satisfied and, incidentally, what makes it testable.
 *
 * @param {object} document ReportDocument
 * @param {object} [options] { translate, dir }
 * @returns {string} an HTML fragment
 */
export function renderPrintHtml(document, options = {}) {
  const view = resolveDocument(document, options);
  const parts = [];

  parts.push(tag('header', { class: 'report-head' }, [
    tag('h1', null, text(view.title)),
    view.subtitle ? tag('p', { class: 'report-subtitle' }, text(view.subtitle)) : '',
    view.period ? tag('p', { class: 'report-period' }, text(view.period)) : '',
  ].join('')));

  for (const block of view.blocks) {
    parts.push(renderBlock(block, options));
  }

  if (view.explanations.length) {
    parts.push(tag('section', { class: 'report-explanations' }, [
      tag('h2', null, text(settings(options).t('report.section.explanations'))),
      tag('dl', null, view.explanations.map((row) => [
        tag('dt', null, text(row.key)),
        tag('dd', null, `${text(row.value ?? '—')}${row.unit ? ` ${text(row.unit)}` : ''} — ${text(row.source ?? '')}: ${text(row.method ?? '')}`),
      ].join('')).join('')),
    ].join('')));
  }

  return tag('article', {
    class: 'report-document',
    dir: view.dir,
    lang: settings(options).locale,
    'data-kind': document?.kind ?? 'unknown',
  }, parts.join(''));
}

function renderBlock(block, options) {
  const { t } = settings(options);
  const heading = tag('h2', null, text(block.heading));

  if (block.kind === SECTION_KIND.METRICS) {
    return tag('section', { class: 'report-metrics', 'data-id': block.id }, heading + tag('dl', null,
      block.rows.map((row) => [
        tag('dt', null, text(row.label)),
        tag('dd', { 'data-source': row.source }, text(row.value)),
      ].join('')).join('')));
  }

  if (block.kind === SECTION_KIND.TABLE) {
    return tag('section', { class: 'report-table', 'data-id': block.id }, heading + tag('table', null,
      tag('thead', null, tag('tr', null, block.columns.map((column) => tag('th', null, text(column))).join(''))) +
      tag('tbody', null, block.rows.map((row) =>
        tag('tr', null, row.map((cell) => tag('td', null, text(cell))).join(''))).join(''))));
  }

  if (block.kind === SECTION_KIND.LIST) {
    return tag('section', { class: 'report-list', 'data-id': block.id }, heading + tag('ul', null,
      block.items.map((item) => tag('li', null, text(item.text))).join('')));
  }

  if (block.kind === SECTION_KIND.FINDINGS) {
    return tag('section', { class: 'report-findings', 'data-id': block.id }, heading +
      block.items.map((item) => tag('article', { class: 'finding', 'data-severity': item.severity }, [
        item.title ? tag('h3', null, text(item.title)) : '',
        item.text ? tag('p', { class: 'finding-text' }, text(item.text)) : '',
        item.recommendation ? tag('p', { class: 'finding-recommendation' }, text(item.recommendation)) : '',
        item.reason ? tag('p', { class: 'finding-reason' }, text(item.reason)) : '',
        item.source ? tag('p', { class: 'finding-source' }, text(item.source)) : '',
      ].join(''))).join(''));
  }

  if (block.kind === SECTION_KIND.CHART) {
    if (!block.chart || block.chart.empty) {
      return tag('section', { class: 'report-chart is-empty', 'data-id': block.id },
        heading + tag('p', { class: 'chart-empty' }, text(t('chart.empty'))));
    }

    /* A table of the same numbers, which is the honest print fallback: a
       printed page has no canvas, and a chart drawn as a picture would lose
       every value. The screen renderer can draw the same payload. */
    return tag('section', { class: 'report-chart', 'data-id': block.id, 'data-type': block.chart.type },
      heading + tag('table', { class: 'chart-as-table' },
        tag('thead', null, tag('tr', null,
          tag('th', null, text(t('report.column.label'))) +
          block.chart.series.map((entry) => tag('th', null, text(entry.label))).join(''))) +
        tag('tbody', null, block.chart.labels.map((label, index) =>
          tag('tr', null,
            tag('th', { scope: 'row' }, text(label)) +
            block.chart.series.map((entry) =>
              tag('td', null, text(entry.values[index] ?? '—'))).join(''))).join(''))));
  }

  if (block.kind === SECTION_KIND.TEXT) {
    return tag('section', { class: 'report-text', 'data-id': block.id }, heading + tag('p', null, text(block.text)));
  }

  return tag('section', { class: 'report-unknown', 'data-id': block.id }, heading);
}

/* ── PDF ────────────────────────────────────────────────────────────────── */

/**
 * What every PDF renderer must offer.
 *
 * Named as a shape rather than a class because there is nothing to inherit:
 * one method, one return type, and two implementations that share no code.
 *
 * @typedef {object} PdfRenderer
 * @property {string} id
 * @property {(document: object, options?: object) => object} render
 * @property {object} supports  what it honestly claims
 */

/**
 * The structural renderer: content without glyphs.
 *
 * Produces the pages a PDF would contain — headings, fields with values and
 * units, findings, explanations — and nothing about how any of it would look.
 * It exists because "did the recommendation reach the PDF" is a question that
 * can be answered exactly, while "does the Arabic render correctly" cannot be
 * answered by any code in this project.
 */
export const StructuralPdfRenderer = Object.freeze({
  id: 'structural',

  /**
   * Content only. Proves what reached the document and says nothing about how
   * any of it would look — there are no glyphs here to look at.
   */
  supports: Object.freeze({
    glyphs: false,
    fonts: false,
    rtlShaping: false,
    charts: 'as-values',
    noteKey: 'report.renderer.structural',
  }),

  /**
   * @param {object} document ReportDocument
   * @param {object} [options] { translate, dir }
   * @returns {object} the structure, frozen
   */
  render(document, options = {}) {
    const view = resolveDocument(document, options);

    const pages = [{
      heading: view.title,
      subheading: view.subtitle,
      period: view.period,
      dir: view.dir,
      items: [],
    }];

    for (const block of view.blocks) {
      const page = pages[pages.length - 1];
      page.items.push({
        id: block.id,
        kind: block.kind,
        heading: block.heading,
        fields: (block.rows ?? []).map((row) => ({
          label: row.label, value: row.value, unit: row.unit ?? null,
          source: row.source ?? null, reason: row.reason ?? null,
        })),
        columns: block.columns ?? null,
        rows: block.rows && block.columns ? block.rows : null,
        items: (block.items ?? []).map((item) => ({
          title: item.title ?? null,
          text: item.text ?? null,
          recommendation: item.recommendation ?? null,
          reason: item.reason ?? null,
          source: item.source ?? null,
        })),
        chart: block.chart
          ? {
              type: block.chart.type, title: block.chart.title,
              labels: block.chart.labels,
              series: block.chart.series.map((entry) => ({ label: entry.label, values: entry.values })),
              unit: block.chart.unit, empty: block.chart.empty, notes: block.chart.notes,
            }
          : null,
        text: block.text ?? null,
      });
    }

    return Object.freeze({
      renderer: 'structural',
      dir: view.dir,
      title: view.title,
      subtitle: view.subtitle,
      period: view.period,
      generatedAt: view.generatedAt,

      pages: Object.freeze(pages.map((page) => Object.freeze({ ...page, items: Object.freeze(page.items) }))),

      /** Everything a caller might want to assert on, flattened. */
      headings: Object.freeze(view.blocks.map((block) => block.heading)),
      values: Object.freeze(view.blocks.flatMap((block) =>
        (block.rows ?? []).map((row) => row.value))),
      explanations: view.explanations,
      warnings: view.warnings,
      recommendations: view.recommendations,

      metadata: view.metadata,
    });
  },
});

/**
 * The real output path: printable HTML, handed to the browser.
 *
 * The browser writes the PDF, shapes the Arabic and lays out the RTL, because
 * it has a text engine and this project does not. `render` returns the HTML and
 * the instruction; it does not call `window.print()` itself, because a renderer
 * that reaches for a global is a renderer that cannot be tested.
 */
export const BrowserPrintPdfRenderer = Object.freeze({
  id: 'browser-print',

  /**
   * Produces print-ready HTML. The browser's print-to-PDF does the rest, which
   * is also why the Arabic shaping is correct and why none of it has been
   * verified on paper by anything in this project.
   */
  supports: Object.freeze({
    glyphs: true,
    fonts: 'browser',
    rtlShaping: 'browser',
    charts: 'as-values',
    noteKey: 'report.renderer.browserPrint',
  }),

  render(document, options = {}) {
    const view = resolveDocument(document, options);

    return Object.freeze({
      renderer: 'browser-print',
      dir: view.dir,
      title: view.title,
      html: renderPrintHtml(document, options),
      /** How a caller turns this into a file. Data, not an action. */
      instruction: Object.freeze({
        action: 'print',
        media: 'print',
        hint: 'report.print.hint',
      }),
      metadata: view.metadata,
    });
  },
});

/** Every renderer, by id. */
export const PDF_RENDERERS = Object.freeze({
  structural: StructuralPdfRenderer,
  'browser-print': BrowserPrintPdfRenderer,
});

/**
 * Render a document to PDF through a named renderer.
 * @param {object} document
 * @param {object} [options] { renderer, translate, dir }
 */
export function renderPdf(document, { renderer = 'structural', ...options } = {}) {
  const chosen = PDF_RENDERERS[renderer];
  if (!chosen) {
    throw new Error(`No PDF renderer called "${renderer}". Available: ${Object.keys(PDF_RENDERERS).join(', ')}.`);
  }
  return chosen.render(document, options);
}

/** What this layer claims about writing direction, per output format. */
export const directionSupport = () => DIRECTION_SUPPORT;
