/**
 * Card — the base surface of the app.
 *
 * Every component is a factory: it takes a plain options object and returns a
 * detached HTMLElement. No shared state, no lifecycle, no registration.
 *
 * @param {object}  [options]
 * @param {string}  [options.eyebrow]  small uppercase label above the title
 * @param {string}  [options.title]
 * @param {string}  [options.body]     supporting line, usually an empty state
 * @param {'default'|'hero'|'wide'} [options.variant]
 * @param {string}  [options.link]     route path — makes the whole card tappable
 * @param {Node[]}  [options.children] extra content appended inside
 * @returns {HTMLElement}
 *
 * @example
 * Card({ eyebrow: 'Today', title: 'Gym', body: 'No sessions yet.', link: '/gym' })
 */
import { el } from '../scripts/dom.js';

export function Card({
  eyebrow = '',
  title = '',
  body = '',
  variant = 'default',
  link = null,
  children = [],
} = {}) {
  const interactive = Boolean(link);

  return el(
    interactive ? 'button' : 'article',
    {
      className: [
        'card',
        variant !== 'default' && `card--${variant}`,
        interactive && 'card--tappable',
      ].filter(Boolean).join(' '),
      type: interactive ? 'button' : null,
      dataset: link ? { link } : {},
    },
    [
      eyebrow && el('p', { className: 'eyebrow', text: eyebrow }),
      title && el('h2', { className: 'card__title', text: title }),
      body && el('p', { className: 'card__empty', text: body }),
      ...children,
    ]
  );
}
