/** SessionRepository — every attempted training session. */

import { createCollectionRepository } from './base-repository.js';
import { WorkoutSession } from '../models/index.js';
import { KEYS } from '../scripts/config.js';

export const SessionRepository = createCollectionRepository({
  key: KEYS.SESSIONS,
  model: WorkoutSession,
});

/** The session in progress, if there is one. @returns {object|null} */
export function activeSession() {
  return SessionRepository.find(
    (session) => session.state === 'started' || session.state === 'paused'
  )[0] ?? null;
}
