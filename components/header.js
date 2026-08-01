/**
 * Header — the sticky top bar.
 *
 * Rendered once at boot; the router calls setTitle() on every navigation, so
 * the heading always matches the page on screen.
 *
 * @returns {HTMLElement & { setTitle: (title: string) => void }}
 */
import { el } from '../scripts/dom.js';
import { T, language } from '../scripts/language.js';

const DATE_FORMAT = { weekday: 'short', day: '2-digit', month: 'short' };

export function Header({ initials = 'K' } = {}) {
  // The date is formatted in the active language, so Arabic gets Arabic
  // weekday and month names without a second date implementation.
  const dateNode = el('p', { className: 'eyebrow', text: formatDate() });
  const title = el('h1', { className: 'header__title', text: T('nav.dashboard') });

  const node = el('header', { className: 'header' }, [
    el('div', { className: 'header__row' }, [
      el('div', {}, [dateNode, title]),
      el('button', {
        className: 'avatar',
        type: 'button',
        'aria-label': T('ui.a11y.profile'),
        text: initials,
        dataset: { link: '/profile' },
      }),
    ]),

    // Signature element: seven ticks, one per training day.
    el('div', {
      className: 'rail',
      role: 'img',
      'aria-label': T('ui.a11y.weekRail'),
    }, Array.from({ length: 7 }, (_, i) =>
      el('span', { className: `rail__tick${i === 0 ? ' is-active' : ''}` })
    )),
  ]);

  node.setTitle = (text) => { title.textContent = String(text); };

  // The heading is rewritten by the router on every navigation, so it cannot
  // stay bound to a key. The date can, and it is the only thing here that a
  // language sweep would otherwise miss.
  node.unsubscribe = language.subscribe(() => { dateNode.textContent = formatDate(); });

  return node;
}

/** Today, in the active language. */
function formatDate() {
  return new Intl.DateTimeFormat(language.current, DATE_FORMAT)
    .format(new Date())
    .toUpperCase();
}
