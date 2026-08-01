/**
 * Profile — the person, the goal, the constraints.
 *
 * Every panel is a form built from a descriptor in the application layer and
 * submitted through it. This page validates nothing itself.
 */

import { ListGroup, ListRow, Button, Modal, Skeleton, ReasonList } from '../components/index.js';
import { PageFrame } from './page-frame.js';
import { live, swap } from './live-region.js';
import { el } from '../scripts/dom.js';
import { T, t } from '../scripts/language.js';
import { Queries, Forms } from '../app/index.js';
import { Form } from '../components/form.js';
import { EVENTS } from '../events/index.js';

let teardown = null;
let dialog = null;

const humanise = (value) =>
  value === null || value === undefined || value === ''
    ? '—'
    : String(value).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const show = (value, unit = '') =>
  value === null || value === undefined || value === '' ? '—' : `${value}${unit ? ` ${unit}` : ''}`;

function render(host) {
  const profile = Forms.values('profile');
  const settings = Forms.values('preferences');
  const budget = Forms.values('budget');
  const schedule = Forms.values('availability');
  const equipment = Forms.values('equipment');
  const week = Queries.getCurrentWeek();

  /** A titled group with an Edit button. The title is a key, not a string. */
  const panel = (titleKey, id, rows) => el('section', { className: 'section' }, [
    ListGroup({ title: T(titleKey), rows }),
    el('div', { className: 'actions' }, [
      Button({
        label: T('ui.common.edit', { what: T(titleKey) }),
        size: 'sm',
        onClick: () => openForm(id, host),
      }),
    ]),
  ]);

  swap(host,
    panel('ui.profile.profile', 'profile', [
      ListRow({ label: T('ui.profile.age'), value: show(profile.age, t('ui.unit.years')) }),
      ListRow({ label: T('ui.profile.sex'), value: humanise(profile.sex) }),
      ListRow({ label: T('ui.profile.height'), value: show(profile.heightCm, t('ui.unit.cm')) }),
      ListRow({ label: T('ui.profile.weight'), value: show(profile.weightKg, t('ui.unit.kg')) }),
      ListRow({ label: T('ui.profile.experience'), value: humanise(profile.experienceLevel) }),
      ListRow({ label: T('ui.profile.dailyActivity'), value: humanise(profile.activityLevel) }),
    ]),

    panel('ui.profile.goal', 'goals', [
      ListRow({ label: T('ui.profile.goal'), value: humanise(profile.goal) }),
      ListRow({ label: T('ui.profile.goalWeight'), value: show(profile.goalWeightKg, t('ui.unit.kg')) }),
      ListRow({ label: T('ui.profile.trainingDays'), value: show(profile.trainingDays) }),
      ListRow({
        label: T('ui.profile.dailyCalories'),
        value: show(week.nutrition.dailyCalories, t('ui.unit.kcal')),
        detail: T('ui.profile.calculated'),
      }),
      ListRow({
        label: T('ui.profile.proteinTarget'),
        value: show(week.nutrition.proteinTargetG, t('ui.unit.g')),
        detail: T('ui.profile.calculated'),
      }),
    ]),

    panel('ui.profile.schedule', 'availability', [
      ListRow({ label: T('ui.profile.availableDays'), value: (schedule.availableDays ?? []).join(', ') || '—' }),
      ListRow({ label: T('ui.profile.sessionWindow'), value: schedule.sessionStart ? `${schedule.sessionStart} – ${schedule.sessionEnd}` : '—' }),
    ]),

    panel('ui.profile.equipment', 'equipment', [
      ListRow({
        label: T('ui.profile.available'),
        value: (equipment.availableEquipment ?? []).length
          ? T('ui.profile.equipmentCount', { n: equipment.availableEquipment.length })
          : T('ui.profile.equipmentAssumed'),
        detail: (equipment.availableEquipment ?? []).length
          ? equipment.availableEquipment.join(', ')
          : T('ui.profile.equipmentAssumedDetail'),
      }),
    ]),

    panel('ui.profile.budget', 'budget', [
      ListRow({ label: T('ui.profile.level'), value: humanise(budget.budgetLevel) }),
      ListRow({ label: T('ui.profile.monthlyBudget'), value: show(budget.budgetMadPerMonth, t('ui.unit.mad')) }),
      ListRow({ label: T('ui.profile.cookingTime'), value: show(budget.cookingMinutesPerDay, t('ui.unit.minPerDay')) }),
      ListRow({
        label: T('ui.profile.mealCost'),
        value: show(week.meals.dailyCostAverageMad, t('ui.unit.madPerDay')),
        detail: T('ui.profile.mealCostDetail'),
      }),
    ]),

    panel('ui.profile.preferences', 'preferences', [
      ListRow({ label: T('ui.profile.appetite'), value: humanise(settings.appetite) }),
      ListRow({ label: T('ui.profile.sleep'), value: show(settings.sleepHours, t('ui.unit.h')) }),
      ListRow({ label: T('ui.profile.vegetarian'), value: settings.vegetarian ? T('ui.common.yes') : T('ui.common.no') }),
      ListRow({ label: T('ui.profile.vegan'), value: settings.vegan ? T('ui.common.yes') : T('ui.common.no') }),
    ]),

    ReasonList({ reasons: week.nutrition.reasons, title: T('ui.profile.whyTargets'), limit: 6 }),
  );
}

function openForm(id, host) {
  const descriptor = Forms.get(id);
  if (!descriptor) return;

  dialog?.element.remove();

  dialog = Modal({
    title: descriptor.titleKey ? T(descriptor.titleKey) : descriptor.title,
    children: [Form({
      descriptor,
      values: Forms.values(id),
      onSubmit: (formId, values) => Forms.save(formId, values),
      onSaved: () => { dialog.close(); render(host); },
    })],
    actions: [],
  });

  document.body.append(dialog.element);
  dialog.open();
}

export default {
  render() {
    const host = el('div', { className: 'stack' }, [Skeleton({ lines: 6 })]);
    return PageFrame({ lead: T('ui.profile.lead'), children: [host] });
  },

  mount(node) {
    const host = node.querySelector('.stack');
    render(host);
    teardown = live([EVENTS.PROFILE_CHANGED, EVENTS.SETTINGS_CHANGED, EVENTS.WEEK_GENERATED], () => render(host));
  },

  unmount() { teardown?.(); teardown = null; dialog?.element.remove(); dialog = null; },
};
