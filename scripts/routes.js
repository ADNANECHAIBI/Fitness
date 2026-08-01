/**
 * routes.js — the route table.
 *
 * Single source of truth for navigation: the router, the header title and the
 * bottom navigation all read from this one array. Adding a page means adding
 * one entry here and one file in pages/ — nothing else.
 *
 * Fields
 *   path      URL path, always starting with "/"
 *   name      internal id, also used as the page module name
 *   titleKey  translation key for the header and document.title
 *   title     the translated title, read through a getter so it always
 *             reflects the language in use at the moment it is asked for
 *   load      dynamic import — the page module is fetched only when first visited
 *   nav       bottom-navigation entry, or null to keep the page out of the bar
 */

import { t } from './language.js';

/** SVG path data for the navigation icons. Kept here so pages stay markup-free. */
const ICONS = {
  dashboard: 'M4 11.2 12 5l8 6.2V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  gym: 'M4 9h2v6H4zm14 0h2v6h-2zM7 7h2v10H7zm8 0h2v10h-2zM9 11h6v2H9z',
  running: 'M14.5 5.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM9 9.2 12.2 7l2.6 1.4 1.6 3 2.6.9-.6 1.9-3.6-1.2-1-1.9-1.2 3.3 2.6 2.4.9 5h-2.1l-.8-4-3.4-3 .6-4.2-2 1.2-.9 2.6-1.9-.7 1.1-3.2z',
  nutrition: 'M6 3h1.6v7.2H9V3h1.6v7.2H12V3h1.6v8.4a3 3 0 0 1-2.2 2.9V21H8.6v-6.7a3 3 0 0 1-2.6-3zM18 3c1.4 1.6 2 4.1 2 6.6 0 2-.6 3.4-2 3.9V21h-1.8V3z',
  progress: 'M4 18h2.6v3H4zm4.7-5h2.6v8H8.7zm4.7-4H16v12h-2.6zm4.7-6H20v18h-2.6z',
  settings: 'M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2zm8.6 3.6c0 .5 0 1-.1 1.4l2 1.6-2 3.4-2.4-1a7.6 7.6 0 0 1-2.4 1.4l-.4 2.6h-4l-.4-2.6a7.6 7.6 0 0 1-2.4-1.4l-2.4 1-2-3.4 2-1.6a8 8 0 0 1 0-2.8l-2-1.6 2-3.4 2.4 1a7.6 7.6 0 0 1 2.4-1.4L11 2h4l.4 2.6c.9.3 1.7.8 2.4 1.4l2.4-1 2 3.4-2 1.6c.1.4.1.9.1 1.4z',
};

export const ROUTES = [
  {
    path: '/',
    name: 'dashboard',
    titleKey: 'nav.dashboard',
    get title() { return t(this.titleKey); },
    load: () => import('../pages/dashboard.js'),
    nav: { labelKey: 'nav.dashboard', icon: ICONS.dashboard },
  },
  {
    path: '/gym',
    name: 'gym',
    titleKey: 'nav.gym',
    get title() { return t(this.titleKey); },
    load: () => import('../pages/gym.js'),
    nav: { labelKey: 'nav.gym', icon: ICONS.gym },
  },
  {
    path: '/running',
    name: 'running',
    titleKey: 'nav.running',
    get title() { return t(this.titleKey); },
    load: () => import('../pages/running.js'),
    nav: { labelKey: 'nav.running', icon: ICONS.running },
  },
  {
    path: '/nutrition',
    name: 'nutrition',
    titleKey: 'nav.nutrition',
    get title() { return t(this.titleKey); },
    load: () => import('../pages/nutrition.js'),
    nav: { labelKey: 'nav.nutrition', icon: ICONS.nutrition },
  },
  {
    path: '/meals',
    name: 'meals',
    titleKey: 'nav.meals',
    get title() { return t(this.titleKey); },
    load: () => import('../pages/meals.js'),
    nav: null,
  },
  {
    path: '/progress',
    name: 'progress',
    titleKey: 'nav.progress',
    get title() { return t(this.titleKey); },
    load: () => import('../pages/progress.js'),
    nav: { labelKey: 'nav.progress', icon: ICONS.progress },
  },
  {
    path: '/settings',
    name: 'settings',
    titleKey: 'nav.settings',
    get title() { return t(this.titleKey); },
    load: () => import('../pages/settings.js'),
    nav: { labelKey: 'nav.settings', icon: ICONS.settings },
  },

  // Reachable from the header avatar and the dashboard, not from the tab bar.
  {
    path: '/profile',
    name: 'profile',
    titleKey: 'nav.profile',
    get title() { return t(this.titleKey); },
    load: () => import('../pages/profile.js'),
    nav: null,
  },
  {
    path: '/welcome',
    name: 'onboarding',
    titleKey: 'nav.welcome',
    get title() { return t(this.titleKey); },
    load: () => import('../pages/onboarding.js'),
    nav: null,
  },
  {
    path: '/calendar',
    name: 'calendar',
    titleKey: 'nav.calendar',
    get title() { return t(this.titleKey); },
    load: () => import('../pages/calendar.js'),
    nav: null,
  },
];

/** Shown when a URL matches nothing. Not part of ROUTES, so it never navigates. */
export const NOT_FOUND = {
  path: '/404',
  name: 'not-found',
  titleKey: 'nav.notFound',
  get title() { return t(this.titleKey); },
  load: () => import('../pages/not-found.js'),
  nav: null,
};

/** Routes that appear in the bottom navigation, in order. */
export const NAV_ROUTES = ROUTES.filter((route) => route.nav);

/** Look up a route by its path. @returns {object|null} */
export function findRoute(path) {
  return ROUTES.find((route) => route.path === path) ?? null;
}
