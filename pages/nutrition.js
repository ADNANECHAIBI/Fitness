/**
 * Nutrition — today's targets, and what is left of them.
 */

import { StatCard, ListGroup, ListRow, ProgressBar, ReasonList, EmptyState, Skeleton } from '../components/index.js';
import { PageFrame } from './page-frame.js';
import { live, swap } from './live-region.js';
import { el } from '../scripts/dom.js';
import { T } from '../scripts/language.js';
import { Queries } from '../app/index.js';
import { EVENTS } from '../events/index.js';

let teardown = null;

function render(host) {
  const day = Queries.getNutritionToday();
  const dashboard = Queries.getToday();

  if (!day) {
    swap(host, EmptyState({
      title: T('ui.nutrition.noTargetsTitle'),
      message: T('ui.nutrition.noTargetsMessage'),
      actionLabel: T('ui.dashboard.openProfile'), actionLink: '/profile',
    }));
    return;
  }

  const remaining = dashboard.nutrition?.remaining;
  const eaten = remaining ? Math.max(0, day.calories - remaining.calories) : 0;

  swap(host,
    el('div', { className: 'grid' }, [
      StatCard({
        label: T('ui.nutrition.calories'), value: day.calories, unit: T('ui.unit.kcal'),
        hint: remaining?.logged ? T('ui.nutrition.left', { n: remaining.calories }) : '',
      }),
      StatCard({
        label: T('ui.nutrition.protein'), value: day.proteinG, unit: T('ui.unit.g'),
        hint: remaining?.logged ? T('ui.nutrition.left', { n: remaining.proteinG }) : '',
      }),
    ]),

    ProgressBar({
      value: day.calories ? (eaten / day.calories) * 100 : 0,
      label: T('ui.nutrition.loggedToday'),
      detail: T('ui.dashboard.intakeDetail', { eaten, total: day.calories }),
    }),

    ListGroup({
      title: T('ui.nutrition.targets'),
      rows: [
        ListRow({ label: T('ui.nutrition.carbs'), value: `${day.carbsG} ${T('ui.unit.g')}` }),
        ListRow({ label: T('ui.nutrition.fat'), value: `${day.fatG} ${T('ui.unit.g')}` }),
        ListRow({ label: T('ui.nutrition.fibre'), value: `${day.fibreG} ${T('ui.unit.g')}` }),
        ListRow({ label: T('ui.nutrition.water'), value: `${day.waterL} ${T('ui.unit.l')}` }),
      ],
      note: day.notes ?? '',
    }),

    ListGroup({
      title: T('ui.nutrition.theDay'),
      rows: [
        ListRow({
          label: T('ui.nutrition.type'),
          value: day.trainingDay ? T('ui.nutrition.training')
            : day.runningDay ? T('ui.nutrition.running') : T('ui.nutrition.rest'),
        }),
        day.refeedDay
          ? ListRow({
              label: T('ui.nutrition.refeed'), value: T('ui.common.yes'),
              detail: T('ui.nutrition.refeedDetail'),
            })
          : null,
      ].filter(Boolean),
    }),

    ReasonList({ reasons: [day.reason].filter(Boolean), title: T('ui.nutrition.whyNumbers') }),
    ReasonList({
      reasons: Queries.getCurrentWeek().nutrition.reasons,
      title: T('ui.nutrition.weekDecisions'), limit: 8,
    }),
  );
}

export default {
  render() {
    const host = el('div', { className: 'stack' }, [Skeleton({ cards: 2 })]);
    return PageFrame({ lead: T('ui.nutrition.lead'), children: [host] });
  },

  mount(node) {
    const host = node.querySelector('.stack');
    render(host);
    teardown = live([EVENTS.NUTRITION_LOGGED, EVENTS.WEIGHT_CHANGED, EVENTS.WEEK_GENERATED], () => render(host));
  },

  unmount() { teardown?.(); teardown = null; },
};
