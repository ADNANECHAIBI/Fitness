/**
 * Notification — something worth telling the person about.
 *
 * Created by the notification engine from events the engines already emit. It
 * carries no presentation: no colour, no icon, no wording for a particular
 * screen. A consumer decides how to show it.
 */

import { defineSchema, rules } from '../validators/index.js';
import { createModel, today } from './base-model.js';
import { NOTIFICATION } from '../engines/constants.js';

export const NotificationSchema = defineSchema('Notification', {
  type: { rule: rules.oneOf(Object.values(NOTIFICATION.TYPE)), required: true, label: 'Type' },
  date: { rule: rules.isoDate(), required: true, default: today, label: 'Date' },

  title: { rule: rules.string({ min: 2, max: 120 }), required: true, label: 'Title' },
  message: { rule: rules.string({ max: 600 }), label: 'Message' },

  priority: { rule: rules.oneOf(Object.values(NOTIFICATION.PRIORITY)), default: 'normal', label: 'Priority' },
  read: { rule: rules.boolean(), default: false, label: 'Read' },

  /** Where it came from, so a consumer can link to the right place. */
  source: { rule: rules.string({ max: 60 }), label: 'Source' },
  reference: { rule: rules.string({ max: 60 }), label: 'Reference' },
});

export const Notification = createModel(NotificationSchema, { idPrefix: 'note' });
