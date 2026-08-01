/**
 * Dashboard — today, from every engine at once.
 *
 * It reads one object: the DashboardSnapshot the application layer assembles.
 * It calculates nothing.
 */

import { Card, StatCard, ListRow, ListGroup, ReasonList, ProgressBar, EmptyState, Skeleton } from '../components/index.js';
import { PageFrame } from './page-frame.js';
import { live, swap } from './live-region.js';
import { el } from '../scripts/dom.js';
import { T } from '../scripts/language.js';
import { Queries } from '../app/index.js';
import { EVENTS } from '../events/index.js';
import { createLogger } from '../scripts/logger.js';

const log = createLogger('ui');

/**
 * A task's label or detail. The application layer names it and supplies the
 * numbers; anything an engine wrote comes through as it was written.
 */
const taskText = (task, part) => (task[`${part}Key`]
  ? T(task[`${part}Key`], task[`${part}Vars`])
  : task[`${part}Text`] ?? '');

let teardown = null;

/** Everything the dashboard shows, from one snapshot. */
function render(host) {
  let snapshot;
  try {
    snapshot = Queries.getToday();
  } catch (error) {
    log.error('[dashboard]', error);
    swap(host, EmptyState({
      title: T('ui.dashboard.noPlanTitle'),
      message: T('ui.dashboard.noPlanMessage'),
      actionLabel: T('ui.dashboard.openProfile'), actionLink: '/profile',
    }));
    return;
  }

  const { tasks, workout, running, nutrition, meals, recovery, weeklyProgress, notifications } = snapshot;

  const remaining = nutrition?.remaining;
  const eaten = nutrition && remaining
    ? Math.max(0, nutrition.calories - remaining.calories)
    : 0;

  swap(host,
    /* Today's list. */
    tasks.length
      ? ListGroup({
          title: T('ui.dashboard.today'),
          rows: tasks.map((task) => ListRow({
            label: taskText(task, 'label'),
            detail: taskText(task, 'detail'),
            value: task.inProgress ? T('ui.dashboard.inProgress') : '',
            tone: task.done ? 'done' : 'default',
            link: { workout: '/gym', running: '/running', meals: '/meals' }[task.kind] ?? null,
          })),
        })
      : EmptyState({
          title: T('ui.dashboard.nothingTodayTitle'),
          message: T('ui.dashboard.nothingTodayMessage'),
        }),

    /* The numbers. */
    el('section', { className: 'section' }, [
      el('div', { className: 'grid' }, [
        StatCard({
          label: T('ui.dashboard.caloriesLeft'),
          value: remaining ? remaining.calories : (nutrition?.calories ?? '—'),
          unit: T('ui.unit.kcal'),
          hint: remaining?.logged
            ? T('ui.dashboard.eaten', { n: eaten })
            : T('ui.dashboard.nothingLogged'),
          link: '/nutrition',
        }),
        StatCard({
          label: T('ui.dashboard.proteinLeft'),
          value: remaining ? remaining.proteinG : (nutrition?.proteinG ?? '—'),
          unit: T('ui.unit.g'),
          link: '/nutrition',
        }),
      ]),

      nutrition ? ProgressBar({
        value: nutrition.calories ? (eaten / nutrition.calories) * 100 : 0,
        label: T('ui.dashboard.intake'),
        detail: T('ui.dashboard.intakeDetail', { eaten, total: nutrition.calories }),
      }) : null,
    ]),

    /* Training. */
    el('section', { className: 'section' }, [
      el('div', { className: 'grid' }, [
        workout
          ? Card({
              eyebrow: T('ui.dashboard.lifting'), title: workout.goal, link: '/gym',
              body: T('ui.dashboard.sessionDetail', {
                count: workout.exercises, minutes: workout.estimatedMinutes,
              }),
            })
          : Card({
              eyebrow: T('ui.dashboard.lifting'), title: T('ui.dashboard.rest'),
              body: T('ui.dashboard.noSessionToday'), link: '/gym',
            }),

        running
          ? Card({
              eyebrow: T('ui.dashboard.running'), title: running.type.replace(/-/g, ' '), link: '/running',
              body: T('ui.dashboard.runDetail', { km: running.distanceKm, pace: running.targetPace }),
            })
          : Card({
              eyebrow: T('ui.dashboard.running'), title: T('ui.dashboard.noRun'),
              body: T('ui.dashboard.nothingPlannedToday'), link: '/running',
            }),

        meals
          ? Card({
              variant: 'wide', eyebrow: T('ui.dashboard.meals'), link: '/meals',
              title: T('ui.dashboard.mealsCount', { n: meals.count }),
              body: T('ui.dashboard.mealsDetail', {
                mad: meals.costMad, minutes: meals.prepMinutes,
              }),
            })
          : null,
      ]),
    ]),

    /* Recovery and the week. */
    ListGroup({
      title: T('ui.common.thisWeek'),
      rows: [
        ListRow({
          label: T('ui.dashboard.recovery'), value: recovery.status,
          detail: recovery.strainIndex !== null
            ? T('ui.dashboard.strain', { n: recovery.strainIndex }) : '',
        }),
        ListRow({ label: T('ui.dashboard.liftingDays'), value: String(weeklyProgress.gymDaysPlanned) }),
        ListRow({ label: T('ui.dashboard.runningDays'), value: String(weeklyProgress.runningDaysPlanned) }),
        ListRow({ label: T('ui.dashboard.restDays'), value: String(weeklyProgress.restDays) }),
      ],
    }),

    notifications.length
      ? ListGroup({
          title: T('ui.dashboard.notifications'),
          rows: notifications.slice(0, 4).map((note) => ListRow({ label: note.title, detail: note.message })),
        })
      : null,

    ReasonList({ reasons: snapshot.reasons, title: T('ui.dashboard.whyThisWeek'), limit: 8 }),
  );
}

export default {
  render() {
    const host = el('div', { className: 'stack' }, [Skeleton({ cards: 4 })]);
    return PageFrame({ children: [host] });
  },

  mount(node) {
    const host = node.querySelector('.stack');
    render(host);

    teardown = live([
      EVENTS.WORKOUT_COMPLETED, EVENTS.RUN_COMPLETED, EVENTS.NUTRITION_LOGGED,
      EVENTS.WEIGHT_CHANGED, EVENTS.WEEK_GENERATED, EVENTS.NOTIFICATION_CREATED,
      EVENTS.SESSION_STARTED, EVENTS.SET_COMPLETED,
    ], () => render(host));
  },

  unmount() { teardown?.(); teardown = null; },
};
