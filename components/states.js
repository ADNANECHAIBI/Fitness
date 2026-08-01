/**
 * states.js — the four things a screen shows when it has no content.
 *
 * Skeleton while loading, empty when there is nothing, error when something
 * failed, offline when the network is gone. None of them blocks the app.
 */
import { el, icon } from '../scripts/dom.js';
import { Button } from './button.js';
import { T } from '../scripts/language.js';

/** Grey blocks in the shape of the content that is coming. */
export function Skeleton({ lines = 3, cards = 0 } = {}) {
  if (cards > 0) {
    return el('div', { className: 'grid', 'aria-hidden': 'true' },
      Array.from({ length: cards }, () => el('div', { className: 'card skeleton__card' })));
  }

  return el('div', { className: 'skeleton', 'aria-busy': 'true', 'aria-label': T('ui.a11y.loading') },
    Array.from({ length: lines }, (_, i) =>
      el('div', { className: 'skeleton__line', style: { width: `${100 - i * 12}%` } })));
}

/**
 * Nothing here yet — and what to do about it.
 * @param {{title, message, actionLabel, actionLink, onAction}} options
 */
export function EmptyState({ title, message = '', actionLabel = null, actionLink = null, onAction = null } = {}) {
  return el('div', { className: 'state state--empty' }, [
    el('h2', { className: 'state__title', text: title }),
    message && el('p', { className: 'state__message', text: message }),
    (actionLabel && (actionLink || onAction))
      ? Button({ label: actionLabel, variant: 'primary', link: actionLink, onClick: onAction })
      : null,
  ]);
}

/** Something failed. Says what, and offers a way forward. */
export function ErrorState({ title = T('ui.error.wentWrong'), message = '', onRetry = null } = {}) {
  return el('div', { className: 'state state--error', role: 'alert' }, [
    el('h2', { className: 'state__title', text: title }),
    message && el('p', { className: 'state__message', text: message }),
    onRetry ? Button({ label: T('ui.common.tryAgain'), variant: 'primary', onClick: onRetry }) : null,
  ]);
}

/** The app works offline; this only says what is unavailable. */
export function OfflineNotice({ message = T('ui.error.offline') } = {}) {
  return el('div', { className: 'state state--offline', role: 'status' }, [
    el('p', { className: 'state__message', text: message }),
  ]);
}
