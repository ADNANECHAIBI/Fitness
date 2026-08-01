/** SupplementsRepository — the supplements being taken. */

import { createCollectionRepository } from './base-repository.js';
import { Supplements } from '../models/index.js';
import { KEYS } from '../scripts/config.js';

export const SupplementsRepository = createCollectionRepository({
  key: KEYS.SUPPLEMENTS,
  model: Supplements,
  sort: (a, b) => String(a.name).localeCompare(String(b.name)),
});
