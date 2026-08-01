/**
 * language.js — Language Manager.
 *
 * The counterpart to theme.js: one object owns the active language, the
 * writing direction, persistence and notification, and nothing else in the
 * app has to think about any of it.
 *
 * It holds no dictionary of its own. The labels live in data/i18n/, and the
 * architecture test forbids scripts/ from importing data/ — so the i18n
 * module is handed in once, at boot, by script.js:
 *
 *   import * as i18n from './data/i18n/index.js';
 *   language.install(i18n);
 *   language.init();
 *
 * That is not a workaround for the rule; it is the rule working. A language
 * manager that imported its own labels would be a second translation system,
 * and there is already one.
 *
 * Switching language changes text in place. Nothing is re-rendered, no page
 * is rebuilt and no engine runs again: `el()` records which key produced each
 * string, and `apply()` walks those nodes and writes the new text over the
 * old one.
 *
 * @example
 * language.set('ar');            // dir="rtl", lang="ar", every text swapped
 * language.t('ui.common.save');  // 'حفظ'
 * T('ui.dashboard.eaten', { n: 900 });  // a live binding, not a string
 */

import { SettingsRepository } from '../repositories/settings-repository.js';
import { createLogger } from './logger.js';

const log = createLogger('language');

/** The language every other language falls back to. */
const DEFAULT = 'en';

/** Attribute stamped on a node whose text came from a key. */
const TEXT_MARK = 'data-i18n';

/** Attribute listing which of a node's attributes came from keys. */
const ATTR_MARK = 'data-i18n-attr';

/**
 * node → { text, attrs } bindings.
 *
 * Weak on purpose: pages replace their children constantly, and a binding
 * must not be the reason a detached node stays alive. The marker attributes
 * are what `apply()` queries for; this map is where the key and its
 * variables actually live, so nothing has to be serialised into the DOM.
 */
const bindings = new WeakMap();

/* ── A key standing in for a string ─────────────────────────────────────── */

/**
 * A translation key and its variables, usable anywhere a string is expected.
 *
 * Components take text as strings and always will. Handing them one of these
 * instead changes nothing for them — it stringifies to the translation — but
 * it lets `el()` remember which key produced the text, which is what makes
 * switching language a text change rather than a re-render.
 */
class TranslatedText {
  constructor(key, vars, fallback) {
    this.key = key;
    this.vars = vars;
    this.fallback = fallback;
  }

  toString() { return language.t(this.key, this.vars, this.fallback); }
  valueOf() { return this.toString(); }
  get length() { return this.toString().length; }
}

/**
 * Mark text as translatable.
 *
 * The fallback is for labels that belong to a record rather than to the
 * interface: a food or an exercise carries a canonical English name, and a
 * language that has not named it yet should show that name rather than an id.
 * Interface keys pass no fallback, because a missing one is a bug and showing
 * the key is how it gets found.
 *
 * @param {string} key
 * @param {object} [vars]      values for {placeholders} in the label
 * @param {string} [fallback]  text to use when no language defines the key
 * @returns {TranslatedText}
 */
export function T(key, vars = null, fallback = null) {
  return new TranslatedText(key, vars, fallback);
}

/** True for values produced by T(). */
export function isTranslated(value) {
  return value instanceof TranslatedText;
}

/** The key behind a T(), or null for a plain string. */
export function keyOf(value) {
  return value instanceof TranslatedText ? value.key : null;
}

/* ── Binding nodes to keys ──────────────────────────────────────────────── */

/** Remember that a node's text came from a key. Called by dom.js. */
export function bindText(node, translated) {
  const entry = bindings.get(node) ?? {};
  entry.text = translated;
  bindings.set(node, entry);
  node.setAttribute(TEXT_MARK, translated.key);
}

/** Remember that one of a node's attributes came from a key. Called by dom.js. */
export function bindAttr(node, name, translated) {
  const entry = bindings.get(node) ?? {};
  entry.attrs = entry.attrs ?? new Map();
  entry.attrs.set(name, translated);
  bindings.set(node, entry);
  node.setAttribute(ATTR_MARK, [...entry.attrs.keys()].join(' '));
}

