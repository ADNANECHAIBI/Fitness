/**
 * tests/index.js — the whole suite.
 * Importing a file is what registers its tests, so order does not matter.
 *
 * The language manager holds no labels of its own; script.js hands it the
 * i18n module at boot. The suite has no script.js, so it does the same thing
 * here — otherwise every page under test renders translation keys, which is
 * the manager behaving correctly and the test being wrong about it.
 */

import { language } from '../scripts/language.js';
import * as i18n from '../data/i18n/index.js';

language.install(i18n).init();

import './calculation-engine.test.js';
import './energy-engine.test.js';
import './body-engine.test.js';
import './strength-engine.test.js';
import './running-engine.test.js';
import './adjustment-engine.test.js';
import './rules.test.js';
import './planner-engine.test.js';
import './exercise-db.test.js';
import './food-db.test.js';
import './workout-engine.test.js';
import './execution-engine.test.js';
import './running-engine.test.js';
import './nutrition-engine.test.js';
import './meal-planning-engine.test.js';
import './reports-engine.test.js';
import './insights-engine.test.js';
import './dashboard-engine.test.js';
import './analytics-engine.test.js';
import './backup-engine.test.js';
import './coach-engine.test.js';
import './reporting.test.js';
import './release.test.js';
import './application-layer.test.js';
import './ui-layer.test.js';
import './architecture.test.js';
import './hardening.test.js';
import './regression.test.js';
import './i18n.test.js';

export { run, reset } from './runner.js';
