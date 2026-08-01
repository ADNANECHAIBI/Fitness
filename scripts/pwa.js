import { createLogger } from './logger.js';

const log = createLogger('pwa');

/**
 * pwa.js — service worker registration and install state.
 *
 * The service worker is what makes the app open offline. It only registers on
 * a secure origin (https, or http://localhost during development).
 */

/** Register the service worker after load so it never blocks first paint. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    log.info('[pwa] service workers unsupported — running online only');
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('service-worker.js');
      log.info('[pwa] service worker ready', registration.scope);
    } catch (error) {
      log.warn('[pwa] registration failed', error);
    }
  });
}

/** True when the app was launched from the home screen, not from a browser. */
export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true   // iOS Safari
  );
}
