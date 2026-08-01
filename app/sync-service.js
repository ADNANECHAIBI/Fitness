/**
 * SyncService — keeping storage and the derived layer in step.
 *
 * There is no server to sync with. What this coordinates is the boundary
 * between what is stored and what is derived: after a restore or a reset,
 * every cache holds answers built from data that no longer exists.
 */

import { BackupService } from '../services/backup-service.js';
import { ALL_REPOSITORIES } from '../repositories/index.js';
import { bus, EVENTS } from '../events/index.js';
import { invalidateAll, stats } from './cache.js';
import { createLogger } from '../scripts/logger.js';

const log = createLogger('sync');

let subscriptions = [];

export const SyncService = Object.freeze({
  /**
   * Watch for anything that replaces stored data underneath the caches.
   * @returns {Function} teardown
   */
  start() {
    this.stop();

    for (const topic of [EVENTS.DATA_IMPORTED, EVENTS.DATA_RESET]) {
      subscriptions.push(bus.on(topic, () => {
        const cleared = invalidateAll();
        log.info(`[sync] ${cleared} caches cleared after ${topic}`);
      }));
    }

    return () => this.stop();
  },

  stop() {
    subscriptions.forEach((off) => off());
    subscriptions = [];
  },

  /** What is stored, by repository. */
  status() {
    const counts = {};
    for (const [name, { repo, kind }] of Object.entries(ALL_REPOSITORIES)) {
      counts[name] = kind === 'document' ? (repo.exists() ? 1 : 0) : repo.count();
    }

    return {
      records: counts,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      caches: stats(),
      checkedAt: new Date().toISOString(),
    };
  },

  /** Export, import and reset, delegated to the service that owns them. */
  export() { return BackupService.export(); },
  exportJSON() { return BackupService.toJSON(); },
  download() { return BackupService.download(); },
  import(source) { return BackupService.import(source); },
  importFile(file) { return BackupService.importFile(file); },
  reset() { return BackupService.reset(); },
});
