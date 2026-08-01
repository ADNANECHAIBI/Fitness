/** ProfileRepository — the single Profile document. */

import { createDocumentRepository } from './base-repository.js';
import { Profile } from '../models/index.js';
import { KEYS } from '../scripts/config.js';
import { EVENTS } from '../events/index.js';

export const ProfileRepository = createDocumentRepository({
  key: KEYS.PROFILE,
  model: Profile,
  event: EVENTS.PROFILE_CHANGED,
});
