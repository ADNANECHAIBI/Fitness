/** RunningRepository — every logged run. */

import { createCollectionRepository } from './base-repository.js';
import { Running } from '../models/index.js';
import { KEYS } from '../scripts/config.js';

export const RunningRepository = createCollectionRepository({
  key: KEYS.RUNS,
  model: Running,
});