/**
 * Re-translate one node from what it was bound to.
 *
 * A node can carry the marker without being in the map — cloneNode() copies
 * attributes, not WeakMap entries. That case still works: the key is in the
 * attribute, only the variables are lost, so it re-translates with none.
 */
function retranslate(node) {
  const entry = bindings.get(node);

  const textKey = node.getAttribute(TEXT_MARK);
  if (textKey !== null) {
    node.textContent = entry?.text
      ? String(entry.text)
      : language.t(textKey);
  }

  const attrNames = node.getAttribute(ATTR_MARK);
  if (attrNames !== null) {
    for (const name of attrNames.split(' ').filter(Boolean)) {
      const bound = entry?.attrs?.get(name);
      if (bound) node.setAttribute(name, String(bound));
    }
  }
}

/* ── The manager ────────────────────────────────────────────────────────── */

class LanguageManager {
  #i18n = null;              // the injected data/i18n module
  #code = DEFAULT;
  #listeners = new Set();
  #warned = new Set();       // keys already complained about, so logs stay readable

  /**
   * Hand the manager the label layer. Called once, from script.js.
   * @param {object} i18n  the data/i18n module namespace
   */
  install(i18n) {
    this.#i18n = i18n;
    return this;
  }

  /**
   * Read the saved language and apply it. Safe to call before install(),
   * before a Settings document exists, and outside a browser.
   */
  init() {
    this.#code = this.#normalise(this.#read());
    this.#i18n?.setLocale(this.#code);
    this.#applyDocument();
    this.apply();
    return this.#code;
  }

  /** The active language code, e.g. 'en' or 'ar'. */
  get current() { return this.#code; }

  /** 'ltr' or 'rtl' for the active language. */
  get dir() { return this.#i18n?.direction(this.#code) ?? 'ltr'; }

  /** True when the active language reads right to left. */
  get isRTL() { return this.dir === 'rtl'; }

  /**
   * Every selectable language, ready for a settings control. The label is the
   * language's own name for itself, which is the one thing that should not be
   * translated: someone looking for Arabic is looking for "العربية".
   *
   * @returns {{value: string, label: string, dir: string}[]}
   */
  get options() {
    return (this.#i18n?.locales() ?? [DEFAULT]).map((value) => ({
      value,
      label: this.t(`language.${value}`),
      dir: this.#i18n?.direction(value) ?? 'ltr',
    }));
  }

