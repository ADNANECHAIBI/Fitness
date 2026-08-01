/**
 * charts-engine.js — shapes for drawing, and nothing else.
 *
 * This file does not know what a kilogram is. It takes labels, numbers and a
 * unit string, and produces a `ChartData` payload that a renderer can draw.
 * The word "weight" does not appear in it, and if it ever does something has
 * gone wrong: a chart engine that knows about training is a chart engine that
 * will eventually be asked to decide what a good week looks like.
 *
 * **What it guards against.** Real series arrive broken in predictable ways,
 * and every one of them has to produce a chart rather than an exception:
 *
 *   empty                  → an empty chart that says it is empty
 *   null / undefined       → a gap, counted
 *   NaN / Infinity         → a gap, counted separately, because those mean
 *                            "a calculation went wrong upstream" rather than
 *                            "nothing was recorded"
 *   mismatched lengths     → truncated to the shortest, and the mismatch noted
 *   duplicate labels       → kept, both of them, with the duplication noted;
 *                            merging them would combine two different readings
 *   very large series      → truncated with a count, never downsampled
 *
 * **What it will not do.** It never interpolates, averages, extrapolates or
 * fills. A gap stays a gap: the whole point of this app is that a figure has a
 * source, and a value invented to make a line continuous has none. Downsampling
 * is refused for the same reason — the mean of five readings is a sixth number
 * nobody measured.
 *
 * Pure. No storage, no DOM, no clock.
 */

import { CHART_TYPE, REPORTING } from './constants.js';

/**
 * @typedef {object} Point
 * @property {number|null} value  null where the reading is missing or unusable
 *
 * @typedef {object} Series
 * @property {string} labelKey    an i18n key for the legend
 * @property {(number|null)[]} values
 * @property {object} quality     { gaps, invalid, points }
 *
 * @typedef {object} ChartData
 * @property {string} type        CHART_TYPE
 * @property {string} titleKey
 * @property {string[]} labels
 * @property {Series[]} series
 * @property {string|null} unit
 * @property {boolean} empty
 * @property {object} range       { min, max } across every series, or nulls
 * @property {object} quality     what was wrong with the input
 * @property {string[]} notes     what was done about it, as keys
 */

/**
 * Is this a number a chart can plot?
 *
 * `NaN` and the infinities are separated from `null` on purpose. A null is a
 * reading that was never taken; a NaN is a division that went wrong two layers
 * up. Both become gaps, but only one of them is a bug, and a chart that
 * reported them identically would hide it.
 */
function classify(value) {
  if (value === null || value === undefined || value === '') return 'missing';
  const number = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(number)) return 'invalid';
  if (!Number.isFinite(number)) return 'invalid';
  return 'ok';
}

/** Clean one series without inventing anything. */
function cleanSeries(values, note) {
  const cleaned = [];
  let gaps = 0;
  let invalid = 0;

  for (const value of values ?? []) {
    const kind = classify(value);
    if (kind === 'ok') { cleaned.push(Number(value)); continue; }
    if (kind === 'invalid') invalid += 1; else gaps += 1;
    cleaned.push(null);
  }

  if (cleaned.length > REPORTING.MAX_CHART_POINTS) {
    note(`chart.note.truncated:${cleaned.length - REPORTING.MAX_CHART_POINTS}`);
    cleaned.length = REPORTING.MAX_CHART_POINTS;
  }

  return {
    values: cleaned,
    quality: { points: cleaned.length, gaps, invalid, plotted: cleaned.filter((v) => v !== null).length },
  };
}

/**
 * Build a chart payload.
 *
 * @param {object} spec
 * @param {string} spec.type
 * @param {string} spec.titleKey
 * @param {string[]} spec.labels
 * @param {{labelKey: string, values: (number|null)[]}[]} spec.series
 * @param {string} [spec.unit]
 * @returns {ChartData} frozen
 */
