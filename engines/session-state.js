/**
 * session-state.js — the state machine both execution engines share.
 *
 * A lifting session and a run move through the same states for the same
 * reasons, so the transitions live here once. What differs is what happens
 * *inside* a started session — sets for one, a single effort for the other —
 * and that stays in each engine.
 *
 * Pure. It knows about states and nothing about training.
 */

import { SESSION_STATE } from './constants.js';

/** Which actions are legal from each state. */
export const BASE_TRANSITIONS = Object.freeze({
  [SESSION_STATE.PLANNED]: ['start', 'skip', 'cancel'],
  [SESSION_STATE.STARTED]: ['pause', 'complete', 'cancel'],
  [SESSION_STATE.PAUSED]: ['resume', 'complete', 'cancel'],
  [SESSION_STATE.COMPLETED]: [],
  [SESSION_STATE.CANCELLED]: [],
  [SESSION_STATE.SKIPPED]: [],
});

/**
 * Build a transition table, adding engine-specific actions to the running
 * state. A lifting session adds logSet; a run adds logSegment.
 *
 * @param {Record<string, string[]>} [extra] state → extra actions
 */
export function transitionsWith(extra = {}) {
  const table = {};
  for (const [state, actions] of Object.entries(BASE_TRANSITIONS)) {
    table[state] = [...actions, ...(extra[state] ?? [])];
  }
  return Object.freeze(table);
}

/** The shape every operation returns. */
export const outcome = (session, events = [], rejected = null) => ({ session, events, rejected });

/** Refuse an action without changing anything. */
export function refuse(session, action, why) {
  return outcome(session, [], { action, state: session.state, message: why });
}

/** Is the action legal right now? */
export function permits(transitions, session, action) {
  return (transitions[session.state] ?? []).includes(action);
}

export const nowISO = () => new Date().toISOString();

/** Seconds a session spent paused, given when it resumed. */
export function pauseDuration(pausedAt, resumedAt) {
  if (!pausedAt) return 0;
  const seconds = Math.round((new Date(resumedAt) - new Date(pausedAt)) / 1000);
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

export { SESSION_STATE };
