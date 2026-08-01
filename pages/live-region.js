/**
 * live-region.js — keeping a page in step without a manual refresh.
 *
 * A page says which events change what it shows; this subscribes on mount and
 * unsubscribes on unmount. It holds no state and no logic: when something
 * happens, the page re-reads from the application layer.
 */

import { bus } from '../events/index.js';

/**
 * @param {string[]} topics    bus topics that make this page stale
 * @param {() => void} rerender
 * @returns {() => void} teardown
 */
export function live(topics, rerender) {
  const offs = topics.map((topic) => bus.on(topic, rerender));
  return () => offs.forEach((off) => off());
}

/**
 * Replace a node's children, keeping the node itself so the page does not
 * flicker or lose its scroll position.
 */
export function swap(host, ...children) {
  if (!host) return;
  host.replaceChildren(...children.filter(Boolean));
}
