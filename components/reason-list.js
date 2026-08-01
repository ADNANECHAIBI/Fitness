/**
 * ReasonList — the engines' explanations, rendered.
 *
 * Every engine attaches a reason object to what it decided. This component
 * displays them. It formats nothing beyond the text it was given: if a reason
 * reads badly, that is the engine's wording to fix, not this component's.
 */
import { el } from '../scripts/dom.js';
import { T } from '../scripts/language.js';

/**
 * @param {object} options
 * @param {object[]} options.reasons  objects with { message, rule }
 * @param {string} [options.title]
 * @param {number} [options.limit]
 * @param {boolean} [options.collapsed]  start closed
 */
export function ReasonList({ reasons = [], title = T('ui.common.why'), limit = null, collapsed = true } = {}) {
  const shown = limit ? reasons.slice(0, limit) : reasons;
  if (!shown.length) return el('div', { className: 'reasons reasons--empty' });

  const items = el('div', { className: 'reasons__items' },
    shown.map((reason) => el('div', { className: 'reason' }, [
      reason.rule && el('p', { className: 'reason__rule', text: reason.rule }),
      el('p', { className: 'reason__text', text: messageOf(reason) }),
    ])));

  const toggle = el('button', {
    className: 'reasons__toggle',
    type: 'button',
    'aria-expanded': String(!collapsed),
    // The caller's title may itself be a key; passing it through as a
    // variable keeps the whole label re-translatable, count included.
    text: T('ui.reasons.toggle', { title, count: shown.length }),
  });

  const node = el('div', { className: `reasons${collapsed ? '' : ' is-open'}` }, [toggle, items]);

  toggle.addEventListener('click', () => {
    const open = node.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  return node;
}

/** A reason's message may itself be a nested reason object. */
function messageOf(reason) {
  if (typeof reason?.message === 'string') return reason.message;
  if (typeof reason?.message?.message === 'string') return reason.message.message;
  return String(reason?.message ?? '');
}
