/**
 * architecture.test.js — the layering, as a test.
 *
 * Every rule the project was built on is checked here rather than trusted.
 * If someone reaches past a layer, imports a repository from a page, or writes
 * to the console directly, this fails — which is the point: an architecture
 * nobody can violate by accident is worth more than one described in a README.
 *
 * The file list is read at run time in the browser, so it always reflects
 * what is actually shipped rather than a list someone maintained by hand.
 */

import { describe, describeDom, it, expect } from './runner.js';
import { SHELL_FILES } from './shell-files.js';

/** Which layer a path belongs to. */
function layerOf(path) {
  const top = path.replace('./', '').split('/')[0];
  return {
    pages: 'ui', components: 'ui',
    app: 'app',
    services: 'services',
    engines: 'engines', rules: 'engines',
    models: 'models', validators: 'validators',
    repositories: 'repositories',
    data: 'data', events: 'events', scripts: 'scripts',
    reporting: 'reporting',
  }[top] ?? 'root';
}

/**
 * Three things are allowed to cross layers, and each is deliberate:
 *
 *   scripts/logger.js     cross-cutting infrastructure, like the DOM helpers.
 *                         Every layer needs to log; the alternative is passing
 *                         a logger through every constructor for no gain.
 *
 *   engines/constants.js  shared configuration, not an engine. It is misnamed
 *                         for the role it grew into — it holds tuning values
 *                         for the whole app, and a repository reading a cap
 *                         from it is not reaching into the engine layer.
 *                         Worth moving to config/constants.js one day; the
 *                         rename touches about forty imports and is not worth
 *                         the risk in a hardening pass.
 *
 *   scripts/routes.js     the route table. Referencing pages is its entire
 *                         job, and the imports are dynamic so they are what
 *                         gives the app its code splitting.
 */
const CROSS_CUTTING = new Set(['scripts/logger.js', 'engines/constants.js']);
const ROUTE_TABLE = 'scripts/routes.js';

/** What each layer may import. */
const ALLOWED = {
  ui: new Set(['ui', 'app', 'scripts', 'validators', 'models', 'events', 'reporting', 'root']),
  app: new Set(['app', 'services', 'engines', 'repositories', 'models', 'validators', 'events', 'scripts', 'data', 'reporting', 'root']),

  /**
   * Phase 22. The narrowest layer in the app, and deliberately so: it turns
   * numbers other layers produced into documents, charts and printable
   * output, and it is allowed to import nothing that could produce a number.
   * Not engines, not rules, not models, not repositories — not even
   * engines/constants.js, which every other layer may read. Its own caps live
   * in reporting/constants.js so that exemption never has to be argued about.
   *
   * It also imports nothing from app/, which is what keeps the dependency
   * one-directional: app/reporting-service.js gathers and calls down into it.
   */
  reporting: new Set(['reporting', 'scripts', 'root']),
  services: new Set(['services', 'engines', 'repositories', 'models', 'validators', 'events', 'scripts', 'data', 'root']),
  engines: new Set(['engines', 'models', 'validators', 'data', 'scripts', 'root']),
  repositories: new Set(['repositories', 'models', 'validators', 'events', 'scripts', 'root']),
  models: new Set(['models', 'validators', 'engines', 'data', 'scripts', 'root']),
  validators: new Set(['validators', 'root']),
  data: new Set(['data', 'models', 'validators', 'root']),
  events: new Set(['events', 'root']),
  scripts: new Set(['scripts', 'repositories', 'rules', 'engines', 'root']),
  root: new Set(['ui', 'app', 'services', 'engines', 'repositories', 'models', 'validators', 'events', 'scripts', 'data', 'root']),
};

