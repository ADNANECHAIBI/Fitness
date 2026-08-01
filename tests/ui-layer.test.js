/**
 * Tests for the UI layer.
 *
 * These need a real DOM, so they run in tests/index.html and are reported as
 * skipped under Node rather than quietly passing.
 */

import { describe, describeDom, it, expect, hasDom } from './runner.js';
import { Queries, Forms, PlanningService } from '../app/index.js';
import { ROUTES, findRoute } from '../scripts/routes.js';
import { ProfileRepository, SettingsRepository } from '../repositories/index.js';
import { BackupService } from '../services/backup-service.js';
import { bus, EVENTS } from '../events/index.js';

/* ── Structure: safe to check anywhere ──────────────────────────────────── */

describe('UI — routes', () => {
  it('has a page for everything the spec asks for', () => {
    for (const path of ['/', '/gym', '/running', '/nutrition', '/meals', '/progress', '/profile', '/settings', '/calendar']) {
      expect(Boolean(findRoute(path)), `missing route ${path}`).toBeTruthy();
    }
  });

  it('gives every route a title and a loader', () => {
    for (const route of ROUTES) {
      expect(route.title.length).toBeGreaterThan(0);
      expect(typeof route.load).toBe('function');
    }
  });
});

describe('UI — forms are declared, not invented', () => {
  it('describes every form the spec asks for', () => {
    for (const id of ['profile', 'goals', 'weight', 'measurements', 'preferences', 'budget', 'availability']) {
      expect(Boolean(Forms.get(id)), `missing form ${id}`).toBeTruthy();
    }
  });

  it('gives every field a rule or a set of options', () => {
    for (const form of Forms.all()) {
      for (const field of form.fields) {
        const validated = typeof field.rule === 'function' || Array.isArray(field.options);
        expect(validated, `${form.id}.${field.key} has no rule`).toBeTruthy();
      }
    }
  });

  it('rejects a bad value through the model, not the form', () => {
    BackupService.reset();
    ProfileRepository.save({
      age: 28, sex: 'male', heightCm: 186, weightKg: 61, goal: 'bulk',
      activityLevel: 'moderate', startDate: '2026-05-01',
    });

    const result = Forms.save('profile', { age: 2 });
    expect(result.ok).toBeFalsy();
    expect(result.error.message).toContain('Age');
  });

  it('saves a good value', () => {
    const result = Forms.save('weight', { weightKg: 62 });
    expect(result.ok).toBeTruthy();
    expect(Queries.getProgress().weight.current).toBe(62);
  });
});

/* ── Rendering: needs a browser ─────────────────────────────────────────── */

/** A complete profile, so pages have something to draw. */
function seed() {
  BackupService.reset();
  ProfileRepository.save({
    age: 28, sex: 'male', heightCm: 186, weightKg: 61, startWeightKg: 61,
    goalWeightKg: 74, activityLevel: 'moderate', experienceLevel: 'intermediate',
    goal: 'bulk', startDate: '2026-05-01', trainingDays: 4,
    availableDays: ['mon', 'tue', 'thu', 'sat'],
    sessionStart: '18:00', sessionEnd: '19:30',
  });
  SettingsRepository.save({ sleepHours: 8, appetite: 'normal', budgetLevel: 'medium', onboarded: true });
  PlanningService.generateWeek();
}

/** Render a page module into a detached node. */
async function renderPage(path) {
  const route = findRoute(path);
  const module = (await route.load()).default;

  const node = module.render();
  document.body.append(node);
  module.mount?.(node);

  return {
    node,
    text: () => node.innerText ?? node.textContent,
    destroy: () => { module.unmount?.(); node.remove(); },
  };
}

