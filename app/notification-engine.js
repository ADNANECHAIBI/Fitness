/**
 * notification-engine.js — turning events into things worth telling someone.
 *
 * It listens to the bus and writes Notification records. It holds no UI, no
 * wording for a particular screen, and no judgement of its own: every
 * threshold it checks is read from constants, and every number it quotes was
 * produced by an engine.
 */

import { bus, EVENTS } from '../events/index.js';
import { NotificationRepository, unreadNotifications, trimNotifications } from '../repositories/index.js';
import { NOTIFICATION } from '../engines/constants.js';
import { today } from '../models/index.js';
import { createLogger } from '../scripts/logger.js';

const log = createLogger('notifications');

const { TYPE, PRIORITY } = NOTIFICATION;

let subscriptions = [];

/** Create a notification, unless the same one already exists today. */
function create({ type, title, message = '', priority = PRIORITY.NORMAL, source = null, reference = null, date = today() }) {
  const duplicate = NotificationRepository.find(
    (note) => note.type === type && note.date === date && note.reference === reference)[0];

  if (duplicate) return duplicate;

  try {
    const note = NotificationRepository.create({ type, title, message, priority, source, reference, date });
    trimNotifications();
    bus.emit(EVENTS.NOTIFICATION_CREATED, note);
    return note;
  } catch (error) {
    log.error('[notifications] could not create', error);
    return null;
  }
}

/** Wire the engine to the bus. Call once, at boot. @returns {Function} teardown */
export function startNotifications() {
  stopNotifications();

  const on = (topic, handler) => subscriptions.push(bus.on(topic, handler));

  on(EVENTS.WEEK_GENERATED, (payload) => create({
    type: TYPE.PLAN_GENERATED,
    title: `Week ${payload.weekNumber} is ready`,
    message: 'Training, running, nutrition and meals have all been planned.',
    source: 'PlanningService',
    reference: payload.weekStart,
  }));

  on(EVENTS.WORKOUT_COMPLETED, (payload) => create({
    type: TYPE.WEEK_COMPLETED,
    title: 'Session logged',
    message: `${payload.completion}% of the planned sets were completed.`,
    source: 'ExecutionService',
    reference: payload.sessionId ?? payload.date,
    priority: PRIORITY.LOW,
  }));

  on(EVENTS.PR_ACHIEVED, (payload) => create({
    type: TYPE.NEW_PR,
    title: 'New personal record',
    message: `${payload.record.type.replace(/_/g, ' ')} on ${payload.record.exerciseId}: ${payload.record.value} ${payload.record.unit}.`,
    priority: PRIORITY.HIGH,
    source: 'ExecutionEngine',
    reference: `${payload.record.exerciseId}-${payload.record.type}`,
  }));

  on(EVENTS.WEIGHT_CHANGED, (payload) => create({
    type: TYPE.WEIGHT_UPDATED,
    title: 'Weight updated',
    message: payload.delta === null
      ? `Recorded at ${payload.current} kg.`
      : `${payload.current} kg, ${payload.delta > 0 ? 'up' : 'down'} ${Math.abs(payload.delta)} kg.`,
    priority: PRIORITY.LOW,
    source: 'WeightService',
    reference: payload.date,
  }));

  on(EVENTS.RUN_COMPLETED, (payload) => create({
    type: TYPE.WEEK_COMPLETED,
    title: 'Run logged',
    message: `${payload.completion}% of the planned distance.`,
    priority: PRIORITY.LOW,
    source: 'RunningExecutionEngine',
    reference: payload.date,
  }));

  on(EVENTS.SESSION_SKIPPED, (payload) => create({
    type: TYPE.WORKOUT_MISSED,
    title: 'Session skipped',
    message: 'Nothing was logged, so next week\'s loads are unchanged.',
    source: 'ExecutionService',
    reference: payload.date,
  }));

  on(EVENTS.RUN_SKIPPED, (payload) => create({
    type: TYPE.RUNNING_MISSED,
    title: 'Run skipped',
    message: 'The week\'s distance will be built from the runs that happened.',
    priority: PRIORITY.LOW,
    source: 'RunningProgramService',
    reference: payload.date,
  }));

  /* Intake shortfalls, judged against the nutrition engine's own targets. */
  on(EVENTS.NUTRITION_LOGGED, (record) => {
    const target = currentTargets();
    if (!target) return;

    if (record.proteinG !== null && record.proteinG < target.proteinG * NOTIFICATION.LOW_INTAKE_SHARE) {
      create({
        type: TYPE.PROTEIN_LOW,
        title: 'Protein under target',
        message: `${record.proteinG} g logged against a target of ${target.proteinG} g.`,
        source: 'NutritionEngine',
        reference: record.date,
      });
    }

    if (record.calories !== null && record.calories < target.calories * NOTIFICATION.LOW_INTAKE_SHARE) {
      create({
        type: TYPE.CALORIES_LOW,
        title: 'Calories under target',
        message: `${record.calories} kcal logged against a target of ${target.calories}.`,
        priority: PRIORITY.LOW,
        source: 'NutritionEngine',
        reference: record.date,
      });
    }
  });

  return stopNotifications;
}

/** The current day's targets, read from the nutrition week. */
function currentTargets() {
  // Imported lazily so the notification engine can be started in isolation.
  try {
    // eslint-disable-next-line global-require
    const { NutritionPlanService } = globalThis.__foundationServices ?? {};
    const day = NutritionPlanService?.day?.(today());
    return day ? { calories: day.calories, proteinG: day.proteinG } : null;
  } catch {
    return null;
  }
}

/** Remove every subscription. */
export function stopNotifications() {
  subscriptions.forEach((off) => off());
  subscriptions = [];
}

export const NotificationEngine = Object.freeze({
  start: startNotifications,
  stop: stopNotifications,

  all() { return NotificationRepository.all(); },
  unread() { return unreadNotifications(); },

  markRead(id) {
    try { return NotificationRepository.update(id, { read: true }); }
    catch { return null; }
  },

  markAllRead() {
    let count = 0;
    for (const note of unreadNotifications()) {
      if (this.markRead(note.id)) count += 1;
    }
    return count;
  },

  clear() { NotificationRepository.clear(); },

  /** Create one directly. Used by services that notice something themselves. */
  create,

  TYPE, PRIORITY,
});
