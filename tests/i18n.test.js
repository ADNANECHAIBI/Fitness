/**
 * i18n.test.js — the language layer, as a test.
 *
 * What matters here is not that Arabic strings exist. It is that switching
 * language changes text and nothing else: no page rebuilt, no query re-read,
 * no engine run again — and that a key nobody translated shows itself rather
 * than taking the app down.
 */

import { describe, describeDom, it, expect } from './runner.js';
import { language, T, t, TName, TJoin, isTranslated, keyOf } from '../scripts/language.js';
import { el } from '../scripts/dom.js';
import * as i18n from '../data/i18n/index.js';
import { SettingsRepository, ProfileRepository } from '../repositories/index.js';
import { BackupService } from '../services/backup-service.js';
import { PlanningService, Cache, Queries } from '../app/index.js';
import { findRoute, ROUTES, NOT_FOUND } from '../scripts/routes.js';
import { LANGUAGE } from '../models/settings.js';
import { SHELL_FILES } from './shell-files.js';
import { Logger } from '../scripts/logger.js';

/** Keys the interface itself uses, as opposed to labels for records. */
const UI_PREFIXES = ['ui.', 'nav.', 'language.'];
const isUiKey = (key) => UI_PREFIXES.some((prefix) => key.startsWith(prefix));

/** Anything that still looks like a key after rendering is a hole. */
const LEAKED_KEY = /\b(?:ui|nav)\.[a-z][\w.]*/i;

/** Put the app back where the other suites expect to find it. */
function restoreDefaults() {
  language.set('en');
}

/* ── The label layer ────────────────────────────────────────────────────── */

describe('i18n — the languages exist and agree', () => {
  it('ships the two the phase asked for', () => {
    expect(i18n.locales().includes('en')).toBeTruthy();
    expect(i18n.locales().includes('ar')).toBeTruthy();
  });

  it('matches the languages the Settings schema will accept', () => {
    for (const code of i18n.locales()) {
      expect(LANGUAGE.includes(code), `"${code}" cannot be stored`).toBeTruthy();
    }
  });

  it('translates every interface key into Arabic', () => {
    const missing = i18n.keysOf('en').filter((key) => isUiKey(key) && !i18n.has(key, 'ar'));
    expect(missing.length, `untranslated: ${missing.slice(0, 10).join(', ')}`).toBe(0);
  });

  it('invents no Arabic-only interface key', () => {
    const extra = i18n.keysOf('ar').filter((key) => isUiKey(key) && !i18n.has(key, 'en'));
    expect(extra.length, `English is missing: ${extra.slice(0, 10).join(', ')}`).toBe(0);
  });

  it('leaves no interface label empty', () => {
    for (const code of i18n.locales()) {
      const blank = i18n.keysOf(code).filter((key) => isUiKey(key) && i18n.t(key, { locale: code }).trim() === '');
      expect(blank.length, `${code} has ${blank.length} empty labels`).toBe(0);
    }
  });

  it('knows which way each language reads', () => {
    expect(i18n.direction('en')).toBe('ltr');
    expect(i18n.direction('ar')).toBe('rtl');
    expect(i18n.direction('xx')).toBe('ltr');
  });

  it('keeps every {placeholder} through the translation', () => {
    const holes = (text) => (String(text).match(/\{(\w+)\}/g) ?? []).sort().join(',');

    const mismatched = i18n.keysOf('en')
      .filter(isUiKey)
      .filter((key) => holes(i18n.t(key, { locale: 'en' })) !== holes(i18n.t(key, { locale: 'ar' })));

    expect(mismatched.length, `placeholders differ in: ${mismatched.join(', ')}`).toBe(0);
  });
});

/* ── Translating ────────────────────────────────────────────────────────── */

