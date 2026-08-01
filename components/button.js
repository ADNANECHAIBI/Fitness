/**
 * Button
 *
 * @param {object}   options
 * @param {string}   options.label
 * @param {'primary'|'secondary'|'ghost'} [options.variant]
 * @param {'sm'|'md'} [options.size]
 * @param {string}   [options.iconPath]  SVG path data drawn before the label
 * @param {string}   [options.link]      route path — navigates when pressed
 * @param {Function} [options.onClick]
 * @param {boolean}  [options.disabled]
 * @param {boolean}  [options.pressed]   for toggle groups (aria-pressed)
 * @returns {HTMLButtonElement}
 *
 * @example Button({ label: 'Save', variant: 'primary', onClick: save })
 */
import { el, icon } from '../scripts/dom.js';

export function Button({
  label,
  variant = 'secondary',
  size = 'md',
  iconPath = null,
  link = null,
  onClick = null,
  disabled = false,
  pressed = null,
} = {}) {
  return el('button', {
    className: `btn btn--${variant} btn--${size}${pressed ? ' is-pressed' : ''}`,
    type: 'button',
    disabled,
    dataset: link ? { link } : {},
    'aria-pressed': pressed === null ? null : String(pressed),
    on: onClick ? { click: onClick } : {},
  }, [
    iconPath && icon(iconPath, { size: size === 'sm' ? 16 : 18, className: 'btn__icon' }),
    el('span', { text: label }),
  ]);
}
