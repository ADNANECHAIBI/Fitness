/**
 * ProgressRepository — everything that tracks change over time:
 * body measurements and the weekly reports built from them.
 *
 * Two collections behind one repository because they are always read together;
 * a page asking about progress should not need to know they are stored apart.
 */

import { createCollectionRepository } from './base-repository.js';
import { BodyMeasurements, WeeklyReport } from '../models/index.js';
import { KEYS } from '../scripts/config.js';

export const MeasurementsRepository = createCollectionRepository({
  key: KEYS.MEASUREMENTS,
  model: BodyMeasurements,
});

export const WeeklyReportRepository = createCollectionRepository({
  key: KEYS.WEEKLY_REPORTS,
  model: WeeklyReport,
  sort: (a, b) => String(b.weekStart).localeCompare(String(a.weekStart)),
});

/** Facade over both, so pages have one thing to talk to. */
export const ProgressRepository = Object.freeze({
  measurements: MeasurementsRepository,
  reports: WeeklyReportRepository,

  /** The most recent measurement session, or null. */
  latestMeasurement() {
    return MeasurementsRepository.all()[0] ?? null;
  },

  /** The most recent weekly report, or null. */
  latestReport() {
    return WeeklyReportRepository.all()[0] ?? null;
  },
});
