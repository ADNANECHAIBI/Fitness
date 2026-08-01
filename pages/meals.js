/**
 * Meals — what to eat today, and what it costs.
 */

import { ListGroup, ListRow, ReasonList, EmptyState, Skeleton, Button } from '../components/index.js';
import { PageFrame } from './page-frame.js';
import { live, swap } from './live-region.js';
import { el } from '../scripts/dom.js';
import { T, TName } from '../scripts/language.js';
import { Queries } from '../app/index.js';
import { EVENTS } from '../events/index.js';

let teardown = null;
let showShopping = false;

function render(host) {
  const day = Queries.getMealsToday();

  if (!day || !day.meals.length) {
    swap(host, EmptyState({
      title: T('ui.meals.noMealsTitle'),
      message: T('ui.meals.noMealsMessage'),
      actionLabel: T('ui.dashboard.openProfile'), actionLink: '/profile',
    }));
    return;
  }

  swap(host,
    el('section', { className: 'section' }, [
      el('h2', { className: 'section__title', text: T('ui.common.today') }),
      el('p', {
        className: 'section__note',
        text: T('ui.meals.summary', {
          kcal: day.calories, protein: day.proteinG,
          mad: day.costMad, minutes: day.prepMinutes,
        }),
      }),
      !day.withinBudget
        ? el('p', {
            className: 'section__note',
            text: T('ui.meals.overBudget', { mad: day.overBudgetBy }),
          })
        : null,
    ]),

    el('div', { className: 'section' }, day.meals.map(mealCard)),

    el('div', { className: 'actions' }, [
      Button({
        label: showShopping ? T('ui.meals.hideShopping') : T('ui.meals.showShopping'),
        onClick: () => { showShopping = !showShopping; render(host); },
      }),
    ]),

    showShopping ? shoppingList() : null,

    ReasonList({ reasons: [day.reason].filter(Boolean), title: T('ui.meals.whyDay') }),
  );
}

function mealCard(meal) {
  return el('article', { className: 'meal' }, [
    el('div', { className: 'meal__head' }, [
      el('h3', {
        className: 'meal__slot',
        text: T(`meal.${meal.slot}`, null, meal.slot.replace(/_/g, ' ')),
      }),
      el('span', {
        className: 'meal__macros',
        text: T('ui.meals.mealMacros', { kcal: meal.calories, protein: meal.proteinG }),
      }),
    ]),

    el('p', {
      className: 'exercise__meta',
      text: T('ui.meals.mealMeta', {
        prep: meal.cookingRequired
          ? T('ui.meals.prepTime', { minutes: meal.prepMinutes })
          : T('ui.meals.noCooking'),
        mad: meal.costMad,
      }),
    }),

    el('div', { className: 'meal__foods' }, meal.foods.map((food) =>
      el('div', { className: 'meal__food' }, [
        el('span', { text: TName('food', food.foodId, food.name) }),
        el('span', { className: 'meal__quantity', text: `${food.quantity} ${food.unit}` }),
      ])
    )),

    /* Alternatives the database offered for each role. */
    meal.foods.some((food) => food.alternatives?.length)
      ? el('p', {
          className: 'exercise__meta',
          text: T('ui.meals.swaps', {
            list: meal.foods.flatMap((food) => food.alternatives ?? [])
              .slice(0, 4).map((id) => id.replace(/-/g, ' ')).join(', '),
          }),
        })
      : null,

    ReasonList({ reasons: meal.foods.map((food) => food.reason), title: T('ui.meals.whyFoods'), limit: 4 }),
  ]);
}

function shoppingList() {
  const totals = Queries.getShoppingList();
  if (!totals.length) return null;

  return ListGroup({
    title: T('ui.common.thisWeek'),
    rows: totals.slice(0, 20).map((item) => ListRow({
      label: TName('food', item.foodId, item.name),
      value: `${Math.round(item.grams)} ${T('ui.unit.g')}`,
      detail: `${item.costMad} ${T('ui.unit.mad')}`,
    })),
    note: T('ui.meals.shoppingNote'),
  });
}

export default {
  render() {
    const host = el('div', { className: 'stack' }, [Skeleton({ lines: 5 })]);
    return PageFrame({ lead: T('ui.meals.lead'), children: [host] });
  },

  mount(node) {
    const host = node.querySelector('.stack');
    render(host);
    teardown = live([EVENTS.WEEK_GENERATED, EVENTS.WEIGHT_CHANGED, EVENTS.SETTINGS_CHANGED], () => render(host));
  },

  unmount() { teardown?.(); teardown = null; showShopping = false; },
};
