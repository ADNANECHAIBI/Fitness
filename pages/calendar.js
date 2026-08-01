/**
 * Calendar — the week, day by day.
 */

import { ListGroup, ListRow, ReasonList, Skeleton, Button, toast } from '../components/index.js';
import { PageFrame } from './page-frame.js';
import { live, swap } from './live-region.js';
import { el } from '../scripts/dom.js';
import { T, t } from '../scripts/language.js';
import { Queries, PlanningService } from '../app/index.js';
import { EVENTS } from '../events/index.js';
import { today } from '../models/index.js';

let teardown = null;

function render(host) {
  const { plan, workout, running, nutrition, meals } = Queries.getCurrentWeek();
  const now = today();

  const workoutByDate = new Map(workout.days.map((day) => [day.date, day]));
  const runByDate = new Map(running.sessions.map((session) => [session.date, session]));
  const mealsByDate = new Map(meals.days.map((day) => [day.date, day]));

  swap(host,
    el('section', { className: 'section' }, [
      el('h2', {
        className: 'section__title',
        text: T('ui.calendar.weekTitle', { number: plan.weekNumber, phase: plan.phase }),
      }),
      el('p', {
        className: 'section__note',
        text: T('ui.calendar.weekSummary', {
          gym: plan.summary.gymDays,
          running: plan.summary.runningDays,
          rest: plan.summary.restDays,
        }) + (plan.deload ? T('ui.calendar.deload') : ''),
      }),
    ]),

    ListGroup({
      title: T('ui.calendar.days'),
      rows: plan.days.map((day) => {
        const gym = workoutByDate.get(day.date);
        const run = runByDate.get(day.date);
        const meal = mealsByDate.get(day.date);

        const parts = [];
        if (gym) parts.push(t('ui.calendar.gymDetail', { goal: gym.goal, count: gym.exercises.length }));
        if (run) parts.push(t('ui.calendar.runDetail', { type: run.type.replace(/-/g, ' '), km: run.distanceKm }));
        if (!gym && !run) parts.push(day.focus);

        return ListRow({
          label: `${day.weekday}${day.date === now ? t('ui.calendar.todayMark') : ''}`,
          detail: parts.join(' · '),
          value: meal ? `${meal.calories} ${t('ui.unit.kcal')}` : '',
          link: day.date === now ? (gym ? '/gym' : run ? '/running' : '/meals') : null,
        });
      }),
    }),

    ListGroup({
      title: T('ui.common.thisWeek'),
      rows: [
        ListRow({ label: T('ui.calendar.liftingSets'), value: String(workout.totalWeeklySets) }),
        ListRow({ label: T('ui.calendar.runningDistance'), value: `${running.weeklyDistanceKm} ${T('ui.unit.km')}` }),
        ListRow({ label: T('ui.calendar.dailyCalories'), value: `${nutrition.dailyCalories ?? '—'} ${T('ui.unit.kcal')}` }),
        ListRow({ label: T('ui.calendar.foodCost'), value: `${meals.dailyCostAverageMad} ${T('ui.unit.madPerDay')}` }),
        ListRow({
          label: T('ui.calendar.macroAccuracy'), value: `${meals.macroAccuracy.overall}%`,
          detail: T('ui.calendar.macroAccuracyDetail'),
        }),
      ],
    }),

    el('div', { className: 'actions' }, [
      Button({
        label: T('ui.calendar.regenerate'), variant: 'primary',
        onClick: () => {
          PlanningService.regenerate();
          toast(t('ui.calendar.regenerated'), { tone: 'success' });
          render(host);
        },
      }),
    ]),

    ReasonList({ reasons: plan.reasons, title: T('ui.calendar.whyWeek'), limit: 8 }),
  );
}

export default {
  render() {
    const host = el('div', { className: 'stack' }, [Skeleton({ lines: 7 })]);
    return PageFrame({ lead: T('ui.calendar.lead'), children: [host] });
  },

  mount(node) {
    const host = node.querySelector('.stack');
    render(host);
    teardown = live([EVENTS.WEEK_GENERATED, EVENTS.WORKOUT_COMPLETED, EVENTS.RUN_COMPLETED], () => render(host));
  },

  unmount() { teardown?.(); teardown = null; },
};
