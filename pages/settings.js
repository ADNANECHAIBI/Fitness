/**
 * Settings — appearance, data and what the app is.
 *
 * Backup, restore and reset all go through SyncService, which owns the
 * boundary between storage and the caches built on top of it.
 */

import { Button, Modal, ListGroup, ListRow, toast, ReasonList } from '../components/index.js';
import { PageFrame } from './page-frame.js';
import { live, swap } from './live-region.js';
import { el } from '../scripts/dom.js';
import { theme } from '../scripts/theme.js';
import { language, T, t } from '../scripts/language.js';
import { APP } from '../scripts/config.js';
import { SyncService, NotificationEngine, Cache } from '../app/index.js';
import { ImportError } from '../validators/index.js';
import { EVENTS } from '../events/index.js';

let teardown = null;
let control = null;
let languageControl = null;
let filePicker = null;
let confirmReset = null;
let about = null;

/** Segmented control bound to the theme manager. */
function ThemeControl() {
  const buttons = theme.options.map((option) =>
    Button({
      // The theme manager's own labels are English. The key is derived from
      // the value; a theme registered at run time has no key and falls back
      // to the label it registered with.
      label: t(`ui.settings.theme.${option.value}`) === `ui.settings.theme.${option.value}`
        ? option.label
        : T(`ui.settings.theme.${option.value}`),
      variant: 'ghost', size: 'sm',
      pressed: theme.mode === option.value,
      onClick: () => theme.set(option.value),
    }));

  const group = el('div', { className: 'segmented', role: 'group', 'aria-label': T('ui.a11y.appearance') }, buttons);

  group.unsubscribe = theme.subscribe(() => {
    theme.options.forEach((option, i) => {
      const active = theme.mode === option.value;
      buttons[i].classList.toggle('is-pressed', active);
      buttons[i].setAttribute('aria-pressed', String(active));
    });
  });

  return group;
}

/**
 * The same segmented control, bound to the language manager.
 *
 * It repaints itself from `language.subscribe` rather than being rebuilt, so
 * switching language does not re-render the page it lives on.
 */
function LanguageControl() {
  const options = language.options;

  const buttons = options.map((option) =>
    Button({
      label: option.label, variant: 'ghost', size: 'sm',
      pressed: language.current === option.value,
      onClick: () => language.set(option.value),
    }));

  const group = el('div', {
    className: 'segmented', role: 'group', 'aria-label': T('ui.a11y.language'),
  }, buttons);

  group.unsubscribe = language.subscribe(() => {
    options.forEach((option, i) => {
      const active = language.current === option.value;
      buttons[i].classList.toggle('is-pressed', active);
      buttons[i].setAttribute('aria-pressed', String(active));
    });
  });

  return group;
}

