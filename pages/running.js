/**
 * Running — today's run, and logging it.
 */

import { Button, ReasonList, ListGroup, ListRow, EmptyState, Skeleton, toast } from '../components/index.js';
import { PageFrame } from './page-frame.js';
import { live, swap } from './live-region.js';
import { el } from '../scripts/dom.js';
import { T, t } from '../scripts/language.js';
import { Queries, Actions } from '../app/index.js';
import { EVENTS } from '../events/index.js';

let teardown = null;
let execution = null;

function render(host) {
  const session = Queries.getRunToday();

  if (!session) {
    swap(host, EmptyState({
      title: T('ui.running.noRunTitle'),
      message: T('ui.running.noRunMessage'),
      actionLabel: T('ui.gym.seeWeek'), actionLink: '/calendar',
    }));
    return;
  }

  swap(host,
    el('section', { className: 'section' }, [
      el('h2', { className: 'section__title', text: session.type.replace(/-/g, ' ') }),
      el('p', { className: 'section__note', text: session.goal }),
    ]),

    ListGroup({
      title: T('ui.running.session'),
      rows: [
        ListRow({ label: T('ui.running.distance'), value: `${session.distanceKm} ${T('ui.unit.km')}` }),
        ListRow({ label: T('ui.running.targetPace'), value: `${session.targetPace} ${T('ui.unit.perKm')}` }),
        ListRow({
          label: T('ui.running.time'), value: `${session.totalMinutes} ${T('ui.unit.min')}`,
          detail: T('ui.running.timeDetail'),
        }),
        session.heartRateZone
          ? ListRow({
              label: T('ui.running.heartRate'),
              value: T('ui.running.heartRateValue', {
                low: session.heartRateZone.lowBpm, high: session.heartRateZone.highBpm,
              }),
              detail: T('ui.running.heartRateDetail'),
            })
          : null,
      ].filter(Boolean),
    }),

    ListGroup({
      title: T('ui.running.structure'),
      rows: [
        ListRow({
          label: T('ui.running.warmup', { minutes: session.warmup.minutes }),
          detail: session.warmup.description,
        }),
        ListRow({ label: T('ui.running.mainSet'), detail: session.mainSet.description }),
        ListRow({
          label: T('ui.running.cooldown', { minutes: session.cooldown.minutes }),
          detail: session.cooldown.description,
        }),
      ],
    }),

    session.notes ? el('p', { className: 'section__note', text: session.notes }) : null,

    controls(session, host),

    ReasonList({ reasons: [session.reason].filter(Boolean), title: T('ui.running.whyRun') }),
  );
}

function controls(session, host) {
  if (!execution) {
    return el('div', { className: 'actions' }, [
      Button({
        label: T('ui.running.startRun'), variant: 'primary',
        onClick: () => {
          const outcome = Actions.startRun(session.date);
          if (outcome.rejected) toast(outcome.rejected.message, { tone: 'error' });
          else { execution = outcome.session; render(host); }
        },
      }),
      Button({
        label: T('ui.common.skip'), variant: 'ghost',
        onClick: () => {
          const started = Actions.startRun(session.date);
          if (started.rejected) { toast(started.rejected.message, { tone: 'error' }); return; }

          const outcome = Actions.skipRun(started.session, { reason: 'skipped from the app' });
          toast(outcome.session.reasons.at(-1)?.message ?? t('ui.running.runSkipped'));
          execution = null;
          render(host);
        },
      }),
    ]);
  }

  return el('div', { className: 'actions' }, [
    Button({
      label: T('ui.running.finishAsPlanned'), variant: 'primary',
      onClick: () => {
        const outcome = Actions.finishRun(execution, {
          distanceKm: session.distanceKm,
          durationMin: session.durationMin,
        });

        if (outcome.rejected) { toast(outcome.rejected.message, { tone: 'error' }); return; }

        toast(outcome.session.reasons[0]?.message ?? t('ui.running.runLogged'), { tone: 'success' });
        execution = null;
        render(host);
      },
    }),
    Button({
      label: T('ui.common.cancel'), variant: 'ghost',
      onClick: () => {
        const outcome = Actions.cancelRun(execution, { reason: 'cancelled from the app' });
        if (!outcome.rejected) { execution = null; render(host); }
      },
    }),
  ]);
}

export default {
  render() {
    const host = el('div', { className: 'stack' }, [Skeleton({ lines: 4 })]);
    return PageFrame({ lead: T('ui.running.lead'), children: [host] });
  },

  mount(node) {
    const host = node.querySelector('.stack');
    render(host);
    teardown = live([EVENTS.WEEK_GENERATED, EVENTS.RUN_COMPLETED, EVENTS.RUN_LOGGED], () => render(host));
  },

  unmount() { teardown?.(); teardown = null; execution = null; },
};
