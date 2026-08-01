/** PlanSnapshotRepository — one record per generated week. */

import { createCollectionRepository } from './base-repository.js';
import { PlanSnapshot } from '../models/plan-snapshot.js';
import { KEYS } from '../scripts/config.js';

export const PlanSnapshotRepository = createCollectionRepository({
  key: KEYS.PLAN_SNAPSHOTS,
  model: PlanSnapshot,
  sort: (a, b) => String(b.weekStart).localeCompare(String(a.weekStart)),
});

/** The snapshot for a week, or null. */
export function snapshotFor(weekStart) {
  return PlanSnapshotRepository.find((snapshot) => snapshot.weekStart === weekStart)[0] ?? null;
}

/** Consecutive most-recent weeks that ran a deficit. */
export function consecutiveDeficitWeeks() {
  let weeks = 0;
  for (const snapshot of PlanSnapshotRepository.all()) {
    if (!snapshot.deficit) break;
    weeks += 1;
  }
  return weeks;
}