export function chartData({ type = CHART_TYPE.LINE, titleKey, labels = [], series = [], unit = null } = {}) {
  const notes = [];
  const note = (key) => { if (!notes.includes(key)) notes.push(key); };

  if (!Object.values(CHART_TYPE).includes(type)) {
    note(`chart.note.unknownType:${type}`);
    type = CHART_TYPE.LINE;
  }

  /* Labels first: they decide how long every series is allowed to be. A
     series longer than its labels has points nobody can identify. */
  let cleanLabels = (labels ?? []).map((label) =>
    label === null || label === undefined ? '' : String(label));

  if (cleanLabels.length > REPORTING.MAX_CHART_POINTS) {
    note(`chart.note.truncated:${cleanLabels.length - REPORTING.MAX_CHART_POINTS}`);
    cleanLabels = cleanLabels.slice(0, REPORTING.MAX_CHART_POINTS);
  }

  const duplicates = cleanLabels.length - new Set(cleanLabels).size;
  if (duplicates > 0) note(`chart.note.duplicateLabels:${duplicates}`);

  const kept = (series ?? []).filter((entry) => entry && Array.isArray(entry.values));
  if ((series ?? []).length !== kept.length) {
    note(`chart.note.seriesDropped:${(series ?? []).length - kept.length}`);
  }

  const limited = kept.slice(0, REPORTING.MAX_CHART_SERIES);
  if (kept.length > limited.length) {
    note(`chart.note.seriesDropped:${kept.length - limited.length}`);
  }

  const built = limited.map((entry) => {
    const { values, quality } = cleanSeries(entry.values, note);

    /* Length mismatches are truncated to the labels, never padded: a padded
       series would place a reading against a date that has none. */
    if (values.length !== cleanLabels.length) {
      note(`chart.note.lengthMismatch:${Math.abs(values.length - cleanLabels.length)}`);
    }

    const aligned = values.slice(0, cleanLabels.length);
    while (aligned.length < cleanLabels.length) aligned.push(null);

    if (quality.invalid > 0) note(`chart.note.invalidValues:${quality.invalid}`);
    if (quality.gaps > 0) note(`chart.note.gaps:${quality.gaps}`);

    return Object.freeze({
      labelKey: entry.labelKey ?? 'chart.series.unnamed',
      values: Object.freeze(aligned),
      quality: Object.freeze({ ...quality, plotted: aligned.filter((v) => v !== null).length }),
    });
  });

  const plotted = built.flatMap((entry) => entry.values).filter((value) => value !== null);
  const empty = cleanLabels.length === 0 || plotted.length === 0;

  if (empty) note('chart.note.empty');

  return Object.freeze({
    type,
    titleKey: titleKey ?? 'chart.untitled',
    labels: Object.freeze(cleanLabels),
    series: Object.freeze(built),
    unit,

    empty,

    range: Object.freeze({
      min: plotted.length ? Math.min(...plotted) : null,
      max: plotted.length ? Math.max(...plotted) : null,
    }),

    quality: Object.freeze({
      labels: cleanLabels.length,
      series: built.length,
      points: built.flatMap((entry) => entry.values).length,
      plotted: plotted.length,
      gaps: built.flatMap((entry) => Array(entry.quality.gaps).fill(0)).length,
      invalid: built.flatMap((entry) => Array(entry.quality.invalid).fill(0)).length,
      duplicateLabels: duplicates,
    }),

    /** What was done about bad input, as i18n keys with counts appended. */
    notes: Object.freeze(notes),

    /** Nothing here was computed from anything. */
    derived: false,
  });
}

/* ── The five shapes ────────────────────────────────────────────────────────
   Each is `chartData` with a type pre-set. They exist so a caller names a
   shape rather than a string, and so the type vocabulary has one home.      */

const of = (type) => (spec) => chartData({ ...spec, type });

export const lineChart = of(CHART_TYPE.LINE);
export const barChart = of(CHART_TYPE.BAR);
export const areaChart = of(CHART_TYPE.AREA);

/**
 * A progress chart: where something is between a start and a goal.
 *
 * The percentage is **not** computed here — it is passed in, because the body
 * engine already decided what progress toward a goal means and this layer
 * refuses to hold a second opinion. What this adds is the shape: one bar, a
 * floor and a ceiling.
 */
export function progressChart({ titleKey, labelKey, percent, from = null, to = null, current = null, unit = null } = {}) {
  return Object.freeze({
    ...chartData({
      type: CHART_TYPE.PROGRESS,
      titleKey,
      labels: [labelKey ?? 'chart.progress.label'],
      series: [{ labelKey: labelKey ?? 'chart.progress.label', values: [percent] }],
      unit: unit ?? '%',
    }),
    bounds: Object.freeze({ from, to, current }),
  });
}

/**
 * A comparison: the same measure across two or more named groups.
 * One series per group, one label per measure.
 */
export function comparisonChart({ titleKey, labels = [], groups = [], unit = null } = {}) {
  return chartData({
    type: CHART_TYPE.COMPARISON,
    titleKey,
    labels,
    series: groups.map((group) => ({ labelKey: group.labelKey, values: group.values })),
    unit,
  });
}

/**
 * A chart built from a series of weekly figures, given a reader.
 *
 * The reader is passed in, which is what keeps this generic: the caller knows
 * that `week.adherence.overall` is a percentage, and this file only knows that
 * something returned a number or did not.
 *
 * @param {object[]} rows      any objects, in display order
 * @param {Function} readLabel row → label
 * @param {Function} readValue row → number | null
 */
export function seriesFrom(rows = [], readLabel, readValue) {
  return {
    labels: rows.map((row) => readLabel(row)),
    values: rows.map((row) => {
      try { return readValue(row); } catch { return null; }
    }),
  };
}

export const ChartsEngine = Object.freeze({
  chartData,
  line: lineChart,
  bar: barChart,
  area: areaChart,
  progress: progressChart,
  comparison: comparisonChart,
  seriesFrom,
  TYPE: CHART_TYPE,
});
