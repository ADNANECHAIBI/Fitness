/**
 * Onboarding — the first-launch wizard.
 *
 * The steps are data, not markup: adding a question means adding one entry to
 * STEPS. Each step declares its fields and the rule each answer must pass —
 * the same rules the models use, so nothing can be accepted here that the
 * Profile would later reject.
 *
 * Every answered step is saved to the draft immediately. Closing the app
 * halfway and coming back resumes on the same question.
 */

import { Button, Field, Choice, toast } from '../components/index.js';
import { el } from '../scripts/dom.js';
import { T, t } from '../scripts/language.js';
import { rules, ValidationError } from '../validators/index.js';
import { Actions } from '../app/index.js';
import { SEX, ACTIVITY, GOAL, WEEKDAYS } from '../models/profile.js';
import { createLogger } from '../scripts/logger.js';

const log = createLogger('ui');

/**
 * Turn a list of raw values into Choice options with readable labels.
 * The map holds keys now, not English: the value is still the machine id,
 * so nothing a step collects changes with the language.
 */
const asOptions = (values, keys = {}) =>
  values.map((value) => ({ value, label: keys[value] ? T(keys[value]) : value }));

const STEPS = [
  {
    id: 'weight',
    titleKey: 'ui.onboarding.weight.title',
    hintKey: 'ui.onboarding.weight.hint',
    fields: [{ key: 'weightKg', kind: 'field', labelKey: 'ui.field.weightKg', type: 'number', unitKey: 'ui.unit.kg',
               rule: rules.number({ min: 25, max: 300, unit: 'kg' }) }],
  },
  {
    id: 'height',
    titleKey: 'ui.onboarding.height.title',
    fields: [{ key: 'heightCm', kind: 'field', labelKey: 'ui.field.heightCm', type: 'number', unitKey: 'ui.unit.cm',
               rule: rules.number({ min: 100, max: 250, unit: 'cm' }) }],
  },
  {
    id: 'age',
    titleKey: 'ui.onboarding.age.title',
    fields: [{ key: 'age', kind: 'field', labelKey: 'ui.field.age', type: 'number', unitKey: 'ui.unit.years',
               rule: rules.number({ min: 10, max: 100, integer: true }) }],
  },
  {
    id: 'sex',
    titleKey: 'ui.onboarding.sex.title',
    hintKey: 'ui.onboarding.sex.hint',
    fields: [{ key: 'sex', kind: 'choice', labelKey: 'ui.field.sex',
               options: asOptions(SEX, { male: 'ui.option.male', female: 'ui.option.female' }) }],
  },
  {
    id: 'goal',
    titleKey: 'ui.onboarding.goal.title',
    fields: [
      { key: 'goal', kind: 'choice', labelKey: 'ui.field.goal', options: asOptions(GOAL, {
          bulk: 'ui.option.bulk', cut: 'ui.option.cut',
          recomp: 'ui.option.recomp', maintain: 'ui.option.maintain',
        }) },
      { key: 'goalWeightKg', kind: 'field', labelKey: 'ui.field.goalWeightKg', type: 'number', unitKey: 'ui.unit.kg',
        optional: true, rule: rules.number({ min: 25, max: 300, unit: 'kg' }) },
    ],
  },
  {
    id: 'days',
    titleKey: 'ui.onboarding.days.title',
    fields: [
      { key: 'trainingDays', kind: 'field', labelKey: 'ui.field.availableDays', type: 'number', unitKey: 'ui.unit.perWeek',
        rule: rules.number({ min: 1, max: 7, integer: true }) },
      { key: 'availableDays', kind: 'choice', labelKey: 'ui.field.availableDays', multiple: true,
        options: asOptions(WEEKDAYS, {
          mon: 'ui.option.day.mon', tue: 'ui.option.day.tue', wed: 'ui.option.day.wed',
          thu: 'ui.option.day.thu', fri: 'ui.option.day.fri', sat: 'ui.option.day.sat',
          sun: 'ui.option.day.sun',
        }) },
    ],
  },
  {
    id: 'time',
    titleKey: 'ui.onboarding.time.title',
    hintKey: 'ui.onboarding.time.hint',
    fields: [
      { key: 'sessionStart', kind: 'field', labelKey: 'ui.field.sessionStart', type: 'time',
        rule: rules.string({ min: 4, max: 5 }) },
      { key: 'sessionEnd', kind: 'field', labelKey: 'ui.field.sessionEnd', type: 'time',
        rule: rules.string({ min: 4, max: 5 }) },
    ],
  },
  {
    id: 'activity',
    titleKey: 'ui.onboarding.activity.title',
    hintKey: 'ui.onboarding.activity.hint',
    fields: [{ key: 'activityLevel', kind: 'choice', labelKey: 'ui.field.activityLevel',
               options: asOptions(ACTIVITY, {
                 sedentary: 'ui.option.sedentary', light: 'ui.option.light',
                 moderate: 'ui.option.moderate', active: 'ui.option.active',
                 very_active: 'ui.option.very_active',
               }) }],
  },
  {
    id: 'sleep',
    titleKey: 'ui.onboarding.sleep.title',
    fields: [{ key: 'sleepHours', kind: 'field', labelKey: 'ui.field.sleepHours', type: 'number', unitKey: 'ui.unit.hours',
               rule: rules.number({ min: 3, max: 14 }) }],
  },
  {
    id: 'appetite',
    titleKey: 'ui.onboarding.appetite.title',
    fields: [{ key: 'appetite', kind: 'choice', labelKey: 'ui.field.appetite',
               options: asOptions(['low', 'normal', 'high'], {
                 low: 'ui.option.appetite.low', normal: 'ui.option.appetite.normal',
                 high: 'ui.option.appetite.high',
               }) }],
  },
  {
    id: 'budget',
    titleKey: 'ui.onboarding.budget.title',
    fields: [{ key: 'budgetLevel', kind: 'choice', labelKey: 'ui.field.budgetLevel',
               options: asOptions(['low', 'medium', 'high'], {
                 low: 'ui.option.budget.low', medium: 'ui.option.budget.medium',
                 high: 'ui.option.budget.high',
               }) }],
  },
  {
    id: 'injuries',
    titleKey: 'ui.onboarding.injuries.title',
    hintKey: 'ui.onboarding.injuries.hint',
    fields: [{ key: 'injuries', kind: 'field', labelKey: 'ui.field.injuries', type: 'text',
               optional: true, rule: rules.string({ max: 400 }) }],
  },
  {
    id: 'running',
    titleKey: 'ui.onboarding.running.title',
    fields: [{ key: 'runsPerWeek', kind: 'field', labelKey: 'ui.field.runsPerWeek', type: 'number', unitKey: 'ui.unit.perWeek',
               rule: rules.number({ min: 0, max: 14, integer: true }) }],
  },
];

