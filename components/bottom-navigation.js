/**
 * BottomNavigation — the tab bar.
 *
 * The items are passed in rather than imported: a presentation component that
 * reaches for the route table couples the two, and it closed a dependency
 * cycle (nav → routes → pages → components barrel → nav).
 *
 * @param {{items: {path: string, nav: {labelKey: string, icon: string}}[]}} options
 * @returns {HTMLElement & { setActive: (path: string) => void }}
 */
import { el, icon } from '../scripts/dom.js';
import { T } from '../scripts/language.js';

export function BottomNavigation({ items = [] } = {}) {
  const tabs = items.map((route) =>
    el('button', {
      className: 'tab',
      type: 'button',
      dataset: { link: route.path },
    }, [
      icon(route.nav.icon, { size: 21, className: 'tab__icon' }),
      el('span', { className: 'tab__label', text: T(route.nav.labelKey) }),
    ])
  );

  const node = el('nav', {
    className: 'tabbar',
    'aria-label': T('ui.a11y.mainNav'),
    style: { '--tab-count': items.length },
  }, tabs);

  /** Highlight the tab matching a route path. Unknown paths clear all tabs. */
  node.setActive = (path) => {
    items.forEach((route, i) => {
      const active = route.path === path;
      tabs[i].classList.toggle('is-active', active);
      if (active) tabs[i].setAttribute('aria-current', 'page');
      else tabs[i].removeAttribute('aria-current');
    });
  };

  return node;
}
