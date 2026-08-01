/**
 * StatCard — one number with its label. The unit is set in the data face so
 * digits line up across a row of cards.
 *
 * @param {object} options
 * @param {string} options.label
 * @param {string|number} [options.value]  pass '—' for an unknown value
 * @param {string} [options.unit]
 * @param {string} [options.hint]          small line under the number
 * @param {string} [options.link]          route path — makes the card tappable
 * @returns {HTMLElement}
 *
 * @example StatCard({ label: 'Weight', value: '—', unit: 'kg', link: '/progress' })
 */
import { el } from '../scripts/dom.js';

export function StatCard({
  label,
  value = '—',
  unit = '',
  hint = '',
  link = null,
} = {}) {
  const interactive = Boolean(link);

  return el(
    interactive ? 'button' : 'article',
    {
      className: `card stat${interactive ? ' card--tappable' : ''}`,
      type: interactive ? 'button' : null,
      dataset: link ? { link } : {},
    },
    [
      el('p', { className: 'eyebrow', text: label }),
      el('p', { className: 'stat__value' }, [
        String(value),
        unit && el('span', { className: 'stat__unit', text: unit }),
      ]),
      hint && el('p', { className: 'stat__hint', text: hint }),
    ]
  );
}
