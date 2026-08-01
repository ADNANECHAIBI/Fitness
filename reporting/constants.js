/**
 * reporting/constants.js — the presentation layer's own numbers.
 *
 * Every other layer in this app reads `engines/constants.js`, which the
 * architecture test exempts as cross-cutting configuration. This layer does
 * not, and the reason is worth stating: phase 22's whole constraint is that
 * nothing here may produce a figure. Importing the file that holds every
 * physiological threshold in the app would make that constraint a matter of
 * discipline rather than of structure, and the exemption would have to be
 * argued about every time someone added a rule to the audit.
 *
 * So the caps live here instead. Note what they are: page sizes, list lengths,
 * chart point limits, the section vocabulary. Not one of them is a threshold
 * anything is compared against. There is no physiology in this file and there
 * cannot be.
 */

/** What a section of a document can be. */
export const SECTION_KIND = Object.freeze({
  /** A short block of labelled figures. */
  METRICS: 'metrics',
  /** Rows and columns. */
  TABLE: 'table',
  /** An ordered or unordered list of statements. */
  LIST: 'list',
  /** A ChartData payload. */
  CHART: 'chart',
  /** A paragraph, already worded by whatever produced it. */
  TEXT: 'text',
  /** Named findings with a reason attached — warnings, advice, insights. */
  FINDINGS: 'findings',
});

/** What a chart can be. The renderer knows these; it knows nothing else. */
export const CHART_TYPE = Object.freeze({
  LINE: 'line',
  BAR: 'bar',
  AREA: 'area',
  PROGRESS: 'progress',
  COMPARISON: 'comparison',
});

/** What a document is about. Used for titles and for nothing else. */
export const REPORT_KIND = Object.freeze({
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  PROGRESS: 'progress',
});

export const REPORTING = Object.freeze({
  /**
   * Points a single chart will carry. Beyond this the series is truncated and
   * the truncation is reported — never downsampled, because averaging points
   * together would invent readings that were never taken.
   */
  MAX_CHART_POINTS: 400,

  /** Series in one chart, before the rest are dropped with a note. */
  MAX_CHART_SERIES: 8,

  /** Rows a table carries before it is truncated with a note. */
  MAX_TABLE_ROWS: 200,

  /** Items in a list section. */
  MAX_LIST_ITEMS: 20,

  /** Findings of each kind a document carries. */
  MAX_WARNINGS: 10,
  MAX_RECOMMENDATIONS: 10,
  MAX_INSIGHTS: 10,

  /** Sections in one document, as a runaway guard rather than a design limit. */
  MAX_SECTIONS: 40,

  /** Characters a single text block carries. */
  MAX_TEXT_LENGTH: 4000,

  /** Decimal places a figure is shown to when it arrives with more. */
  DISPLAY_DECIMALS: 2,
});

/**
 * Keys never written into a document, whatever the source object holds.
 *
 * A report is a thing people email to a coach or print at a clinic. Record
 * ids, timestamps and anything that identifies a person do not belong in one,
 * and the scrub is applied to every field on the way in rather than trusted to
 * whoever builds a section.
 */
export const PRIVATE_KEYS = Object.freeze([
  'id', 'ids', 'recordId', 'sessionId', 'reportId', 'storedId', 'planId',
  'email', 'phone', 'phoneNumber', 'address', 'name', 'fullName', 'username',
  'createdAt', 'updatedAt', 'deletedAt',
  'token', 'secret', 'password', 'apiKey',
  'debug', 'stack', 'trace', 'raw',
]);

/** Values that look like contact details, blocked wherever they appear. */
export const PRIVATE_PATTERNS = Object.freeze([
  /[\w.+-]+@[\w-]+\.[\w.]+/,                    // an email address
  /\+?\d[\d\s().-]{7,}\d/,                      // a phone number
]);

/**
 * Writing directions this layer can honestly claim.
 *
 * `html` is true for both because a printable document sets `dir` and the
 * browser does the rest. `pdf` is true for neither, and the reason is in
 * `pdf-renderer.js`: real PDF output here goes through the browser's own print
 * pipeline, and the structural renderer used in tests produces no glyphs at
 * all. Claiming RTL PDF support would be claiming something untested.
 */
export const DIRECTION_SUPPORT = Object.freeze({
  ltr: Object.freeze({ html: true, print: true, pdf: 'via-browser-print' }),
  rtl: Object.freeze({ html: true, print: true, pdf: 'via-browser-print' }),
});
