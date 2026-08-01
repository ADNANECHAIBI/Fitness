/**
 * Modal — a dialog built on the native <dialog> element.
 *
 * Using <dialog> instead of a hand-rolled overlay gives focus trapping, the
 * top layer, and Escape-to-close for free, in every modern browser and iOS 15.4+.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.description]
 * @param {Node[]} [options.children]   body content
 * @param {Node[]} [options.actions]    footer buttons
 * @param {Function} [options.onClose]
 * @returns {{ element: HTMLDialogElement, open: Function, close: Function }}
 *
 * @example
 * const modal = Modal({ title: 'Delete data', actions: [Button({ label: 'Cancel' })] });
 * document.body.append(modal.element);
 * modal.open();
 */
import { el, icon } from '../scripts/dom.js';
import { T } from '../scripts/language.js';

const CLOSE_ICON = 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z';

export function Modal({
  title,
  description = '',
  children = [],
  actions = [],
  onClose = null,
} = {}) {
  const dialog = el('dialog', { className: 'modal' }, [
    el('div', { className: 'modal__panel' }, [
      el('header', { className: 'modal__head' }, [
        el('div', {}, [
          el('h2', { className: 'modal__title', text: title }),
          description && el('p', { className: 'modal__desc', text: description }),
        ]),
        el('button', {
          className: 'modal__close',
          type: 'button',
          'aria-label': T('ui.a11y.close'),
          on: { click: () => close() },
        }, [icon(CLOSE_ICON, { size: 18 })]),
      ]),

      children.length ? el('div', { className: 'modal__body' }, children) : null,
      actions.length ? el('footer', { className: 'modal__actions' }, actions) : null,
    ]),
  ]);

  // Clicking the backdrop closes: the <dialog> itself is the backdrop area.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener('close', () => onClose?.());

  function open() { dialog.showModal(); }
  function close() { dialog.close(); }

  return { element: dialog, open, close };
}