  /**
   * Translate a key.
   *
   * Three outcomes, all of them non-fatal:
   *   translated       → the label for the active language
   *   not yet in this  → the English label, noted at debug level
   *   nowhere at all   → the key itself, warned about once
   *
   * @param {string} key
   * @param {object} [vars]      values for {placeholders}
   * @param {string} [fallback]  shown instead of the key when nothing matches
   * @returns {string}
   */
  t(key, vars = null, fallback = null) {
    if (typeof key !== 'string' || key === '') return fallback ?? '';

    const i18n = this.#i18n;
    if (!i18n) return this.#fill(fallback ?? key, vars);   // before install()

    if (!i18n.has(key, this.#code)) {
      if (i18n.has(key, DEFAULT)) {
        this.#note(key, `not translated into "${this.#code}" yet`, 'debug');
      } else if (fallback !== null) {
        // A record that has no label in this language: its own name is the
        // right answer, and it is not something to warn about.
        return this.#fill(fallback, vars);
      } else {
        this.#note(key, 'no label in any language', 'warn');
        return this.#fill(key, vars);             // the key, never a blank or a throw
      }
    }

    return this.#fill(i18n.t(key, { locale: this.#code }), vars);
  }

  /**
   * Switch language: persist the choice, set the document's direction, and
   * write the new text over every bound node.
   *
   * @param {string} code
   * @returns {string} the language actually in use afterwards
   */
  set(code) {
    const next = this.#normalise(code);
    if (next === this.#code) return this.#code;

    this.#code = next;
    this.#i18n?.setLocale(next);

    try {
      SettingsRepository.patch({ language: next });
    } catch (error) {
      // A language registered at runtime is not in the Settings schema. It
      // still applies for this session; it just is not remembered.
      log.warn('preference not saved', error);
    }

    this.#applyDocument();
    this.apply();
    this.#notify();
    return this.#code;
  }

  /**
   * Re-translate a subtree. Defaults to the whole document.
   *
   * This is the entire cost of changing language: one querySelectorAll and a
   * textContent write per bound node. No page is rebuilt, no query is re-run
   * and no engine is asked anything.
   *
   * @param {ParentNode} [root]
   * @returns {number} nodes updated
   */
  apply(root = null) {
    const scope = root ?? (typeof document !== 'undefined' ? document : null);
    if (!scope) return 0;

    const nodes = scope.querySelectorAll(`[${TEXT_MARK}],[${ATTR_MARK}]`);
    for (const node of nodes) retranslate(node);
    return nodes.length;
  }

  /**
   * Subscribe to language changes. The handler is called after the document
   * has been re-translated, for the few things a sweep cannot reach —
   * document.title, a control that paints its own pressed state.
   *
   * @param {(code: string, dir: string) => void} handler
   * @returns {() => void} unsubscribe
   */
  subscribe(handler) {
    this.#listeners.add(handler);
    return () => this.#listeners.delete(handler);
  }

  // ── internals ───────────────────────────────────────────────────────────

  /** The stored preference, or the default when there is nothing saved. */
  #read() {
    try {
      return SettingsRepository.get()?.language ?? DEFAULT;
    } catch (error) {
      log.warn('could not read the saved language', error);
      return DEFAULT;
    }
  }

  /** An unknown code falls back rather than leaving the app untranslated. */
  #normalise(code) {
    const known = this.#i18n?.locales() ?? [DEFAULT];
    return known.includes(code) ? code : DEFAULT;
  }

  /** Substitute {placeholders}. A variable with no value is left visible. */
  #fill(text, vars) {
    if (!vars) return text;
    return String(text).replace(/\{(\w+)\}/g, (match, name) =>
      (vars[name] === undefined || vars[name] === null ? match : String(vars[name])));
  }

  /** Complain about a key once, not once per render. */
  #note(key, message, level) {
    const seen = `${this.#code}:${key}`;
    if (this.#warned.has(seen)) return;
    this.#warned.add(seen);
    log[level](`[language] "${key}" ${message}`);
  }

  /** The two attributes that make the browser lay the page out correctly. */
  #applyDocument() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.lang = this.#code;
    root.dir = this.dir;
  }

  #notify() {
    for (const handler of this.#listeners) {
      try { handler(this.#code, this.dir); }
      catch (error) { log.warn('[language] listener failed', error); }
    }
  }
}

/** Shared instance. Import this, not the class. */
export const language = new LanguageManager();

/** Shorthand for a one-off translation that does not need to stay bound. */
export const t = (key, vars, fallback) => language.t(key, vars, fallback);

/**
 * The display name of a record — a food, an exercise — in the active
 * language, falling back to the canonical name the record carries.
 *
 * The same idea as labelFor() in data/i18n, reachable from the UI, which may
 * not import data/. Ids stay English in the records; only what is read
 * changes.
 *
 * @param {string} prefix   'food' or 'exercise'
 * @param {string} id       the record's id
 * @param {string} name     the record's own name
 */
export function TName(prefix, id, name) {
  return T(`${prefix}.${id}`, null, name);
}

/**
 * Several record labels joined into one phrase.
 *
 * Returned lazily rather than as a string: a joined list handed to T() as a
 * variable would otherwise be frozen in the language it was built in, while
 * the sentence around it changed. Reading it is what translates it.
 *
 * @param {string} prefix   'muscle', 'equipment', …
 * @param {string[]} ids
 */
export function TJoin(prefix, ids) {
  return {
    toString: () => ids
      .map((id) => language.t(`${prefix}.${id}`, null, id))
      .join(language.t('ui.common.listSeparator')),
  };
}
