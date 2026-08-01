/** GoalsRepository — the targets being chased. */

import { createCollectionRepository } from './base-repository.js';
import { Goals } from '../models/index.js';
import { KEYS } from '../scripts/config.js';

export const GoalsRepository = createCollectionRepository({
  key: KEYS.GOALS,
  model: Goals,
  sort: (a, b) => String(b.startDate).localeCompare(String(a.startDate)),
});

/** The goals still being worked on. */
export function activeGoals() {
  return GoalsRepository.find((goal) => goal.status === 'active');
}
