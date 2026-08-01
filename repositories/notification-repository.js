/** NotificationRepository — notifications, newest first. */

import { createCollectionRepository } from './base-repository.js';
import { Notification } from '../models/notification.js';
import { KEYS } from '../scripts/config.js';
import { NOTIFICATION } from '../engines/constants.js';

export const NotificationRepository = createCollectionRepository({
  key: KEYS.NOTIFICATIONS,
  model: Notification,
});

/** Unread notifications. */
export function unreadNotifications() {
  return NotificationRepository.find((note) => !note.read);
}

/**
 * Drop the oldest once the list grows past its cap, so a long-running app
 * cannot fill storage with history nobody reads.
 */
export function trimNotifications() {
  const all = NotificationRepository.all();
  if (all.length <= NOTIFICATION.MAX_STORED) return 0;

  const excess = all.slice(NOTIFICATION.MAX_STORED);
  for (const note of excess) NotificationRepository.remove(note.id);
  return excess.length;
}
