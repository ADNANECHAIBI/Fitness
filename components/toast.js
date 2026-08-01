/**
 * Toast — a brief message at the bottom of the screen.
 *
 * Used for the things that must be visible but must not block: a save
 * confirmation, a validation failure, a contained error. One container is
 * created on first use and reused.
 */
import { el } from '../scripts/dom.js';

let host = null;

function ensureHost() {
  if (!host) {
    host = el('div', { className: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  return host;
}

/**
 * @param {string} message
 * @param {{tone?: 'info'|'error'|'success', duration?: number}} [options]
 */
export function toast(message, { tone = 'info', duration = 3200 } = {}) {
  const node = el('div', { className: `toast toast--${tone}`, text: message });
  ensureHost().append(node);

  setTimeout(() => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 220);
  }, duration);

  return node;
}
