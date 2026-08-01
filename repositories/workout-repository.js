/** WorkoutRepository — every logged set. */

import { createCollectionRepository } from './base-repository.js';
import { Gym } from '../models/index.js';
import { KEYS } from '../scripts/config.js';

export const WorkoutRepository = createCollectionRepository({
  key: KEYS.WORKOUTS,
  model: Gym,
});
