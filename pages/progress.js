/**
 * Progress — everything that has changed.
 */

import { StatCard, ListGroup, ListRow, ProgressBar, ReasonList, Skeleton, Button, Modal } from '../components/index.js';
import { PageFrame } from './page-frame.js';
import { live, swap } from './live-region.js';
import { el } from '../scripts/dom.js';
import { T, t } from '../scripts/language.js';
import { Queries, Forms } from '../app/index.js';
import { Form } from '../components/form.js';
import { EVENTS } from '../events/index.js';

let teardown = null;
let dialog = null;

const show = (value, unit = '') =>
  value === null || value === undefined ? '—' : `${value}${unit ? ` ${unit}` : ''}`;

function render(host) {
  const progress = Queries.getProgress();
  const { weight, gym, running, measurements, nutrition, recovery } = progress;

  swap(host,
    el('div', { className: 'grid' }, [
      StatCard({
        label: T('ui.progress.weight'), value: show(weight.current), unit: T('ui.unit.kg'),
        hint: weight.progress ? T('ui.progress.toGoal', { n: weight.progress.remaining }) : '',
      }),
      StatCard({
        label: T('ui.progress.recovery'), value: recovery.status,
        hint: recovery.strainIndex !== null ? T('ui.progress.strain', { n: recovery.strainIndex }) : '',
      }),
    ]),

    weight.progress ? ProgressBar({
      value: weight.progress.percent,
      label: T('ui.progress.towardGoal'),
      detail: T('ui.progress.towardGoalDetail', {
        start: weight.progress.start, current: weight.progress.current, goal: weight.progress.goal,
      }),
    }) : null,

    el('div', { className: 'actions' }, [
      Button({ label: T('ui.progress.logWeight'), variant: 'primary', onClick: () => openForm('weight', host) }),
      Button({ label: T('ui.progress.logMeasurements'), onClick: () => openForm('measurements', host) }),
    ]),

    ListGroup({
      title: T('ui.progress.weight'),
      rows: [
        ListRow({ label: T('ui.progress.current'), value: show(weight.current, t('ui.unit.kg')) }),
        ListRow({ label: T('ui.progress.goal'), value: show(weight.goal, t('ui.unit.kg')) }),
        ListRow({ label: T('ui.progress.bmi'), value: show(weight.bmi), detail: T('ui.progress.bmiDetail') }),
        ListRow({
          label: T('ui.progress.weeklyTrend'),
          value: weight.trend
            ? `${weight.trend.ratePerWeek > 0 ? '+' : ''}${weight.trend.ratePerWeek} ${t('ui.unit.kg')}`
            : '—',
        }),
        ListRow({ label: T('ui.progress.weighIns'), value: String(weight.history.length) }),
      ],
    }),

    ListGroup({
      title: T('ui.progress.lifting'),
      rows: [
        ListRow({ label: T('ui.progress.sessions4w'), value: String(gym.lastMonth.sessions) }),
        ListRow({ label: T('ui.progress.sets4w'), value: String(gym.lastMonth.sets) }),
        ListRow({ label: T('ui.progress.tonnage4w'), value: `${gym.lastMonth.volumeKg} ${T('ui.unit.kg')}` }),
        ListRow({ label: T('ui.progress.setsLastWeek'), value: String(gym.lastWeek.sets) }),
      ],
    }),

    ListGroup({
      title: T('ui.progress.running'),
      rows: [
        ListRow({ label: T('ui.progress.runsLogged'), value: String(running.totalRuns) }),
        ListRow({ label: T('ui.progress.averagePace'), value: `${running.averagePace} ${T('ui.unit.perKm')}` }),
        ListRow({ label: T('ui.progress.bestPace'), value: `${running.bestPace} ${T('ui.unit.perKm')}` }),
        ListRow({ label: T('ui.progress.thisWeek'), value: `${running.weeklyDistanceKm} ${T('ui.unit.km')}` }),
        ListRow({ label: T('ui.progress.thisMonth'), value: `${running.monthlyDistanceKm} ${T('ui.unit.km')}` }),
        ListRow({ label: T('ui.progress.longestRun'), value: `${running.longestRunKm} ${T('ui.unit.km')}` }),
        ListRow({
          label: T('ui.progress.consistency'), value: `${running.consistency.percent}%`,
          detail: T('ui.progress.consistencyDetail', { n: running.consistency.weeksWithRuns }),
        }),
        ListRow({ label: T('ui.progress.trainingLoad'), value: running.trainingLoad.verdict }),
      ],
    }),

    ListGroup({
      title: T('ui.progress.nutrition'),
      rows: [
        ListRow({ label: T('ui.progress.target'), value: show(nutrition.target.calories, t('ui.unit.kcal')) }),
        ListRow({
          label: T('ui.progress.loggedAverage'),
          value: show(nutrition.actual.avgCalories, t('ui.unit.kcal')),
          detail: T('ui.progress.daysLogged', { n: nutrition.actual.daysLogged }),
        }),
        ListRow({ label: T('ui.progress.calorieCompliance'), value: nutrition.compliance.caloriesPercent === null ? '—' : `${nutrition.compliance.caloriesPercent}%` }),
        ListRow({ label: T('ui.progress.proteinCompliance'), value: nutrition.compliance.proteinPercent === null ? '—' : `${nutrition.compliance.proteinPercent}%` }),
      ],
    }),

    ListGroup({
      title: T('ui.progress.measurements'),
      rows: measurements.latest
        ? Object.entries(measurements.latest)
            .filter(([key, value]) => key.endsWith('Cm') && value !== null)
            .map(([key, value]) => ListRow({
              label: T(`ui.field.${key}`), value: `${value} ${T('ui.unit.cm')}`,
            }))
        : [ListRow({ label: T('ui.progress.nothingRecorded'), detail: T('ui.progress.useButton') })],
    }),

    ReasonList({ reasons: recovery.reasons, title: T('ui.progress.recovery') }),
  );
}

/** Open a form in a dialog. The form submits through the application layer. */
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
    const host = el('div', { className: 'stack' }, [Skeleton({ cards: 2 })]);
    return PageFrame({ lead: T('ui.progress.lead'), children: [host] });
  },

  mount(node) {
    const host = node.querySelector('.stack');
    render(host);
    teardown = live([EVENTS.WEIGHT_CHANGED, EVENTS.WORKOUT_COMPLETED, EVENTS.RUN_LOGGED, EVENTS.RECORD_CREATED], () => render(host));
  },

  unmount() { teardown?.(); teardown = null; dialog?.element.remove(); dialog = null; },
};
