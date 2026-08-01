/**
 * ProgressBar — a filled track. Presentation only: it is given a percentage,
 * it does not work one out.
 */
import { el } from '../scripts/dom.js';
import { T } from '../scripts/language.js';

/**
 * @param {{value, label, detail, tone}} options  value is 0–100
 */
export function ProgressBar({ value = 0, label = '', detail = '', tone = 'default' } = {}) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));

  return el('div', { className: `bar bar--${tone}` }, [
    (label || detail) && el('div', { className: 'bar__head' }, [
      label && el('span', { className: 'bar__label', text: label }),
      detail && el('span', { className: 'bar__detail', text: detail }),
    ]),
    el('div', {
      className: 'bar__track',
      role: 'progressbar',
      'aria-valuenow': String(Math.round(percent)),
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-label': label || T('ui.a11y.progress'),
    }, [
      el('div', { className: 'bar__fill', style: { width: `${percent}%` } }),
    ]),
  ]);
}
