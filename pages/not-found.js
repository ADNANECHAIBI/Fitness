/** Shown when a URL matches no route. */

import { Button } from '../components/index.js';
import { PageFrame } from './page-frame.js';
import { el } from '../scripts/dom.js';
import { T } from '../scripts/language.js';

export default {
  render() {
    return PageFrame({
      children: [
        el('div', { className: 'empty' }, [
          el('p', { className: 'eyebrow', text: T('ui.notFound.code') }),
          el('h2', { className: 'empty__title', text: T('ui.notFound.title') }),
          el('p', { className: 'empty__body', text: T('ui.notFound.body') }),
          Button({ label: T('ui.notFound.action'), variant: 'primary', link: '/' }),
        ]),
      ],
    });
  },
};
