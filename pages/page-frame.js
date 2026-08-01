/**
 * page-frame.js — the frame every page shares.
 *
 * Keeps page modules down to their content: no page repeats the wrapper,
 * the lead paragraph or the section markup.
 *
 * @param {object} options
 * @param {string} [options.lead]      one sentence under the header
 * @param {Node[]} [options.children]
 * @param {boolean}[options.grid]      lay children out in the dashboard grid
 * @returns {HTMLElement}
 */
import { el } from '../scripts/dom.js';

export function PageFrame({ lead = '', children = [], grid = false } = {}) {
  return el('section', { className: 'page__inner' }, [
    lead && el('p', { className: 'page__lead', text: lead }),
    el('div', { className: grid ? 'grid' : 'stack' }, children),
  ]);
}

/**
 * A labelled row for read-only placeholder values.
 * @example Row('Height', '—')
 */
export function Row(label, value = '—') {
  return el('div', { className: 'row' }, [
    el('span', { className: 'row__label', text: label }),
    el('span', { className: 'row__value', text: value }),
  ]);
}

/** A titled group of rows. */
export function RowGroup(title, rows) {
  return el('div', { className: 'card group' }, [
    el('p', { className: 'eyebrow', text: title }),
    el('div', { className: 'group__rows' }, rows),
  ]);
}
