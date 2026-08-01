/** NutritionRepository — one record per day. */

import { createCollectionRepository } from './base-repository.js';
import { Nutrition } from '../models/index.js';
import { KEYS } from '../scripts/config.js';

export const NutritionRepository = createCollectionRepository({
  key: KEYS.NUTRITION,
  model: Nutrition,
});
