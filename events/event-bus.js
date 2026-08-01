/**
 * event-bus.js — the application's Observer implementation.
 *
 * One shared bus. Repositories and services publish; pages subscribe. Nothing
 * subscribes to storage directly, so when the weight changes, every listener
 * hears about it through exactly one path.
 *
 * A failing listener is isolated: its error is logged and reported on the
 * ERROR topic, and the remaining listeners still run. One broken card can
 * never stop the rest of the app from updating.
 */

import { EVENTS, ALL } from './events.js';
import { createLogger } from '../scripts/logger.js';

const log = createLogger('events');

class EventBus {
  /** @type {Map<string, Set<Function>>} */
  #topics = new Map();
  #history = [];
  #historyLimit = 50;

  /**
   * Listen to a topic.
   * @param {string} topic     a value from EVENTS, or ALL for everything
   * @param {(payload: *, topic: string) => void} handler
   * @returns {() => void} unsubscribe — always keep it and call it on unmount
   */
  on(topic, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('event handler must be a function');
    }
    if (!this.#topics.has(topic)) this.#topics.set(topic, new Set());
    this.#topics.get(topic).add(handler);

    return () => this.off(topic, handler);
  }

  /** Listen once; unsubscribes itself after the first delivery. */
  once(topic, handler) {
    const off = this.on(topic, (payload, name) => {
      off();
      handler(payload, name);
    });
    return off;
  }

  /** Stop listening. */
  off(topic, handler) {
    this.#topics.get(topic)?.delete(handler);
  }

  /**
   * Publish a fact. Never throws: a listener that fails is contained.
   * @param {string} topic
   * @param {*} [payload]
   */
  emit(topic, payload = null) {
    this.#remember(topic, payload);

    const direct = this.#topics.get(topic) ?? new Set();
    const wildcard = this.#topics.get(ALL) ?? new Set();

    for (const handler of [...direct, ...wildcard]) {
      try {
        handler(payload, topic);
      } catch (error) {
        log.error(`[events] listener for "${topic}" failed`, error);
        // Report, but only if the failure was not already an error report —
        // otherwise a broken error handler would loop forever.
        if (topic !== EVENTS.ERROR) {
          this.emit(EVENTS.ERROR, { source: topic, error });
        }
      }
    }
  }

  /** How many listeners a topic has. Useful in tests. */
  count(topic) { return this.#topics.get(topic)?.size ?? 0; }

  /** The most recent events, newest last. Debugging aid only. */
  get history() { return [...this.#history]; }

  /** Drop every listener. Used when resetting the app. */
  clear() { this.#topics.clear(); }

  #remember(topic, payload) {
    this.#history.push({ topic, payload, at: Date.now() });
    if (this.#history.length > this.#historyLimit) this.#history.shift();
  }
}

/** Shared instance. Import this, not the class. */
export const bus = new EventBus();
export { EventBus };
