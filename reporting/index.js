/**
 * reporting/index.js — the presentation layer's public surface.
 *
 * Six files, one direction of dependency, and one rule that makes the rest of
 * the layer's guarantees structural rather than aspirational: **nothing in here
 * imports anything that could produce a figure.** Not engines, not rules, not
 * models, not repositories, not services — not even `engines/constants.js`,
 * which every other layer is allowed to read.
 *
 *   constants.js        page caps, section and chart vocabularies, the privacy
 *                       blocklist. No physiology, by construction.
 *   report-document.js  what a document is; the privacy scrub; field
 *                       provenance copied from producing engines' explanations.
 *   charts-engine.js    generic shapes. Does not know what a kilogram is.
 *   documents.js        the three builders: weekly, monthly, progress.
 *   renderers.js        printable HTML, and the PdfRenderer abstraction.
 *
 * The builders are pure functions of their arguments and import nothing from
 * `app/`. That is what keeps the dependency one-directional —
 * `app/reporting-service.js` gathers and calls down — and it is why every
 * document in this layer can be built in a test without storage or a cache.
 */

export {
  SECTION_KIND, CHART_TYPE, REPORT_KIND, REPORTING,
  PRIVATE_KEYS, PRIVATE_PATTERNS, DIRECTION_SUPPORT,
} from './constants.js';

export {
  reportDocument, emptyDocument, field, fromExplanation, scrubPrivate,
  metricsSection, tableSection, listSection, findingsSection, chartSection, textSection,
} from './report-document.js';

export {
  ChartsEngine, chartData, lineChart, barChart, areaChart,
  progressChart, comparisonChart, seriesFrom,
} from './charts-engine.js';

export {
  weeklyReportDocument, monthlyReportDocument, progressReportDocument,
} from './documents.js';

export {
  resolveDocument, renderPrintHtml, renderPdf,
  StructuralPdfRenderer, BrowserPrintPdfRenderer, PDF_RENDERERS, directionSupport,
} from './renderers.js';