describe('i18n — the manager translates', () => {
  it('returns English by default', () => {
    restoreDefaults();
    expect(language.current).toBe('en');
    expect(t('ui.common.save')).toBe('Save');
  });

  it('returns Arabic once switched', () => {
    language.set('ar');
    expect(language.current).toBe('ar');
    expect(t('ui.common.save')).toBe('حفظ');
    restoreDefaults();
  });

  it('fills placeholders', () => {
    restoreDefaults();
    expect(t('ui.dashboard.eaten', { n: 900 })).toBe('900 eaten');
    language.set('ar');
    expect(t('ui.dashboard.eaten', { n: 900 })).toContain('900');
    restoreDefaults();
  });

  it('leaves a placeholder alone when nothing was passed for it', () => {
    expect(t('ui.dashboard.eaten')).toBe('{n} eaten');
  });

  it('survives a language nobody registered', () => {
    language.set('klingon');
    expect(language.current).toBe('en');
  });
});

/* ── Missing translations ───────────────────────────────────────────────── */

describe('i18n — a missing key is visible, not fatal', () => {
  it('shows the key itself', () => {
    restoreDefaults();
    expect(t('ui.nothing.here.at.all')).toBe('ui.nothing.here.at.all');
  });

  it('does not throw on a key of the wrong type', () => {
    expect(t(null)).toBe('');
    expect(t(undefined)).toBe('');
    expect(t('')).toBe('');
  });

  it('warns in the logger, once', () => {
    Logger.clear();
    const key = `ui.absent.${Math.random().toString(36).slice(2)}`;

    t(key); t(key); t(key);

    const warnings = Logger.history()
      .filter((entry) => entry.source === 'language' && String(entry.message).includes(key));

    expect(warnings.length, 'a missing key should be reported exactly once').toBe(1);
    expect(warnings[0].name).toBe('WARN');
  });

  it('falls back to English rather than showing a key when only Arabic is short', () => {
    // 'food.egg' exists in Arabic but not in English: the fallback runs the
    // other way too, and either way something readable comes out.
    language.set('ar');
    expect(t('food.egg')).toBe('بيض');
    restoreDefaults();
  });
});

/* ── Persistence ────────────────────────────────────────────────────────── */

describe('i18n — the choice is remembered', () => {
  it('writes the language to Settings', () => {
    BackupService.reset();
    SettingsRepository.save({ onboarded: true });

    language.set('ar');
    expect(SettingsRepository.get().language).toBe('ar');
    restoreDefaults();
  });

  it('reads it back on the next start', () => {
    BackupService.reset();
    SettingsRepository.save({ onboarded: true });
    language.set('ar');

    // What script.js does at boot, on a device that already has Settings.
    language.init();
    expect(language.current).toBe('ar');

    restoreDefaults();
  });

  it('starts in English when nothing was ever chosen', () => {
    BackupService.reset();
    language.init();
    expect(language.current).toBe('en');
  });

  it('keeps the language through a backup and a restore', () => {
    BackupService.reset();
    SettingsRepository.save({ onboarded: true });
    language.set('ar');

    const backup = BackupService.export();
    BackupService.reset();
    BackupService.import(backup);

    language.init();
    expect(language.current).toBe('ar');
    restoreDefaults();
  });

  it('survives being switched back and forth repeatedly', () => {
    for (let i = 0; i < 10; i += 1) {
      language.set(i % 2 ? 'ar' : 'en');
      expect(language.current).toBe(i % 2 ? 'ar' : 'en');
    }
    restoreDefaults();
    expect(language.current).toBe('en');
  });
});

/* ── Marked text ────────────────────────────────────────────────────────── */

describe('i18n — T() stands in for a string', () => {
  it('is recognisable, and remembers its key', () => {
    const marked = T('ui.common.save');
    expect(isTranslated(marked)).toBeTruthy();
    expect(keyOf(marked)).toBe('ui.common.save');
    expect(keyOf('Save')).toBeNull();
  });

  it('behaves like the string it stands for', () => {
    restoreDefaults();
    const marked = T('ui.common.save');
    expect(String(marked)).toBe('Save');
    expect(`${marked}!`).toBe('Save!');
    expect(marked.length).toBe(4);
  });
});

/* ── The dictionaries against the code ──────────────────────────────────── */

/**
 * Read every shipped module the way architecture.test.js does, and hold the
 * label files to the code that uses them. Two dictionaries and four hundred
 * keys drift apart quietly otherwise: a key is renamed and the interface
 * shows an id, or a screen is rewritten and its labels stay behind for ever.
 */
