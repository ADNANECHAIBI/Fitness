/**
 * ProgressRing — circular progress indicator drawn in SVG.
 *
 * The arc is a stroked circle whose dash offset is derived from the value, so
 * animating it costs one property and stays on the compositor.
 *
 * @param {object} options
 * @param {number} [options.value]   0–100
 * @param {number} [options.size]    outer diameter in px
 * @param {number} [options.stroke]  ring thickness in px
 * @param {string} [options.label]   caption under the number
 * @param {boolean}[options.showValue]
 * @returns {HTMLElement & { setValue: (n: number) => void }}
 *
 * @example ProgressRing({ value: 62, label: 'Week' })
 */
import { el, svgEl } from '../scripts/dom.js';
import { t } from '../scripts/language.js';

export function ProgressRing({
  value = 0,
  size = 92,
  stroke = 7,
  label = '',
  showValue = true,
} = {}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const track = svgEl('circle', {
    class: 'ring__track',
    cx: size / 2, cy: size / 2, r: radius,
    fill: 'none', 'stroke-width': stroke,
  });

  const arc = svgEl('circle', {
    class: 'ring__arc',
    cx: size / 2, cy: size / 2, r: radius,
    fill: 'none', 'stroke-width': stroke, 'stroke-linecap': 'round',
    'stroke-dasharray': circumference,
    'stroke-dashoffset': circumference,
    transform: `rotate(-90 ${size / 2} ${size / 2})`,
  });

  const svg = svgEl('svg', {
    class: 'ring__svg', width: size, height: size,
    viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true',
  });
  svg.append(track, arc);

  const readout = showValue
    ? el('span', { className: 'ring__value', text: `${Math.round(value)}%` })
    : null;

  const node = el('div', {
    className: 'ring',
    role: 'img',
    'aria-label': `${label || t('ui.a11y.progress')}: ${Math.round(value)}%`,
    style: { width: `${size}px` },
  }, [
    el('div', { className: 'ring__stack', style: { height: `${size}px` } },
      [svg, readout]),
    label && el('span', { className: 'ring__label', text: label }),
  ]);

  /** Update the arc. Safe to call on every frame. */
  node.setValue = (next) => {
    const clamped = Math.max(0, Math.min(100, next));
    arc.setAttribute('stroke-dashoffset', circumference * (1 - clamped / 100));
    if (readout) readout.textContent = `${Math.round(clamped)}%`;
    node.setAttribute('aria-label', `${label || t('ui.a11y.progress')}: ${Math.round(clamped)}%`);
  };

  // Set on the next frame so the initial fill animates from empty.
  requestAnimationFrame(() => node.setValue(value));

  return node;
}
