/**
 * Form — built from a descriptor in app/forms.js.
 *
 * It validates with the rule the model declared and submits through the
 * service the descriptor points at. It contains no rule of its own: if a value
 * is rejected, it was rejected by the model.
 */
import { el } from '../scripts/dom.js';
import { Field } from './field.js';
import { Choice } from './choice.js';
import { Button } from './button.js';
import { toast } from './toast.js';
import { T, t } from '../scripts/language.js';

/**
 * @param {object} options
 * @param {object} options.descriptor   from Forms.get(id)
 * @param {object} options.values       current values
 * @param {(result) => void} [options.onSaved]
 * @param {(id, values) => object} options.onSubmit  usually Forms.save
 */
export function Form({ descriptor, values = {}, onSubmit, onSaved = null } = {}) {
  const controls = descriptor.fields.map((spec) => {
    const current = values[spec.key];

    // A descriptor may name a key; if it does not, its own label is used.
    const label = spec.labelKey ? T(spec.labelKey) : spec.label;

    const control = spec.type === 'choice'
      ? Choice({
          label,
          options: spec.options,
          multiple: Boolean(spec.multiple),
          value: current ?? (spec.multiple ? [] : null),
        })
      : Field({
          label,
          name: spec.key,
          type: spec.type === 'time' ? 'time' : spec.type,
          unit: spec.unit,
          value: current ?? '',
          rule: spec.rule,
        });

    control.spec = spec;
    return control;
  });

  const errorLine = el('p', { className: 'form__error', role: 'alert' });

  const submit = () => {
    const collected = {};

    for (const control of controls) {
      const { spec } = control;
      const raw = control.value?.();
      const empty = raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);

      if (spec.optional && empty) continue;

      const result = control.validate();
      if (!result.ok) {
        control.focus?.();
        errorLine.textContent = '';
        return;
      }
      collected[spec.key] = result.value;
    }

    const outcome = onSubmit(descriptor.id, collected);

    if (outcome.ok) {
      errorLine.textContent = '';
      toast(t('ui.form.saved', {
        title: descriptor.titleKey ? t(descriptor.titleKey) : descriptor.title,
      }), { tone: 'success' });
      onSaved?.(outcome);
    } else {
      // The model rejected it. Show what it said rather than paraphrasing.
      errorLine.textContent = outcome.error?.message ?? t('ui.error.notSaved');
    }
  };

  return el('form', { className: 'form', on: { submit: (event) => event.preventDefault() } }, [
    descriptor.description && el('p', {
      className: 'form__description',
      text: descriptor.descriptionKey ? T(descriptor.descriptionKey) : descriptor.description,
    }),
    el('div', { className: 'form__fields' }, controls),
    errorLine,
    el('div', { className: 'form__actions' }, [
      Button({ label: T('ui.common.save'), variant: 'primary', onClick: submit }),
    ]),
  ]);
}
