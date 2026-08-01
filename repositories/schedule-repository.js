/** ScheduleRepository — planned training slots. */

import { createCollectionRepository } from './base-repository.js';
import { Schedule, WEEKDAYS } from '../models/index.js';
import { KEYS } from '../scripts/config.js';

export const ScheduleRepository = createCollectionRepository({
  key: KEYS.SCHEDULE,
  model: Schedule,
  // Week order, then time of day — not newest first.
  sort: (a, b) =>
    WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day) ||
    String(a.startTime).localeCompare(String(b.startTime)),
});
