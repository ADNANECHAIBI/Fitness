/**
 * ListRow — one line in a list: a label, a value, optional detail, optionally
 * tappable.
 */
import { el, icon } from '../scripts/dom.js';

const CHEVRON = 'M9 6l6 6-6 6';

export function ListRow({
  label, value = '', detail = '', link = null, onClick = null,
  leading = null, trailing = null, tone = 'default',
} = {}) {
  const interactive = Boolean(link || onClick);

  return el(interactive ? 'button' : 'div', {
    className: `list-row list-row--${tone}${interactive ? ' is-tappable' : ''}`,
    type: interactive ? 'button' : null,
    dataset: link ? { link } : {},
    on: onClick ? { click: onClick } : {},
  }, [
    leading,
    el('div', { className: 'list-row__body' }, [
      el('span', { className: 'list-row__label', text: label }),
      detail && el('span', { className: 'list-row__detail', text: detail }),
    ]),
    value !== '' && value !== null && value !== undefined
      ? el('span', { className: 'list-row__value', text: String(value) })
      : null,
    trailing,
    interactive && !trailing
      ? el('span', { className: 'list-row__chevron' }, [icon(CHEVRON, { size: 16 })])
      : null,
  ]);
}

/** A titled group of rows. */
export function ListGroup({ title = '', rows = [], note = '' } = {}) {
  return el('section', { className: 'list-group' }, [
    // h2, not h3: a group often follows the page's h1 directly, and skipping
    // a heading level is disorienting for anyone navigating by headings.
    title && el('h2', { className: 'list-group__title eyebrow', text: title }),
    el('div', { className: 'list-group__rows' }, rows),
    note && el('p', { className: 'list-group__note', text: note }),
  ]);
}
