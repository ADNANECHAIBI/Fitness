/**
 * Gym — today's lifting session, and running it.
 *
 * Every button calls a service. The page decides nothing: whether a set counts
 * as failed, whether the session is complete, what the next load should be —
 * all of that is the execution engine's, and this only shows the answer.
 */

import {
  Button, ReasonList, ListGroup, ListRow, EmptyState, Skeleton, toast,
} from '../components/index.js';
import { PageFrame } from './page-frame.js';
import { live, swap } from './live-region.js';
import { el } from '../scripts/dom.js';
import { T, TName, TJoin } from '../scripts/language.js';
import { Queries, Actions } from '../app/index.js';
import { EVENTS } from '../events/index.js';

let teardown = null;
let session = null;

function render(host) {
  const day = Queries.getWorkoutToday();
  session = Actions.activeSession();

  if (!day) {
    swap(host, EmptyState({
      title: T('ui.gym.noSessionTitle'),
      message: T('ui.gym.noSessionMessage'),
      actionLabel: T('ui.gym.seeWeek'), actionLink: '/calendar',
    }));
    return;
  }

  const exercises = session ? session.exercises : day.exercises;

  swap(host,
    el('section', { className: 'section' }, [
      el('h2', { className: 'section__title', text: day.goal }),
      el('p', {
        className: 'section__note',
        text: T('ui.gym.summary', {
          count: day.exercises.length,
          minutes: day.estimatedMinutes,
          muscles: TJoin('muscle', day.targetMuscles),
        }),
      }),
    ]),

    el('div', { className: 'section' }, exercises.map((exercise, index) =>
      exerciseCard({ exercise, planned: day.exercises[index], host })
    )),

    controls(day, host),

    ReasonList({ reasons: day.reasons, title: T('ui.gym.whySession'), limit: 6 }),
  );
}

/** One exercise: the prescription, the sets done, and why it is here. */
function exerciseCard({ exercise, planned, host }) {
  const source = planned ?? exercise;
  const sets = exercise.sets ?? source.sets;
  const isSession = Array.isArray(exercise.sets);

  const prescribedSets = isSession ? exercise.plannedSets : source.sets;
  const prescribedReps = isSession ? exercise.plannedReps : source.reps;
  const load = isSession ? exercise.plannedWeightKg : source.targetLoadKg;

  const dots = isSession
    ? Array.from({ length: prescribedSets }, (_, i) => {
        const logged = exercise.sets[i];
        return el('span', {
          className: `set-dot${logged ? (logged.failed ? ' is-failed' : ' is-done') : ''}`,
          text: logged ? String(logged.reps) : String(i + 1),
        });
      })
    : [];

  return el('article', { className: 'exercise' }, [
    el('div', { className: 'exercise__head' }, [
      el('h3', {
        className: 'exercise__name',
        text: TName('exercise', exercise.exerciseId, exercise.name),
      }),
      el('span', {
        className: 'exercise__prescription',
        text: load
          ? T('ui.gym.prescriptionLoad', { sets: prescribedSets, reps: prescribedReps, load })
          : T('ui.gym.prescription', { sets: prescribedSets, reps: prescribedReps }),
      }),
    ]),

    el('p', {
      className: 'exercise__meta',
      text: T('ui.gym.meta', { rpe: source.rpe, rest: source.restSec })
        + (source.tempo ? T('ui.gym.metaTempo', { tempo: source.tempo }) : '')
        + (source.warmupSets ? T('ui.gym.metaWarmup', { n: source.warmupSets }) : ''),
    }),

    source.notes && el('p', { className: 'exercise__meta', text: source.notes }),

    dots.length ? el('div', { className: 'exercise__sets' }, dots) : null,

    session ? el('div', { className: 'actions', style: { marginTop: '0.75rem' } }, [
      Button({
        label: T('ui.gym.logSet'), size: 'sm',
        onClick: () => logSet(exercise, host),
      }),
      Button({
        label: T('ui.common.skip'), size: 'sm', variant: 'ghost',
        onClick: () => {
          const outcome = Actions.skipExercise(session, exercise.exerciseId, { reason: 'skipped from the app' });
          if (outcome.rejected) toast(outcome.rejected.message, { tone: 'error' });
          else { session = outcome.session; render(host); }
        },
      }),
    ]) : null,

    ReasonList({
      reasons: [source.reason, source.progression?.reason].filter(Boolean),
      title: T('ui.common.why'), limit: 2,
    }),
  ]);
}

/** Log one set at the prescribed numbers. The engine judges it. */
function logSet(exercise, host) {
  const outcome = Actions.logSet(session, exercise.exerciseId, {
    reps: exercise.plannedReps,
    weightKg: exercise.plannedWeightKg ?? 0,
    rpe: exercise.plannedRpe,
    restSec: exercise.plannedRestSec,
  });

  if (outcome.rejected) {
    toast(outcome.rejected.message, { tone: 'error' });
    return;
  }

  session = outcome.session;
  render(host);
}

/** Start, finish or abandon. */
function controls(day, host) {
  if (!session) {
    return el('div', { className: 'actions' }, [
      Button({
        label: T('ui.gym.startSession'), variant: 'primary',
        onClick: () => {
          const outcome = Actions.startWorkout(day.date);
          if (outcome.rejected) toast(outcome.rejected.message, { tone: 'error' });
          else { session = outcome.session; render(host); }
        },
      }),
    ]);
  }

  const progress = Actions.sessionProgress(session);

  return el('div', { className: 'section' }, [
    ListGroup({
      title: T('ui.gym.progress'),
      rows: [
        ListRow({
          label: T('ui.gym.setsCompleted'),
          value: T('ui.gym.setsCompletedValue', {
            done: progress.completedSets, planned: progress.plannedSets,
          }),
        }),
        ListRow({ label: T('ui.gym.failedSets'), value: String(progress.failedSets) }),
      ],
    }),

    el('div', { className: 'actions' }, [
      Button({
        label: T('ui.gym.finishSession'), variant: 'primary',
        onClick: () => {
          const outcome = Actions.finishWorkout(session, { fatigue: null });
          if (outcome.rejected) { toast(outcome.rejected.message, { tone: 'error' }); return; }

          session = null;
          toast(outcome.session.feedback.summary, { tone: 'success' });
          render(host);
        },
      }),
      Button({
        label: T('ui.common.cancel'), variant: 'ghost',
        onClick: () => {
          const outcome = Actions.cancelWorkout(session, { reason: 'cancelled from the app' });
          if (!outcome.rejected) { session = null; render(host); }
        },
      }),
    ]),
  ]);
}

export default {
  render() {
    const host = el('div', { className: 'stack' }, [Skeleton({ lines: 4 })]);
    return PageFrame({ lead: T('ui.gym.lead'), children: [host] });
  },

  mount(node) {
    const host = node.querySelector('.stack');
    render(host);
    teardown = live([EVENTS.WEEK_GENERATED, EVENTS.WORKOUT_COMPLETED, EVENTS.PROFILE_CHANGED], () => render(host));
  },

  unmount() { teardown?.(); teardown = null; session = null; },
};
