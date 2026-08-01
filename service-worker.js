/* ============================================================================
   service-worker.js — offline app shell.

   Strategy
     • install : pre-cache every file the shell needs to boot.
     • activate: delete caches from older versions.
     • fetch   : navigations → network first, cached index.html on failure.
                 assets     → cache first, network fallback.

   Bump CACHE_VERSION on every release, otherwise browsers keep serving the
   old shell. This file is a classic worker: it cannot import ES modules, so
   the version is duplicated from scripts/config.js on purpose.
   ========================================================================= */

const CACHE_VERSION = 'v2.3.3';
const CACHE_NAME = `foundation-shell-${CACHE_VERSION}`;

/**
 * Everything required to render the dashboard with no network.
 * tests/ is deliberately absent: it is developer tooling, not part of the app.
 */
const SHELL = [
  './index.html',
  './app/actions.js',
  './app/analytics-service.js',
  './app/cache.js',
  './app/coach-service.js',
  './app/dashboard-service.js',
  './app/forms.js',
  './app/index.js',
  './app/insights-service.js',
  './app/notification-engine.js',
  './app/planning-service.js',
  './app/progress-service.js',
  './app/queries.js',
  './app/recovery-service.js',
  './app/report-service.js',
  './app/reporting-service.js',
  './app/sync-service.js',
  './app/wiring.js',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/images/grain.png',
  './components/bottom-navigation.js',
  './components/button.js',
  './components/card.js',
  './components/choice.js',
  './components/field.js',
  './components/form.js',
  './components/header.js',
  './components/index.js',
  './components/list-row.js',
  './components/modal.js',
  './components/progress-bar.js',
  './components/progress-ring.js',
  './components/reason-list.js',
  './components/stat-card.js',
  './components/states.js',
  './components/toast.js',
  './data/exercise-schema.js',
  './data/exercises/corrective.js',
  './data/exercises/index.js',
  './data/exercises/mobility.js',
  './data/exercises/protocols.js',
  './data/exercises/running.js',
  './data/exercises/strength.js',
  './data/food-schema.js',
  './data/foods/dairy-fats.js',
  './data/foods/index.js',
  './data/foods/produce.js',
  './data/foods/proteins.js',
  './data/foods/staples.js',
  './data/i18n/ar.js',
  './data/i18n/en.js',
  './data/i18n/index.js',
  './data/index.js',
  './data/taxonomy.js',
  './engines/adjustment-engine.js',
  './engines/analytics-context.js',
  './engines/analytics-engine.js',
  './engines/backup-engine.js',
  './engines/backup-migration.js',
  './engines/backup-schema.js',
  './engines/backup-validation.js',
  './engines/body-engine.js',
  './engines/calculation-engine.js',
  './engines/coach-advice.js',
  './engines/coach-context.js',
  './engines/coach-engine.js',
  './engines/constants.js',
  './engines/dashboard-context.js',
  './engines/dashboard-engine.js',
  './engines/energy-engine.js',
  './engines/execution-engine.js',
  './engines/formula.js',
  './engines/index.js',
  './engines/insight.js',
  './engines/insights-engine.js',
  './engines/meal-context.js',
  './engines/meal-planning-engine.js',
  './engines/nutrition-context.js',
  './engines/nutrition-engine.js',
  './engines/plan-context.js',
  './engines/planner-engine.js',
  './engines/ranked-record.js',
  './engines/report-context.js',
  './engines/report-explain.js',
  './engines/report-metrics.js',
  './engines/reports-engine.js',
  './engines/running-context.js',
  './engines/running-engine.js',
  './engines/running-execution-engine.js',
  './engines/running-program-engine.js',
  './engines/running-progress-engine.js',
  './engines/session-state.js',
  './engines/strength-engine.js',
  './engines/trend.js',
  './engines/workout-context.js',
  './engines/workout-engine.js',
  './events/event-bus.js',
  './events/events.js',
  './events/index.js',
  './manifest.json',
  './models/base-model.js',
  './models/body-measurements.js',
  './models/goals.js',
  './models/gym.js',
  './models/index.js',
  './models/notification.js',
  './models/nutrition.js',
  './models/plan-snapshot.js',
  './models/profile.js',
  './models/running.js',
  './models/schedule.js',
  './models/settings.js',
  './models/supplements.js',
  './models/weekly-report.js',
  './models/workout-session.js',
  './pages/live-region.js',
  './pages/page-frame.js',
  './pages/calendar.js',
  './pages/dashboard.js',
  './pages/gym.js',
  './pages/meals.js',
  './pages/not-found.js',
  './pages/nutrition.js',
  './pages/onboarding.js',
  './pages/profile.js',
  './pages/progress.js',
  './pages/running.js',
  './pages/settings.js',
  './reporting/charts-engine.js',
  './reporting/constants.js',
  './reporting/documents.js',
  './reporting/index.js',
  './reporting/renderers.js',
  './reporting/report-document.js',
  './repositories/base-repository.js',
  './repositories/goals-repository.js',
  './repositories/index.js',
  './repositories/notification-repository.js',
  './repositories/nutrition-repository.js',
  './repositories/onboarding-repository.js',
  './repositories/plan-snapshot-repository.js',
  './repositories/profile-repository.js',
  './repositories/progress-repository.js',
  './repositories/running-repository.js',
  './repositories/schedule-repository.js',
  './repositories/session-repository.js',
  './repositories/settings-repository.js',
  './repositories/supplements-repository.js',
  './repositories/workout-repository.js',
  './rules/analytics/index.js',
  './rules/analytics/plateau-rules.js',
  './rules/analytics/progress-rules.js',
  './rules/analytics/risk-rules.js',
  './rules/coach/body-rules.js',
  './rules/coach/index.js',
  './rules/coach/life-rules.js',
  './rules/coach/training-rules.js',
  './rules/dashboard/focus-rules.js',
  './rules/dashboard/index.js',
  './rules/dashboard/notification-rules.js',
  './rules/dashboard/risk-rules.js',
  './rules/execution/completion-rules.js',
  './rules/execution/failure-rules.js',
  './rules/execution/index.js',
  './rules/execution/pr-rules.js',
  './rules/gym-rules.js',
  './rules/index.js',
  './rules/insights/consistency-insights.js',
  './rules/insights/index.js',
  './rules/insights/nutrition-insights.js',
  './rules/insights/progress-insights.js',
  './rules/insights/training-insights.js',
  './rules/meals/appetite-rules.js',
  './rules/meals/budget-rules.js',
  './rules/meals/food-priority.js',
  './rules/meals/index.js',
  './rules/meals/meal-distribution.js',
  './rules/meals/meal-selection.js',
  './rules/meals/replacement-rules.js',
  './rules/meals/safety-rules.js',
  './rules/meals/timing-rules.js',
  './rules/nutrition-rules.js',
  './rules/nutrition/bulk-rules.js',
  './rules/nutrition/calorie-rules.js',
  './rules/nutrition/cut-rules.js',
  './rules/nutrition/diet-break-rules.js',
  './rules/nutrition/hydration-rules.js',
  './rules/nutrition/index.js',
  './rules/nutrition/macro-rules.js',
  './rules/nutrition/recovery-rules.js',
  './rules/nutrition/refeed-rules.js',
  './rules/nutrition/safety-rules.js',
  './rules/phase-rules.js',
  './rules/recovery-rules.js',
  './rules/reports/achievement-rules.js',
  './rules/reports/index.js',
  './rules/reports/recommendation-rules.js',
  './rules/reports/warning-rules.js',
  './rules/rule.js',
  './rules/running-rules.js',
  './rules/running/index.js',
  './rules/running/load-rules.js',
  './rules/running/progression-rules.js',
  './rules/running/recovery-rules.js',
  './rules/running/session-type-rules.js',
  './rules/workout/corrective-training.js',
  './rules/workout/equipment-rules.js',
  './rules/workout/exercise-selection.js',
  './rules/workout/index.js',
  './rules/workout/injury-rules.js',
  './rules/workout/progressive-overload.js',
  './rules/workout/recovery-rules.js',
  './rules/workout/split-rules.js',
  './rules/workout/volume-rules.js',
  './script.js',
  './scripts/config.js',
  './scripts/dom.js',
  './scripts/language.js',
  './scripts/logger.js',
  './scripts/pwa.js',
  './scripts/router.js',
  './scripts/routes.js',
  './scripts/safe-json.js',
  './scripts/storage.js',
  './scripts/theme.js',
  './services/adjustment-service.js',
  './services/backup-service.js',
  './services/calories-service.js',
  './services/execution-service.js',
  './services/index.js',
  './services/meal-plan-service.js',
  './services/nutrition-plan-service.js',
  './services/nutrition-service.js',
  './services/planner-service.js',
  './services/reactions.js',
  './services/running-program-service.js',
  './services/running-service.js',
  './services/weight-service.js',
  './services/workout-plan-service.js',
  './services/workout-service.js',
  './style.css',
  './styles/base.css',
  './styles/components.css',
  './styles/layout.css',
  './styles/themes.css',
  './styles/tokens.css',
  './styles/transitions.css',
  './validators/errors.js',
  './validators/index.js',
  './validators/rules.js',
  './validators/schema.js',
];

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith('foundation-shell-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle same-origin GETs. Everything else goes straight to the network.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Page loads: serve the cached shell instantly, refresh it in the background.
  // Routing happens on the client, so every in-scope URL resolves to index.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        const fresh = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
            }
            return response;
          })
          .catch(() => cached);

        return cached || fresh;
      })
    );
    return;
  }

  // Assets: serve from cache, then fill the cache in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        // Only cache complete, same-origin responses.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
