/**
 * appetite-rules.js — eating what has been prescribed when that is hard.
 *
 * A plan nobody can finish is not a plan. These rules trade volume for density
 * when the appetite is small, and the reverse when it is not.
 */

import { defineRule } from '../rule.js';

export const appetiteRules = [
  defineRule({
    id: 'appetite.low-prefers-density',
    name: 'A small appetite needs dense food',
    scope: 'day',
    priority: 100,
    when: (context) => context.appetite === 'low',
    apply: () => ({
      patch: { calorieDense: true, avoidBulky: true },
      message: `Food is chosen for energy per mouthful rather than for volume. With a small appetite the limit is how much you can physically finish, not what the numbers say.`,
    }),
  }),

  defineRule({
    id: 'appetite.low-limits-fibre-bulk',
    name: 'Keep the filling food in check',
    scope: 'day',
    priority: 90,
    when: (context, draft) => context.appetite === 'low' && draft.calorieDense,
    apply: () => ({
      patch: { fibreCeiling: true },
      message: `Bulky, very filling foods are kept to a smaller share. They are good food, but on a surplus they fill you up before the calories are in.`,
    }),
  }),

  defineRule({
    id: 'appetite.high-prefers-volume',
    name: 'A large appetite can take volume',
    scope: 'day',
    priority: 80,
    when: (context) => context.appetite === 'high',
    apply: () => ({
      patch: { calorieDense: false, preferVolume: true },
      message: `Higher-volume, more filling foods are preferred — with a strong appetite they cost nothing and keep hunger steadier.`,
    }),
  }),

  defineRule({
    id: 'appetite.surplus-with-low-appetite',
    name: 'A surplus with a small appetite',
    scope: 'day',
    priority: 70,
    when: (context) =>
      context.appetite === 'low' &&
      ['bulk', 'lean_bulk'].includes(context.goal),
    apply: () => ({
      patch: { liquidCaloriesHelp: true },
      message: `Gaining weight on a small appetite is the hardest combination there is. Drinkable calories — milk, oil added to cooked food, nut butters — do more than another plate of vegetables.`,
    }),
  }),

  defineRule({
    id: 'appetite.normal',
    name: 'Nothing to adjust',
    scope: 'day',
    priority: 10,
    when: (context, draft) => draft.calorieDense === undefined,
    apply: () => ({
      patch: { calorieDense: false },
      message: `No appetite adjustment — a normal appetite handles the prescribed volume.`,
    }),
  }),
];
