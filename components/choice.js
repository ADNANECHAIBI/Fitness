/**
 * Choice — pick one option, or several.
 *
 * @param {object} options
 * @param {string} options.label
 * @param {{value: string, label: string, hint?: string}[]} options.options
 * @param {string|string[]} [options.value]
 * @param {boolean} [options.multiple]
 * @param {(value: string|string[]) => void} [options.onChange]
 * @returns {HTMLElement & { value: Function, validate: Function }}
 */
import { el } from '../scripts/dom.js';
import { t } from '../scripts/language.js';

export function Choice({
  label,
  options = [],
  value = null,
  multiple = false,
  onChange = null,
} = {}) {
  let selected = multiple
    ? new Set(Array.isArray(value) ? value : [])
    : value;

  const error = el('p', { className: 'field__error', role: 'alert' });

  const buttons = options.map((option) =>
    el('button', {
      className: 'choice__option',
      type: 'button',
      'aria-pressed': String(multiple ? selected.has(option.value) : selected === option.value),
      on: { click: () => pick(option.value) },
    }, [
      el('span', { className: 'choice__label', text: option.label }),
      option.hint && el('span', { className: 'choice__hint', text: option.hint }),
    ])
  );

  function paint() {
    options.forEach((option, i) => {
      const on = multiple ? selected.has(option.value) : selected === option.value;
      buttons[i].classList.toggle('is-selected', on);
      buttons[i].setAttribute('aria-pressed', String(on));
    });
  }

  function pick(next) {
    if (multiple) {
      if (selected.has(next)) selected.delete(next);
      else selected.add(next);
    } else {
      selected = next;
    }
    error.textContent = '';
    paint();
    onChange?.(node.value());
  }

  const node = el('div', { className: 'choice' }, [
    el('span', { className: 'field__label', text: label }),
    el('div', {
      className: `choice__options${options.length > 3 ? ' choice__options--list' : ''}`,
      role: 'group',
      'aria-label': label,
    }, buttons),
    error,
  ]);

  node.value = () => (multiple ? [...selected] : selected);

  /** A choice is valid once something is selected. */
  node.validate = () => {
    const current = node.value();
    const empty = multiple ? current.length === 0 : !current;
    error.textContent = empty ? t('ui.form.chooseOption', { label }) : '';
    return { ok: !empty, value: current, error: empty ? t('ui.form.required') : null };
  };

  paint();
  return node;
}