describeDom('i18n — the dictionaries match the code', () => {
  /** Keys written out in full, anywhere in a module. */
  const LITERAL = /['"`]([a-zA-Z][\w.]*)['"`]/g;

  /** Keys assembled at run time: T(`ui.field.${key}`) names the family. */
  const FAMILY = /`([a-zA-Z][\w.]*)\.\$\{/g;

  /** Families reached through a helper rather than a template. */
  const HELPERS = ['food', 'muscle', 'exercise', 'ui.field'];

  async function readCode() {
    // The label files define keys; they do not use them.
    const modules = SHELL_FILES.filter((file) => !file.startsWith('data/i18n/'));
    const sources = await Promise.all(
      modules.map(async (file) => (await fetch(`../${file}`)).text()));

    return sources
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  it('defines every interface key the code asks for', async () => {
    const code = await readCode();
    const asked = new Set([...code.matchAll(LITERAL)].map((m) => m[1])
      .filter((key) => /^(ui|nav|language)\.[a-z]/i.test(key)));

    const undefined_ = [...asked].filter((key) => !i18n.has(key, 'en') && !i18n.has(key, 'ar'));
    expect(undefined_.length, `no label for: ${undefined_.join(', ')}`).toBe(0);
  });

  it('defines no interface key the code never reaches', async () => {
    const code = await readCode();
    const literals = new Set([...code.matchAll(LITERAL)].map((m) => m[1]));
    const families = [...new Set([...code.matchAll(FAMILY)].map((m) => m[1])), ...HELPERS];

    const orphans = i18n.keysOf('en')
      .filter(isUiKey)
      .filter((key) => !literals.has(key) && !families.some((f) => key.startsWith(`${f}.`)));

    expect(orphans.length, `nothing reads: ${orphans.join(', ')}`).toBe(0);
  });
});

/* ── Record names ───────────────────────────────────────────────────────── */

describe('i18n — a record keeps its own name as the fallback', () => {
  it('translates a food that has an Arabic label', () => {
    language.set('ar');
    expect(String(TName('food', 'egg', 'Egg'))).toBe('بيض');
    restoreDefaults();
  });

  it('shows the record name when a language has not named it', () => {
    language.set('ar');
    // Exercises carry no Arabic labels yet; the record's own name is right.
    expect(String(TName('exercise', 'barbell-bench-press', 'Barbell Bench Press')))
      .toBe('Barbell Bench Press');
    restoreDefaults();
  });

  it('does not warn about a record with no label', () => {
    Logger.clear();
    language.set('ar');
    String(TName('exercise', 'made-up-exercise', 'Made Up'));
    restoreDefaults();

    const warnings = Logger.history()
      .filter((entry) => entry.source === 'language' && entry.name === 'WARN');
    expect(warnings.length, 'an unnamed record is not a missing translation').toBe(0);
  });

  it('joins a list in the language it is read in', () => {
    const joined = TJoin('muscle', ['chest', 'triceps']);

    restoreDefaults();
    expect(String(joined)).toBe('Chest, Triceps');

    language.set('ar');
    expect(String(joined)).toBe('الصدر، العضلة ثلاثية الرؤوس');

    restoreDefaults();
  });
});

/* ── Direction and the document ─────────────────────────────────────────── */

describeDom('i18n — the document follows the language', () => {
  it('sets lang and dir for Arabic', () => {
    language.set('ar');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(language.isRTL).toBeTruthy();
  });

  it('sets them back for English', () => {
    language.set('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(language.isRTL).toBeFalsy();
  });

  it('reports the direction of a language without switching to it', () => {
    restoreDefaults();
    const arabic = language.options.find((option) => option.value === 'ar');
    expect(arabic.dir).toBe('rtl');
    expect(language.current).toBe('en');
  });

  it('names each language in its own language', () => {
    expect(language.options.find((o) => o.value === 'ar').label).toBe('العربية');
    expect(language.options.find((o) => o.value === 'en').label).toBe('English');
  });
});

/* ── Changing language changes text, and nothing else ───────────────────── */

describeDom('i18n — switching rewrites text in place', () => {
  it('replaces the text of a bound node without replacing the node', () => {
    restoreDefaults();
    const node = el('p', { text: T('ui.common.save') });
    document.body.append(node);

    expect(node.textContent).toBe('Save');

    language.set('ar');
    expect(node.textContent).toBe('حفظ');
    expect(node.isConnected, 'the node itself must survive').toBeTruthy();

    language.set('en');
    expect(node.textContent).toBe('Save');

    node.remove();
  });

  it('re-translates attributes too', () => {
    restoreDefaults();
    const node = el('button', { 'aria-label': T('ui.a11y.close') });
    document.body.append(node);

    expect(node.getAttribute('aria-label')).toBe('Close');
    language.set('ar');
    expect(node.getAttribute('aria-label')).toBe('إغلاق');

    restoreDefaults();
    node.remove();
  });

  it('keeps the variables a label was given', () => {
    restoreDefaults();
    const node = el('p', { text: T('ui.dashboard.eaten', { n: 1234 }) });
    document.body.append(node);

    language.set('ar');
    expect(node.textContent).toContain('1234');

    restoreDefaults();
    node.remove();
  });

  it('re-reads a lazy variable, so a joined list follows the sentence', () => {
    restoreDefaults();
    const node = el('p', { text: T('ui.gym.summary', {
      count: 3, minutes: 45, muscles: TJoin('muscle', ['chest', 'lats']),
    }) });
    document.body.append(node);

    expect(node.textContent).toContain('Chest, Lats');
    language.set('ar');
    expect(node.textContent).toContain('الصدر، العضلة الجناحية');

    restoreDefaults();
    node.remove();
  });

  it('leaves plain strings alone', () => {
    restoreDefaults();
    const node = el('p', { text: 'a value from a service' });
    document.body.append(node);

    language.set('ar');
    expect(node.textContent).toBe('a value from a service');

    restoreDefaults();
    node.remove();
  });

  it('re-translates only what is bound', () => {
    restoreDefaults();
    const host = el('div', {}, [
      el('span', { text: T('ui.common.save') }),
      el('span', { text: 'plain' }),
      el('span', { text: T('ui.common.cancel') }),
    ]);
    document.body.append(host);

    expect(language.apply(host)).toBe(2);

    host.remove();
  });
});

/* ── The cost ───────────────────────────────────────────────────────────── */

describeDom('i18n — switching costs nothing but text', () => {
  /** A profile complete enough that every cache has something to hold. */
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

  it('re-translating runs no engine and reads no store', () => {
    restoreDefaults();
    seed();

    // Warm every snapshot, then start counting.
    Queries.getToday();
    Queries.getProgress();
    Cache.resetStats();

    const before = Cache.stats().reduce((sum, cache) => sum + cache.misses, 0);
    language.apply();
    const after = Cache.stats().reduce((sum, cache) => sum + cache.misses, 0);

    expect(after - before, 'a sweep must not rebuild anything').toBe(0);
  });

  it('shows the same numbers in both languages', () => {
    restoreDefaults();
    seed();

    const english = Queries.getNutritionToday();
    language.set('ar');
    const arabic = Queries.getNutritionToday();

    expect(arabic.calories).toBe(english.calories);
    expect(arabic.proteinG).toBe(english.proteinG);

    restoreDefaults();
  });

  it('does not touch the mounted page', async () => {
    restoreDefaults();
    seed();

    const module = (await findRoute('/nutrition').load()).default;
    const node = module.render();
    document.body.append(node);
    module.mount?.(node);

    const rows = [...node.querySelectorAll('.list-row')];
    language.set('ar');
    const after = [...node.querySelectorAll('.list-row')];

    expect(after.length).toBe(rows.length);
    expect(after.every((row, i) => row === rows[i]), 'rows were rebuilt, not re-translated').toBeTruthy();

    restoreDefaults();
    module.unmount?.();
    node.remove();
  });
});

/* ── Every page, every component ────────────────────────────────────────── */

describeDom('i18n — every page speaks both languages', () => {
  const paths = ['/', '/gym', '/running', '/nutrition', '/meals', '/progress', '/calendar', '/profile', '/settings'];

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

  async function render(path) {
    // NOT_FOUND is deliberately outside ROUTES, so it is looked up separately.
    const route = findRoute(path) ?? NOT_FOUND;
    const module = (await route.load()).default;
    const node = module.render();
    document.body.append(node);
    module.mount?.(node);
    return { node, destroy: () => { module.unmount?.(); node.remove(); } };
  }

  for (const code of ['en', 'ar']) {
    for (const path of paths) {
      it(`renders ${path} in ${code} with no untranslated key`, async () => {
        seed();
        language.set(code);

        const page = await render(path);
        const text = page.node.textContent;

        expect(text.trim().length).toBeGreaterThan(20);
        expect(LEAKED_KEY.test(text), `${path} (${code}) shows: ${text.match(LEAKED_KEY)?.[0]}`).toBeFalsy();

        page.destroy();
        restoreDefaults();
      });
    }
  }

  it('translates the wizard as well as the pages', async () => {
    BackupService.reset();
    language.set('ar');

    const page = await render('/welcome');
    const text = page.node.textContent;

    expect(text.trim().length).toBeGreaterThan(20);
    expect(LEAKED_KEY.test(text)).toBeFalsy();

    page.destroy();
    restoreDefaults();
  });

  it('translates the page not found', async () => {
    language.set('ar');
    const page = await render('/404');
    expect(LEAKED_KEY.test(page.node.textContent)).toBeFalsy();
    page.destroy();
    restoreDefaults();
  });

  it('re-translates a whole page without re-rendering it', async () => {
    seed();
    restoreDefaults();

    const page = await render('/settings');
    const english = page.node.textContent;

    language.set('ar');
    const arabic = page.node.textContent;

    expect(arabic === english, 'the page did not change language').toBeFalsy();
    expect(LEAKED_KEY.test(arabic)).toBeFalsy();

    page.destroy();
    restoreDefaults();
  });

  it('gives every route a title in both languages', () => {
    for (const code of ['en', 'ar']) {
      language.set(code);
      for (const route of ROUTES) {
        expect(route.title.length, `${route.name} has no title in ${code}`).toBeGreaterThan(0);
        expect(LEAKED_KEY.test(route.title), `${route.name} shows a key in ${code}`).toBeFalsy();
      }
    }
    restoreDefaults();
  });
});

describeDom('i18n — the components carry their own labels', () => {
  it('translates the shell', async () => {
    restoreDefaults();
    const { Header, BottomNavigation } = await import('../components/index.js');
    const { NAV_ROUTES } = await import('../scripts/routes.js');

    const header = Header();
    const nav = BottomNavigation({ items: NAV_ROUTES });
    document.body.append(header, nav);

    expect(nav.textContent).toContain('Gym');
    language.set('ar');
    expect(nav.textContent).toContain('الحديد');
    expect(header.querySelector('.avatar').getAttribute('aria-label')).toBe('الملف الشخصي');

    restoreDefaults();
    header.unsubscribe?.();
    nav.remove();
    header.remove();
  });

  it('translates the states, the buttons and the reasons', async () => {
    const { EmptyState, ErrorState, Button, ReasonList } = await import('../components/index.js');
    language.set('ar');

    const nodes = [
      EmptyState({ title: T('ui.dashboard.noPlanTitle'), message: T('ui.dashboard.noPlanMessage') }),
      ErrorState({ onRetry: () => {} }),
      Button({ label: T('ui.common.cancel') }),
      ReasonList({ reasons: [{ rule: 'r', message: 'because' }], collapsed: false }),
    ];

    for (const node of nodes) {
      expect(LEAKED_KEY.test(node.textContent), `untranslated: ${node.textContent}`).toBeFalsy();
    }

    expect(nodes[1].textContent).toContain('أعد المحاولة');
    expect(nodes[2].textContent).toBe('إلغاء');

    restoreDefaults();
  });

  it('keeps a field id out of the language', async () => {
    const { Field } = await import('../components/index.js');
    restoreDefaults();

    const field = Field({ label: T('ui.field.weightKg'), rule: null });
    const id = field.querySelector('input').id;

    language.set('ar');
    const relabelled = Field({ label: T('ui.field.weightKg'), rule: null });

    expect(relabelled.querySelector('input').id, 'the id moved with the language').toBe(id);
    restoreDefaults();
  });
});
