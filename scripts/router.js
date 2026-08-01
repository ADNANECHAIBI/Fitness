/**
 * router.js — client-side router.
 *
 * Behaviour
 *   • no page reloads: pages are ES modules, imported on first visit;
 *   • history.pushState() for every navigation, so the iPhone back gesture
 *     and the browser back/forward buttons work normally;
 *   • directional transitions: forward slides in from the right, back from
 *     the left — the depth counter stored in history.state tells them apart;
 *   • one page mounted at a time; the previous page's unmount() always runs.
 *
 * URL mode (config.ROUTER_MODE)
 *   'hash'    /app/#/gym   — works on any static host, no server config.
 *   'history' /app/gym     — cleaner, but the server must return index.html
 *                            for every in-scope URL or a refresh gives a 404.
 *   Both modes use pushState; only the shape of the URL differs.
 */

import { BASE, ROUTER_MODE } from './config.js';
import { ROUTES, NOT_FOUND, findRoute } from './routes.js';
import { createLogger } from './logger.js';

const log = createLogger('router');

/** How long the leave/enter animations run. Must match styles/transitions.css. */
const LEAVE_MS = 170;
const ENTER_MS = 280;

export class Router {
  #outlet;
  #onChange;
  #guard;
  #current = null;       // { route, module, node }
  #depth = 0;            // history depth, used to detect back vs forward
  #busy = false;

  /**
   * @param {object} options
   * @param {HTMLElement} options.outlet   container the pages render into
   * @param {(route: object) => void} options.onChange  fired after each render
   * @param {(path: string) => string|null} [options.guard]  return a path to
   *        redirect to, or null to allow — used for the first-launch wizard
   */
  constructor({ outlet, onChange = () => {}, guard = null }) {
    this.#outlet = outlet;
    this.#onChange = onChange;
    this.#guard = guard;
  }

  // ── URL translation ─────────────────────────────────────────────────────

  /** Read the current route path out of the address bar. */
  #readPath() {
    if (ROUTER_MODE === 'hash') {
      return location.hash.slice(1) || '/';
    }
    const path = location.pathname.slice(BASE.length - 1);
    return path.startsWith('/') ? path : `/${path}`;
  }

  /** Turn a route path into a full URL for pushState. */
  #toUrl(path) {
    return ROUTER_MODE === 'hash'
      ? `${BASE}#${path}`
      : `${BASE}${path.replace(/^\//, '')}`;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Attach listeners and render the route the app was opened on. */
  start() {
    // Global handler for any element carrying data-link="/path".
    document.addEventListener('click', (event) => {
      const link = event.target.closest('[data-link]');
      if (!link) return;
      event.preventDefault();
      this.navigate(link.dataset.link);
    });

    window.addEventListener('popstate', (event) => {
      const previousDepth = this.#depth;
      this.#depth = event.state?.depth ?? 0;
      const direction = this.#depth < previousDepth ? 'back' : 'forward';
      this.#render(this.#readPath(), direction);
    });

    // Seed history.state so the first entry has a depth to compare against.
    history.replaceState({ depth: 0 }, '', this.#toUrl(this.#readPath()));
    this.#render(this.#readPath(), 'none');
  }

  /**
   * Go to a path.
   * @param {string} path
   * @param {{replace?: boolean}} [options]
   */
  navigate(path, { replace = false } = {}) {
    if (path === this.#current?.route.path) return;   // already there

    if (replace) {
      history.replaceState({ depth: this.#depth }, '', this.#toUrl(path));
    } else {
      this.#depth += 1;
      history.pushState({ depth: this.#depth }, '', this.#toUrl(path));
    }
    this.#render(path, replace ? 'none' : 'forward');
  }

  /** The route currently on screen. */
  get current() { return this.#current?.route ?? null; }

  /**
   * Re-apply the document title and tell the shell which route is active,
   * without re-rendering the page. Called after a navigation, and again when
   * the language changes — the route's title is read through a getter, so it
   * comes back translated with no other work.
   */
  refreshChrome() {
    const route = this.#current?.route;
    if (!route) return;
    document.title = `${route.title} — Foundation`;
    this.#onChange(route);
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  async #render(path, direction) {
    if (this.#busy) return;
    this.#busy = true;

    // A guard may send the visitor somewhere else before anything renders.
    const redirect = this.#guard?.(path);
    if (redirect && redirect !== path) {
      this.#busy = false;
      this.navigate(redirect, { replace: true });
      return;
    }

    const route = findRoute(path) ?? NOT_FOUND;

    let module;
    try {
      module = (await route.load()).default;
    } catch (error) {
      log.error(`[router] could not load "${route.name}"`, error);
      this.#busy = false;
      return;
    }

    const node = module.render();
    node.classList.add('page');

    // Swap runs its animation in the background; mounting does not wait for it,
    // so a page is interactive as soon as it is in the DOM.
    const previous = this.#current;
    this.#swap(node, direction);
    previous?.module.unmount?.();      // release the old page's listeners
    this.#current = { route, module, node };
    module.mount?.(node);

    this.refreshChrome();
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Ignore further navigations until the outgoing page is gone, so rapid
    // taps cannot stack two transitions on top of each other.
    setTimeout(() => { this.#busy = false; }, LEAVE_MS);
  }

  /**
   * Replace the mounted page, animating both directions.
   * Only opacity and transform are animated, so the work stays on the GPU.
   */
  #swap(node, direction) {
    const outgoing = this.#current?.node;

    if (!outgoing || direction === 'none') {
      outgoing?.remove();
      node.classList.add('page--enter-forward');
      this.#outlet.append(node);
      setTimeout(() => node.classList.remove('page--enter-forward'), ENTER_MS);
      return;
    }

    const suffix = direction === 'back' ? 'back' : 'forward';

    // Both pages are absolutely positioned while they cross over, so the
    // layout below never jumps.
    this.#outlet.classList.add('is-swapping');
    outgoing.classList.add(`page--leave-${suffix}`);
    node.classList.add(`page--enter-${suffix}`);
    this.#outlet.append(node);

    setTimeout(() => outgoing.remove(), LEAVE_MS);
    setTimeout(() => {
      node.classList.remove(`page--enter-${suffix}`);
      this.#outlet.classList.remove('is-swapping');
    }, ENTER_MS);
  }
}

export { ROUTES };
