/**
 * Field — a labelled input with inline validation.
 *
 * The field never decides what is valid: it is handed a rule from
 * validators/rules.js, which is the same rule the model uses. One definition,
 * checked in both places.
 *
 * @param {object} options
 * @param {string} options.label
 * @param {string} [options.name]
 * @param {'number'|'text'|'time'|'date'} [options.type]
 * @param {*} [options.value]
 * @param {string} [options.unit]
 * @param {string} [options.hint]
 * @param {import('../scripts/../validators/rules.js').Rule} [options.rule]
 * @param {(value: *, valid: boolean) => void} [options.onChange]
 * @returns {HTMLElement & { validate: Function, value: Function, focus: Function }}
 */
import { el } from '../scripts/dom.js';
import { t, keyOf } from '../scripts/language.js';

export function Field({
  label,
  // A translated label is not an id: it changes with the language, and the
  // input's id must not. Fall back to the key, which never moves.
  name = keyOf(label) ?? label,
  type = 'text',
  value = '',
  unit = '',
  hint = '',
  rule = null,
  onChange = null,
} = {}) {
  const input = el('input', {
    className: 'field__input',
    type: type === 'number' ? 'text' : type,
    // A numeric keypad on iOS without the spinner arrows of type=number.
    inputMode: type === 'number' ? 'decimal' : 'text',
    autocomplete: 'off',
    autocapitalize: type === 'text' ? 'sentences' : 'off',
    id: `field-${name}`,
    value: value ?? '',
  });

  const error = el('p', { className: 'field__error', role: 'alert' });

  const node = el('label', { className: 'field', for: input.id }, [
    el('span', { className: 'field__label', text: label }),
    el('span', { className: 'field__control' }, [
      input,
      unit && el('span', { className: 'field__unit', text: unit }),
    ]),
    hint && el('p', { className: 'field__hint', text: hint }),
    error,
  ]);

  /**
   * Run the rule against the current input.
   * @returns {{ok: boolean, value: *, error: string|null}}
   */
  node.validate = () => {
    const raw = input.value.trim();
    if (!rule) return { ok: true, value: raw, error: null };

    const result = rule(raw);
    node.classList.toggle('is-invalid', !result.ok);
    error.textContent = result.ok ? '' : t('ui.form.fieldError', { label, error: result.error });
    return result;
  };

  /** The parsed value, or null when it does not pass. */
  node.value = () => {
    const result = node.validate();
    return result.ok ? result.value : null;
  };

  node.focus = () => input.focus();

  // Clear the error as soon as the person starts fixing it; re-check on blur,
  // so nobody is told they are wrong halfway through typing.
  input.addEventListener('input', () => {
    node.classList.remove('is-invalid');
    error.textContent = '';
    onChange?.(input.value, true);
  });
  input.addEventListener('blur', () => {
    const result = node.validate();
    onChange?.(result.value, result.ok);
  });

  return node;
}