const IMPORT = /(?:from|import\()\s*['"](\.[^'"]+)['"]/g;

/** Resolve a relative import to a path from the project root. */
function resolve(from, spec) {
  const base = from.replace('./', '').split('/').slice(0, -1);
  const parts = spec.split('/');

  for (const part of parts) {
    if (part === '.') continue;
    else if (part === '..') base.pop();
    else base.push(part);
  }

  const path = base.join('/');
  return path.endsWith('.js') ? path : `${path}.js`;
}

describeDom('Architecture — the layering holds', () => {
  it('never lets a layer import one it must not', async () => {
    const breaches = [];

    for (const file of SHELL_FILES) {
      const source = await (await fetch(`../${file}`)).text();
      const from = layerOf(file);

      for (const [, spec] of source.matchAll(IMPORT)) {
        const target = resolve(file, spec);
        if (CROSS_CUTTING.has(target)) continue;
        if (file === ROUTE_TABLE && target.startsWith('pages/')) continue;

        const to = layerOf(target);

        if (!ALLOWED[from]?.has(to)) {
          breaches.push(`${file} (${from}) → ${target} (${to})`);
        }
      }
    }

    expect(breaches.length, `boundary breached:\n${breaches.join('\n')}`).toBe(0);
  });

  it('keeps the UI off the repositories, engines and services', async () => {
    const breaches = [];

    for (const file of SHELL_FILES.filter((path) => path.startsWith('pages/') || path.startsWith('components/'))) {
      const source = await (await fetch(`../${file}`)).text();

      for (const [, spec] of source.matchAll(IMPORT)) {
        const target = resolve(file, spec);
        if (/^(repositories|engines|rules|services|data)\//.test(target)) {
          breaches.push(`${file} → ${target}`);
        }
      }
    }

    expect(breaches.length, `UI reaches too far:\n${breaches.join('\n')}`).toBe(0);
  });

  it('keeps the engines off storage', async () => {
    const breaches = [];

    for (const file of SHELL_FILES.filter((path) => path.startsWith('engines/') || path.startsWith('rules/'))) {
      const source = await (await fetch(`../${file}`)).text();

      for (const [, spec] of source.matchAll(IMPORT)) {
        const target = resolve(file, spec);
        if (/^(repositories|services)\//.test(target) || target.includes('scripts/storage')) {
          breaches.push(`${file} → ${target}`);
        }
      }
    }

    expect(breaches.length, `engine touches storage:\n${breaches.join('\n')}`).toBe(0);
  });

  it('lets only repositories touch the storage engine', async () => {
    const users = [];

    for (const file of SHELL_FILES) {
      const source = await (await fetch(`../${file}`)).text();
      if (/from\s+['"][^'"]*scripts\/storage\.js['"]/.test(source)) users.push(file);
    }

    const allowed = users.every((file) =>
      file.startsWith('repositories/') || file === 'script.js' || file.startsWith('scripts/'));

    expect(allowed, `storage reached from: ${users.join(', ')}`).toBeTruthy();
  });

  it('writes to the console only from the logger', async () => {
    const offenders = [];

    for (const file of SHELL_FILES) {
      if (file === 'scripts/logger.js') continue;
      const source = await (await fetch(`../${file}`)).text();

      const lines = source.split('\n').filter((line) =>
        /\bconsole\.(log|info|warn|error|debug)\s*\(/.test(line) && !line.trim().startsWith('*'));

      if (lines.length) offenders.push(`${file} (${lines.length})`);
    }

    expect(offenders.length, `console used directly in: ${offenders.join(', ')}`).toBe(0);
  });

  it('never uses innerHTML, eval or new Function', async () => {
    const offenders = [];

    for (const file of SHELL_FILES) {
      const source = await (await fetch(`../${file}`)).text();

      for (const [pattern, name] of [[/\.innerHTML\s*=/, 'innerHTML'], [/\beval\s*\(/, 'eval'], [/new Function\s*\(/, 'new Function']]) {
        if (pattern.test(source)) offenders.push(`${file}: ${name}`);
      }
    }

    expect(offenders.length, `unsafe: ${offenders.join(', ')}`).toBe(0);
  });

  /* ── Phase 23: the whole graph ──────────────────────────────────────────
     The checks above ask whether each import is allowed. These ask about the
     shape of the graph as a whole — cycles, unreachable files, and modules
     imported under two names. None of them can be answered by looking at one
     file, which is why they were not written until the app was finished.  */

  const allSources = async () => {
    const entries = [];
    for (const file of SHELL_FILES) entries.push([file, await (await fetch(`../${file}`)).text()]);
    return entries;
  };

  const noComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('has no circular import anywhere in the app', async () => {
    const entries = await allSources();
    const known = new Set(entries.map(([file]) => file));

    const edges = new Map(entries.map(([file, raw]) => [
      file,
      [...new Set([...noComments(raw).matchAll(IMPORT)]
        .map(([, spec]) => resolve(file, spec))
        .filter((target) => known.has(target)))],
    ]));

    /* Iterative depth-first search with an explicit stack: the graph is ~240
       nodes and a recursive walk over it is both slower and harder to report
       a path from. */
    const cycles = [];
    const state = new Map();   // file → 'visiting' | 'done'

    for (const start of known) {
      if (state.get(start) === 'done') continue;

      const stack = [[start, [...(edges.get(start) ?? [])]]];
      state.set(start, 'visiting');
      const path = [start];

      while (stack.length) {
        const frame = stack[stack.length - 1];
        const next = frame[1].shift();

        if (next === undefined) {
          state.set(frame[0], 'done');
          stack.pop();
          path.pop();
          continue;
        }

        if (state.get(next) === 'visiting') {
          cycles.push([...path.slice(path.indexOf(next)), next].join(' → '));
          continue;
        }
        if (state.get(next) === 'done') continue;

        state.set(next, 'visiting');
        path.push(next);
        stack.push([next, [...(edges.get(next) ?? [])]]);
      }
    }

    expect(cycles.length, `circular imports:\n${[...new Set(cycles)].join('\n')}`).toBe(0);
  });

  it('imports every module it ships, or documents why not', async () => {
    const entries = await allSources();
    const imported = new Set();

    for (const [file, raw] of entries) {
      for (const [, spec] of noComments(raw).matchAll(IMPORT)) imported.add(resolve(file, spec));
    }

    /* Entry points are reached by the HTML, the service worker or a test
       harness rather than by an import, so they are named rather than
       inferred. Anything else unreferenced is dead weight in the precache. */
    const ENTRY_POINTS = new Set([
      'script.js', 'service-worker.js', 'scripts/routes.js',
      'app/index.js', 'engines/index.js', 'reporting/index.js',
      'models/index.js', 'repositories/index.js', 'validators/index.js',
      'events/index.js', 'rules/index.js', 'services/index.js',
      'components/index.js', 'data/index.js', 'data/i18n/index.js',

      /* Phase 22 built the reporting service and phase 22 deliberately added
         no page to consume it. It is a public API waiting for a caller, kept
         and documented rather than deleted — see RELEASE_MANIFEST.md. */
      'app/reporting-service.js',
    ]);

    const orphans = SHELL_FILES.filter((file) => !imported.has(file) && !ENTRY_POINTS.has(file));

    expect(orphans.length, `nothing imports:\n${orphans.join('\n')}`).toBe(0);
  });

  it('never gives one idea two owners inside a single folder', async () => {
    const entries = await allSources();
    const byFolder = new Map();

    for (const [file] of entries) {
      const parts = file.split('/');
      const key = `${parts.slice(0, -1).join('/')}::${parts.at(-1)}`;
      byFolder.set(key, (byFolder.get(key) ?? 0) + 1);
    }

    /* Across layers, a repeated name is the convention rather than a problem:
       `models/running.js` and `pages/running.js` are the same domain seen from
       two layers, and every rule folder has its own `recovery-rules.js`. What
       would be a real problem is two files claiming the same name in the same
       folder, which is what this checks — and which the file system makes
       impossible, so this is a guard against the manifest listing a stale
       duplicate rather than against the source. */
    const duplicated = [...byFolder.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => key.replace('::', '/'));

    expect(duplicated.length, `listed twice in the precache:\n${duplicated.join('\n')}`).toBe(0);
  });

  it('keeps the application layer free of the calculations the engines own', async () => {
    /* Not a name check — a formula check. These are the constants and shapes
       that appear when someone has reimplemented an engine in `app/`. */
    const fingerprints = [
      { name: 'the Mifflin-St Jeor equation', pattern: /\b(?:10\s*\*|6\.25|4\.92|161|5\b)[\s\S]{0,80}(?:weightKg|heightCm|age)/ },
      { name: 'macro energy densities', pattern: /\b4\s*\*[\s\S]{0,40}(?:proteinG|carbsG)|\b9\s*\*[\s\S]{0,40}fatG/ },
      { name: 'a pace conversion', pattern: /durationMin\s*\*\s*60\s*\/\s*distanceKm|distanceKm\s*\/\s*durationMin/ },
      { name: 'an acute:chronic ratio', pattern: /acute\s*\/\s*chronic/ },
      { name: 'a one-rep-max estimate', pattern: /\b(?:1\s*[-+]\s*reps\s*\/\s*30|reps\s*\/\s*30)\b/ },
    ];

    const breaches = [];

    for (const [file, raw] of await allSources()) {
      if (!file.startsWith('app/')) continue;
      const clean = noComments(raw);

      for (const { name, pattern } of fingerprints) {
        if (pattern.test(clean)) breaches.push(`${file} contains ${name}`);
      }
    }

    expect(breaches.length, `business logic duplicated in app/:\n${breaches.join('\n')}`).toBe(0);
  });

  /* ── Phase 22: the reporting layer ─────────────────────────────────────
     The narrowest layer in the app, and the only one whose guarantee is
     entirely negative. These checks are what make "it cannot calculate"
     structural rather than a promise in a comment.                       */

  const reportingFiles = () => SHELL_FILES.filter((file) => file.startsWith('reporting/'));
  const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const readAll = async (files) => {
    const entries = [];
    for (const file of files) entries.push([file, await (await fetch(`../${file}`)).text()]);
    return entries;
  };

  it('ships the whole reporting layer', () => {
    expect(reportingFiles().length > 4, 'the reporting layer is missing from the precache').toBeTruthy();
  });

  it('keeps the reporting layer off anything that could produce a figure', async () => {
    const breaches = [];

    for (const [file, raw] of await readAll(reportingFiles())) {
      for (const [, spec] of stripComments(raw).matchAll(IMPORT)) {
        const target = resolve(file, spec);
        if (/^(engines|rules|repositories|models|services|data|events|app)\//.test(target)) {
          breaches.push(`${file} → ${target}`);
        }
      }
    }

    expect(breaches.length, `the reporting layer reaches too far:\n${breaches.join('\n')}`).toBe(0);
  });

  it('does not let the reporting layer read the engine constants', async () => {
    const breaches = [];

    for (const [file, raw] of await readAll(reportingFiles())) {
      for (const [, spec] of stripComments(raw).matchAll(IMPORT)) {
        if (resolve(file, spec) === 'engines/constants.js') breaches.push(file);
      }
    }

    expect(breaches.length, `reads engines/constants.js: ${breaches.join(', ')}`).toBe(0);
  });

  it('keeps the reporting layer free of arithmetic on the figures it presents', async () => {
    /* `toFixed` for display and `Math.min`/`Math.max` for picking a best week
       out of figures that already exist are allowed. An operator combining two
       measurements into a third is not. */
    const forbidden = [
      /\*\s*(?:100|weight|calories|distance|weeks)\b/,
      /\/\s*(?:weeks|days|sessions|count|total)\b/,
      /reduce\(\([a-z]+,\s*[a-z]+\)\s*=>\s*[a-z]+\s*\+/,
    ];

    const breaches = [];

    for (const [file, raw] of await readAll(reportingFiles())) {
      const clean = stripComments(raw);
      for (const pattern of forbidden) {
        if (pattern.test(clean)) breaches.push(`${file} matches ${pattern}`);
      }
    }

    expect(breaches.length, `looks like calculation:\n${breaches.join('\n')}`).toBe(0);
  });

  it('holds no literal sentence in the reporting layer — every label is a key', async () => {
    const breaches = [];

    for (const [file, raw] of await readAll(reportingFiles())) {
      if (file.endsWith('constants.js')) continue;
      const clean = stripComments(raw);

      /* Split each line on the quote character and take the odd segments:
         those are the string contents. An earlier version used a regex over
         the whole line and matched the gap *between* two adjacent literals,
         reporting fragments of code as untranslated prose. */
      for (const line of clean.split('\n')) {
        const segments = line.split("'");
        for (let i = 1; i < segments.length; i += 2) {
          const literal = segments[i];
          if (literal.length < 25) continue;

          const looksLikeKey = /^[a-z][\w.-]*$/i.test(literal);
          const looksLikeCode = /[<>{}();=]|^[A-Za-z-]+$/.test(literal);
          if (!looksLikeKey && !looksLikeCode) breaches.push(`${file}: "${literal}"`);
        }
      }
    }

    expect(breaches.length, `untranslatable text:\n${breaches.join('\n')}`).toBe(0);
  });

  it('has no import cycle inside the reporting layer', async () => {
    const entries = await readAll(reportingFiles());
    const known = new Set(entries.map(([file]) => file));
    const edges = new Map(entries.map(([file, raw]) => [
      file,
      [...stripComments(raw).matchAll(IMPORT)]
        .map(([, spec]) => resolve(file, spec))
        .filter((target) => known.has(target)),
    ]));

    const cycles = [];
    const walk = (node, path) => {
      if (path.includes(node)) { cycles.push([...path, node].join(' → ')); return; }
      for (const next of edges.get(node) ?? []) walk(next, [...path, node]);
    };
    for (const [file] of entries) walk(file, []);

    expect(cycles.length, `cycles:\n${cycles.join('\n')}`).toBe(0);
  });

});

describe('Architecture — the precache list is honest', () => {
  it('lists something for every layer the app needs at run time', () => {
    for (const prefix of ['pages/', 'components/', 'app/', 'services/', 'engines/', 'rules/', 'repositories/', 'models/', 'data/']) {
      expect(SHELL_FILES.some((file) => file.startsWith(prefix)), `nothing precached from ${prefix}`).toBeTruthy();
    }
  });

  it('does not precache the test suite', () => {
    expect(SHELL_FILES.some((file) => file.startsWith('tests/'))).toBeFalsy();
  });
});
