/**
 * dom.js — tiny DOM helpers.
 *
 * Every component builds its markup with `el()` instead of innerHTML:
 * no HTML parsing, no injection risk, and event handlers attach directly.
 *
 * Translation rides along here rather than in every component. A caller that
 * passes T('ui.common.save') instead of 'Save' gets the same string it always
 * did, plus a note on the node saying which key produced it — which is what
 * lets the language manager rewrite the text later without anybody
 * re-rendering anything.
 */

import { isTranslated, bindText, bindAttr } from './language.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an element.
 *
 * @param {string} tag
 * @param {object} [props]  className, text, html, dataset, on:{event:handler},
 *                          plus any attribute or property name. `text` and any
 *                          attribute may be given a T() instead of a string.
 * @param {(Node|string|null|false)[]} [children]
 * @returns {HTMLElement}
 *
 * @example el('p', { className: 'note', text: 'Hello' })
 * @example el('p', { text: T('ui.common.save') })          // re-translates live
 * @example el('button', { 'aria-label': T('ui.a11y.close') })
 * @example el('button', { on: { click: save } }, ['Save'])
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'className') node.className = value;
    else if (key === 'text') {
      node.textContent = String(value);
      if (isTranslated(value)) bindText(node, value);
    }
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') {
      // Object.assign cannot set custom properties — they need setProperty.
      for (const [prop, val] of Object.entries(value)) {
        if (prop.startsWith('--')) node.style.setProperty(prop, val);
        else node.style[prop] = val;
      }
    }
    else if (key === 'on') {
      for (const [event, handler] of Object.entries(value)) {
        node.addEventListener(event, handler);
      }
    }
    else if (key in node) {
      node[key] = isTranslated(value) ? String(value) : value;
      if (isTranslated(value)) bindAttr(node, key, value);
    }
    else {
      node.setAttribute(key, String(value));
      if (isTranslated(value)) bindAttr(node, key, value);
    }
  }

  append(node, children);
  return node;
}

/** Append children, skipping null/false so callers can use `cond && node`. */
export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return parent;
}

/**
 * Build an inline SVG icon from one or more path definitions.
 * @param {string|string[]} paths  the `d` attribute(s)
 * @param {object} [options]       { size, className, viewBox }
 */
export function icon(paths, { size = 20, className = '', viewBox = '0 0 24 24' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);

  for (const d of [].concat(paths)) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Namespaced SVG element factory, for components that draw their own shapes. */
export function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

/** Remove every child of a node. */
export function clear(node) {
  while (node.firstChild) node.firstChild.remove();
  return node;
}