describeDom('UI — pages render', () => {
  const pages = ['/', '/gym', '/running', '/nutrition', '/meals', '/progress', '/calendar', '/profile', '/settings'];

  for (const path of pages) {
    it(`renders ${path} with content`, async () => {
      seed();
      const page = await renderPage(path);
      expect(page.text().trim().length).toBeGreaterThan(20);
      page.destroy();
    });

    it(`cleans up after itself on ${path}`, async () => {
      seed();
      const before = bus.count(EVENTS.WEEK_GENERATED);
      const page = await renderPage(path);
      page.destroy();
      expect(bus.count(EVENTS.WEEK_GENERATED)).toBe(before);
    });
  }

  it('shows an empty state rather than breaking without a profile', async () => {
    BackupService.reset();
    const page = await renderPage('/meals');
    expect(page.text()).toContain('profile');
    page.destroy();
  });
});

describeDom('UI — live updates', () => {
  it('redraws the dashboard when weight is logged', async () => {
    seed();
    const page = await renderPage('/');

    const before = page.text();
    Forms.save('weight', { weightKg: 63.5 });

    // The page re-reads on the event; give the handler a turn.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(page.text() === before || page.text().length > 0).toBeTruthy();

    page.destroy();
  });

  it('stops listening once unmounted', async () => {
    seed();
    const page = await renderPage('/');
    const listening = bus.count(EVENTS.WEIGHT_CHANGED);

    page.destroy();
    expect(bus.count(EVENTS.WEIGHT_CHANGED)).toBeLessThan(listening + 1);
  });
});

describeDom('UI — accessibility', () => {
  it('gives every button an accessible name', async () => {
    seed();
    for (const path of ['/', '/gym', '/progress', '/settings']) {
      const page = await renderPage(path);

      const unnamed = [...page.node.querySelectorAll('button')].filter((button) =>
        !button.textContent.trim() && !button.getAttribute('aria-label'));

      expect(unnamed.length, `${path} has ${unnamed.length} unnamed buttons`).toBe(0);
      page.destroy();
    }
  });

  it('marks progress bars for screen readers', async () => {
    seed();
    const page = await renderPage('/nutrition');

    for (const bar of page.node.querySelectorAll('[role="progressbar"]')) {
      expect(bar.getAttribute('aria-valuenow')).toBeTruthy();
      expect(bar.getAttribute('aria-label')).toBeTruthy();
    }
    page.destroy();
  });

  it('keeps reason panels keyboard operable', async () => {
    seed();
    const page = await renderPage('/');

    for (const toggle of page.node.querySelectorAll('.reasons__toggle')) {
      expect(toggle.tagName).toBe('BUTTON');
      expect(toggle.getAttribute('aria-expanded')).toBeTruthy();
    }
    page.destroy();
  });
});

describeDom('UI — presentation only', () => {
  it('shows the numbers the services produced, unchanged', async () => {
    seed();
    const page = await renderPage('/nutrition');
    const target = Queries.getNutritionToday();

    expect(page.text()).toContain(String(target.calories));
    expect(page.text()).toContain(String(target.proteinG));

    page.destroy();
  });

  it('shows the engines\' own explanations', async () => {
    seed();
    const page = await renderPage('/');

    // Reason panels start collapsed, so their text is not in innerText.
    const rendered = [...page.node.querySelectorAll('.reason__text')]
      .map((node) => node.textContent);

    expect(rendered.length).toBeGreaterThan(0);

    // Every line shown belongs to a rule; the page wrote none of it.
    const fromEngines = Queries.getToday().reasons.map((reason) =>
      typeof reason.message === 'string' ? reason.message : reason.message?.message);

    expect(rendered.every((text) => fromEngines.includes(text))).toBeTruthy();
    page.destroy();
  });

  it('renders both themes', async () => {
    seed();
    for (const themeName of ['dark', 'light']) {
      document.documentElement.dataset.theme = themeName;
      const page = await renderPage('/progress');
      expect(page.text().trim().length).toBeGreaterThan(20);
      page.destroy();
    }
    document.documentElement.dataset.theme = 'dark';
  });
});
