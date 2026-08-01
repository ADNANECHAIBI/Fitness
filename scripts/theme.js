/**
 * theme.js — Theme Manager.
 *
 * Applies a theme by setting data-theme on <html>; every colour comes from
 * CSS custom properties, so switching is one attribute change and no repaint
 * work in JavaScript.
 *
 * Modes: 'system' (follows the phone's appearance), 'dark', 'light'.
 * The choice is stored on the Settings document through its repository — the
 * theme manager never touches storage directly, like everything else.
 *
 * Adding a theme later is one call to register():
 *
 *   theme.register('sand', {
 *     label: 'Sand',
 *     themeColor: '#efe9dd',
 *     tokens: { '--ink-950': '#efe9dd', '--text': '#1b1a17' },
 *   });
 */

import { SettingsRepository } from '../repositories/settings-repository.js';
import { createLogger } from './logger.js';

const log = createLogger('theme');

const SYSTEM = 'system';

/** Built-in themes. `tokens` is null because both live in styles/themes.css. */
const BUILT_IN = [
  ['dark',  { label: 'Dark',  themeColor: '#0e1013', tokens: null }],
  ['light', { label: 'Light', themeColor: '#f4f5f7', tokens: null }],
];

class ThemeManager {
  #themes = new Map(BUILT_IN);
  #mode = SYSTEM;
  #media = window.matchMedia('(prefers-color-scheme: light)');
  #listeners = new Set();

  /** Read the saved choice, apply it, and follow the system when set to auto. */
  init() {
    this.#mode = this.#normalise(SettingsRepository.get()?.theme ?? SYSTEM);
    this.#apply();

    this.#media.addEventListener('change', () => {
      if (this.#mode === SYSTEM) this.#apply();
    });
  }

  /** The stored preference: 'system' | 'dark' | 'light' | any registered name. */
  get mode() { return this.#mode; }

  /** The theme actually on screen — resolves 'system' to a real theme name. */
  get resolved() {
    return this.#mode === SYSTEM
      ? (this.#media.matches ? 'light' : 'dark')
      : this.#mode;
  }

  /** Every selectable option, for building a settings control. */
  get options() {
    return [
      { value: SYSTEM, label: 'System' },
      ...[...this.#themes].map(([value, meta]) => ({ value, label: meta.label })),
    ];
  }

  /** Switch theme and remember the choice. */
  set(mode) {
    this.#mode = this.#normalise(mode);
    try {
      SettingsRepository.patch({ theme: this.#mode });
    } catch (error) {
      // A theme registered at runtime is not in the Settings schema; it still
      // applies for this session, it just is not remembered.
      log.warn('[theme] preference not saved', error);
    }
    this.#apply();
  }

  /** Step through the options — handy for a single toggle button. */
  toggle() {
    const values = this.options.map((option) => option.value);
    const next = values[(values.indexOf(this.#mode) + 1) % values.length];
    this.set(next);
  }

  /**
   * Add a theme at runtime.
   * @param {string} name
   * @param {{label: string, themeColor: string, tokens?: object}} definition
   */
  register(name, { label, themeColor, tokens = null }) {
    this.#themes.set(name, { label, themeColor, tokens });

    if (tokens) {
      const body = Object.entries(tokens)
        .map(([prop, value]) => `${prop}:${value};`)
        .join('');
      document.head.append(
        Object.assign(document.createElement('style'), {
          textContent: `[data-theme="${name}"]{${body}}`,
        })
      );
    }
  }

  /** Subscribe to theme changes. @returns {() => void} unsubscribe */
  subscribe(handler) {
    this.#listeners.add(handler);
    return () => this.#listeners.delete(handler);
  }

  // ── internals ───────────────────────────────────────────────────────────

  #normalise(mode) {
    return mode === SYSTEM || this.#themes.has(mode) ? mode : SYSTEM;
  }

  #apply() {
    const name = this.resolved;
    document.documentElement.dataset.theme = name;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', this.#themes.get(name).themeColor);

    this.#listeners.forEach((handler) => {
      try { handler(name, this.#mode); }
      catch (error) { log.warn('[theme] listener failed', error); }
    });
  }
}

/** Shared instance. Import this, not the class. */
export const theme = new ThemeManager();