function render(host) {
  const status = SyncService.status();
  const stored = Object.entries(status.records).filter(([, count]) => count > 0);

  control?.unsubscribe?.();
  control = ThemeControl();
  languageControl?.unsubscribe?.();
  languageControl = LanguageControl();

  swap(host,
    el('section', { className: 'section' }, [
      el('h2', { className: 'section__title', text: T('ui.settings.appearance') }),
      control,
    ]),

    el('section', { className: 'section' }, [
      el('h2', { className: 'section__title', text: T('ui.settings.language') }),
      languageControl,
      el('p', { className: 'section__note', text: T('ui.settings.languageNote') }),
    ]),

    ListGroup({
      title: T('ui.settings.units'),
      rows: [
        ListRow({ label: T('ui.settings.weight'), value: T('ui.unit.kg') }),
        ListRow({ label: T('ui.settings.distance'), value: T('ui.unit.km') }),
        ListRow({ label: T('ui.settings.money'), value: T('ui.unit.mad') }),
      ],
      note: T('ui.settings.unitsNote'),
    }),

    ListGroup({
      title: T('ui.settings.storedData'),
      rows: [
        ListRow({ label: T('ui.settings.recordsOnDevice'), value: String(status.total) }),
        ...stored.map(([name, count]) => ListRow({ label: name, value: String(count) })),
      ],
      note: T('ui.settings.storedNote'),
    }),

    el('section', { className: 'section' }, [
      el('h2', { className: 'section__title', text: T('ui.settings.backup') }),
      el('div', { className: 'actions' }, [
        Button({
          label: T('ui.settings.exportJson'),
          onClick: () => toast(t('ui.settings.saved', { file: SyncService.download() }), { tone: 'success' }),
        }),
        Button({ label: T('ui.settings.importJson'), onClick: () => filePicker.click() }),
        Button({ label: T('ui.settings.resetData'), onClick: () => confirmReset.open() }),
      ]),
    ]),

    ListGroup({
      title: T('ui.settings.caches'),
      rows: status.caches.map((cache) => ListRow({
        label: cache.name,
        value: T('ui.settings.cacheHits', { n: cache.hits }),
        detail: T('ui.settings.cacheMisses', { n: cache.misses }),
      })),
      note: T('ui.settings.cachesNote'),
    }),

    el('div', { className: 'actions' }, [
      Button({ label: T('ui.settings.clearCaches'), size: 'sm', variant: 'ghost', onClick: () => {
        toast(t('ui.settings.cachesCleared', { n: Cache.invalidateAll() }));
        render(host);
      } }),
      Button({ label: T('ui.settings.markRead'), size: 'sm', variant: 'ghost', onClick: () => {
        toast(t('ui.settings.markedRead', { n: NotificationEngine.markAllRead() }));
      } }),
      Button({ label: T('ui.settings.about'), size: 'sm', variant: 'ghost', onClick: () => about.open() }),
    ]),
  );
}

export default {
  render() {
    filePicker = el('input', {
      type: 'file', accept: 'application/json,.json', className: 'visually-hidden',
      'aria-label': T('ui.a11y.importFile'), tabIndex: -1,
      on: {
        change: async (event) => {
          const [file] = event.target.files;
          if (!file) return;

          try {
            const { restored, skipped } = await SyncService.importFile(file);
            const count = Object.values(restored).reduce((sum, n) => sum + n, 0);
            toast(skipped.length
              ? t('ui.settings.restoredPartial', { n: count, skipped: skipped.length })
              : t('ui.settings.restored', { n: count }), { tone: skipped.length ? 'info' : 'success' });
          } catch (error) {
            toast(error instanceof ImportError ? error.message : t('ui.settings.badFile'), { tone: 'error' });
          } finally {
            event.target.value = '';
          }
        },
      },
    });

    confirmReset = Modal({
      title: T('ui.settings.deleteTitle'),
      description: T('ui.settings.deleteDescription'),
      actions: [
        Button({ label: T('ui.common.cancel'), onClick: () => confirmReset.close() }),
        Button({ label: T('ui.settings.deleteAll'), variant: 'primary', onClick: () => { confirmReset.close(); SyncService.reset(); } }),
      ],
    });

    about = Modal({
      // The app's name is a name, not a label: it is the same in every language.
      title: APP.name,
      description: T('ui.settings.aboutDescription', { version: APP.version }),
      children: [el('p', { className: 'section__note', text: T('ui.settings.aboutNote') })],
      actions: [Button({ label: T('ui.common.close'), variant: 'primary', onClick: () => about.close() })],
    });

    const host = el('div', { className: 'stack' });
    return PageFrame({ lead: T('ui.settings.lead'), children: [host] });
  },

  mount(node) {
    node.append(filePicker, confirmReset.element, about.element);
    const host = node.querySelector('.stack');
    render(host);
    teardown = live([EVENTS.DATA_IMPORTED, EVENTS.DATA_RESET, EVENTS.SETTINGS_CHANGED], () => render(host));
  },

  unmount() {
    teardown?.(); teardown = null;
    control?.unsubscribe?.();
    languageControl?.unsubscribe?.();
    [filePicker, confirmReset?.element, about?.element].forEach((node) => node?.remove());
    control = languageControl = filePicker = confirmReset = about = null;
  },
};
