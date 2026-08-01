/**
 * script.js — application entry point.
 *
 * Boots, in order:
 *   1. error net   — nothing thrown anywhere can leave the app blank
 *   2. language    — installed and applied before anything renders, so the
 *                    shell is never built in the wrong language or direction
 *   3. theme       — applied early so the app never flashes the wrong colours
 *   4. reactions   — the wiring between services
 *   5. shell       — header, page outlet, bottom navigation
 *   6. router      — with the first-launch guard
 *   7. service worker
 *
 * The labels are imported here rather than inside the language manager: this
 * file is the only place allowed to reach into every layer, and scripts/ may
 * not import data/. Three small modules on the critical path buy a shell that
 * is right on the first paint instead of flashing English.
 *
 * Keep feature code out of this file.
 */

import { APP, LOG_LEVEL } from './scripts/config.js';
import { storage } from './scripts/storage.js';
import { theme } from './scripts/theme.js';
import { language, t } from './scripts/language.js';
import * as i18n from './data/i18n/index.js';
import { Router } from './scripts/router.js';
import { registerServiceWorker, isStandalone } from './scripts/pwa.js';
import { Header, BottomNavigation, toast } from './components/index.js';
import { NAV_ROUTES } from './scripts/routes.js';
import { el, clear } from './scripts/dom.js';
import { bus, EVENTS } from './events/index.js';
import { wireReactions } from './services/reactions.js';
import { SettingsRepository } from './repositories/index.js';

import { createLogger, Logger } from './scripts/logger.js';

const log = createLogger('app');

/**
 * Catch what escapes everything else. The data layer already contains its own
 * failures; this is the last net, so a bug in one page cannot leave the person
 * staring at a blank screen with no idea what happened.
 */
function installErrorNet() {
  window.addEventListener('error', (event) => {
    log.error('[app] uncaught error', event.error ?? event.message);
    toast(t('ui.error.generic'), { tone: 'error' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    log.error('[app] unhandled rejection', event.reason);
    event.preventDefault();
    toast(t('ui.error.generic'), { tone: 'error' });
  });

  // Failures reported by the data layer itself.
  bus.on(EVENTS.ERROR, ({ source }) => {
    log.warn(`[app] contained failure in ${source}`);
  });
}

function buildShell(root) {
  const header = Header();
  const outlet = el('main', { className: 'main outlet', id: 'outlet' });
  const nav = BottomNavigation({ items: NAV_ROUTES });

  clear(root).append(header, outlet, nav);
  return { header, outlet, nav };
}

/**
 * First launch: everyone who has not finished the wizard is sent to it, and
 * nobody who has finished can wander back into it.
 */
function firstLaunchGuard(path) {
  const onboarded = SettingsRepository.get()?.onboarded === true;

  if (!onboarded && path !== '/welcome') return '/welcome';
  if (onboarded && path === '/welcome') return '/';
  return null;
}

function main() {
  Logger.setLevel(Logger.LEVEL[LOG_LEVEL.toUpperCase()] ?? Logger.LEVEL.INFO);
  installErrorNet();
  language.install(i18n).init();
  theme.init();
  wireReactions();

  const root = document.getElementById('app');
  const { header, outlet, nav } = buildShell(root);

  const router = new Router({
    outlet,
    guard: firstLaunchGuard,
    // Fired after every render: the two shell pieces follow the active route.
    onChange: (route) => {
      header.setTitle(route.title);
      nav.setActive(route.path);
      // The wizard owns the whole screen; the tab bar would only distract.
      document.body.classList.toggle('is-onboarding', route.name === 'onboarding');
    },
  });

  router.start();
  registerServiceWorker();

  /*
   * A language change rewrites every bound node by itself. Two things sit
   * outside the document's node tree and cannot be swept: the document title,
   * and the header heading, which the router overwrites on every navigation.
   * Both are re-applied from the route, which reads its title translated.
   */
  language.subscribe(() => router.refreshChrome());

  /*
   * The application layer pulls in every engine, rule and data file — about
   * 150 modules. Loading it before the first paint delayed the shell by more
   * than a second for nothing: the header and tab bar need none of it, and
   * the first page fetches what it needs itself. So it boots after paint.
   */
  import('./app/index.js')
    .then(({ startApplication }) => startApplication())
    .catch((error) => log.error('the application layer failed to start', error));

  // A restore or a reset changes what the guard would decide — re-run it.
  bus.on(EVENTS.DATA_IMPORTED, () => { theme.init(); language.init(); location.reload(); });
  bus.on(EVENTS.DATA_RESET, () => { location.hash = '#/welcome'; location.reload(); });

  log.info(
    `${APP.name} v${APP.version} — ` +
    `${isStandalone() ? 'standalone' : 'browser'}, ` +
    `theme ${theme.resolved}, ` +
    `language ${language.current} (${language.dir}), ` +
    `storage ${storage.isPersistent ? 'persistent' : 'in-memory only'}`
  );
}

// The module script is deferred by default, so the DOM is already parsed.
main();