/** Build the controls for one step, pre-filled from the draft. */
function buildControls(step, answers) {
  return step.fields.map((spec) => {
    const control = spec.kind === 'choice'
      ? Choice({
          label: T(spec.labelKey),
          options: spec.options,
          multiple: Boolean(spec.multiple),
          value: answers[spec.key] ?? (spec.multiple ? [] : null),
        })
      : Field({
          label: T(spec.labelKey),
          name: spec.key,
          type: spec.type,
          unit: spec.unitKey ? T(spec.unitKey) : '',
          value: answers[spec.key] ?? '',
          rule: spec.rule,
        });

    control.dataset.key = spec.key;
    control.spec = spec;
    return control;
  });
}

let state = null;

export default {
  render() {
    const draft = Actions.onboardingDraft();
    state = {
      index: Math.min(draft.step ?? 0, STEPS.length - 1),
      answers: { ...draft },
      root: el('div', { className: 'wizard' }),
    };

    paint();
    return el('section', { className: 'page__inner' }, [state.root]);
  },

  unmount() { state = null; },
};

/** Render the current step into the wizard shell. */
function paint() {
  const step = STEPS[state.index];
  const controls = buildControls(step, state.answers);
  const last = state.index === STEPS.length - 1;

  const progress = el('div', { className: 'wizard__progress' }, [
    el('div', {
      className: 'wizard__bar',
      style: { width: `${((state.index + 1) / STEPS.length) * 100}%` },
    }),
  ]);

  const body = el('div', { className: 'wizard__body' }, [
    el('p', {
      className: 'eyebrow',
      text: T('ui.onboarding.step', { current: state.index + 1, total: STEPS.length }),
    }),
    el('h2', { className: 'wizard__title', text: T(step.titleKey) }),
    step.hintKey && el('p', { className: 'wizard__hint', text: T(step.hintKey) }),
    el('div', { className: 'wizard__fields' }, controls),
  ]);

  const back = Button({
    label: T('ui.common.back'),
    variant: 'ghost',
    disabled: state.index === 0,
    onClick: () => { state.index -= 1; paint(); },
  });

  const next = Button({
    label: last ? T('ui.common.finish') : T('ui.common.continue'),
    variant: 'primary',
    onClick: () => advance(controls, last),
  });

  state.root.replaceChildren(
    progress,
    body,
    el('div', { className: 'wizard__actions' }, [back, next])
  );

  controls[0]?.focus?.();
}

/** Validate the step, save the answers, then move on or finish. */
function advance(controls, last) {
  const collected = {};

  for (const control of controls) {
    const optional = control.spec.optional;
    const raw = control.value?.();
    const empty = raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);

    if (optional && empty) continue;

    const result = control.validate();
    if (!result.ok) {
      control.focus?.();
      return;                                   // stay on the step
    }
    collected[control.dataset.key] = result.value;
  }

  state.answers = { ...state.answers, ...collected };

  // Auto-save: the draft is written on every step, not at the end.
  {
    Actions.saveOnboardingDraft({ ...state.answers, step: Math.min(state.index + 1, STEPS.length - 1) });
  }

  if (!last) {
    state.index += 1;
    paint();
    return;
  }

  try {
    Actions.completeOnboarding(state.answers);
    toast(t('ui.onboarding.profileSaved'), { tone: 'success' });
    location.hash = '#/';
  } catch (error) {
    if (error instanceof ValidationError) {
      const [field, message] = Object.entries(error.fields)[0] ?? ['Something', 'is missing'];
      toast(t('ui.onboarding.checkField', { field, message }), { tone: 'error' });
    } else {
      toast(t('ui.onboarding.saveFailed'), { tone: 'error' });
      log.error(error);
    }
  }
}

export { STEPS };
