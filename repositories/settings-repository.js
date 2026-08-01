/** SettingsRepository — the single Settings document. */

import { createDocumentRepository } from './base-repository.js';
import { Settings } from '../models/index.js';
import { KEYS } from '../scripts/config.js';
import { EVENTS } from '../events/index.js';

export const SettingsRepository = createDocumentRepository({
  key: KEYS.SETTINGS,
  model: Settings,
  event: EVENTS.SETTINGS_CHANGED,
});
