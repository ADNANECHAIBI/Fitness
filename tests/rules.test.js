/** Tests for the rules infrastructure itself. */

import { describe, it, expect } from './runner.js';
import { defineRule, selectOne, applyAll } from '../rules/rule.js';
import { allRules, DEFAULT_RULE_SETS } from '../rules/index.js';

const alwaysRule = (id, priority, patch = {}) => defineRule({
  id, name: id, scope: 'week', priority,
  when: () => true,
  apply: () => ({ patch, message: `${id} applied for a reason long enough to read.` }),
});

describe('Rules — declaration', () => {
  it('refuses an incomplete rule at import time', () => {
    expect(() => defineRule({ id: 'broken', name: 'x', scope: 'week' })).toThrow();
    expect(() => defineRule({ name: 'x', scope: 'week', when: () => true, apply: () => ({}) })).toThrow();
  });

  it('defaults priority to zero', () => {
    const rule = defineRule({ id: 'a', name: 'a', scope: 'week', when: () => true, apply: () => ({ patch: {}, message: 'x' }) });
    expect(rule.priority).toBe(0);
  });
});

describe('Rules — selectOne', () => {
  it('takes the highest-priority match and stops', () => {
    const result = selectOne([alwaysRule('low', 1, { v: 'low' }), alwaysRule('high', 9, { v: 'high' })], {});
    expect(result.patch.v).toBe('high');
    expect(result.reason.ruleId).toBe('high');
  });

  it('returns nothing when no rule matches', () => {
    const never = defineRule({ id: 'n', name: 'n', scope: 'week', when: () => false, apply: () => ({ patch: {}, message: 'x' }) });
    const result = selectOne([never], {});
    expect(result.reason).toBeNull();
    expect(result.rule).toBeNull();
  });
});

describe('Rules — applyAll', () => {
  it('folds every match in priority order', () => {
    const result = applyAll([alwaysRule('a', 1, { x: 1 }), alwaysRule('b', 2, { y: 2 })], {}, { z: 0 });
    expect(result.draft).toEqual({ z: 0, y: 2, x: 1 });
    expect(result.applied).toEqual(['b', 'a']);
    expect(result.reasons.length).toBe(2);
  });

  it('lets a later rule read what an earlier one decided', () => {
    const first = alwaysRule('first', 10, { count: 1 });
    const second = defineRule({
      id: 'second', name: 'second', scope: 'week', priority: 5,
      when: (ctx, draft) => draft.count === 1,
      apply: (ctx, draft) => ({ patch: { count: draft.count + 1 }, message: 'incremented the count, having seen the first rule run.' }),
    });
    expect(applyAll([first, second], {}, {}).draft.count).toBe(2);
  });

  it('contains a rule that throws instead of losing the whole week', () => {
    const broken = defineRule({
      id: 'broken', name: 'broken', scope: 'week', priority: 100,
      when: () => { throw new Error('boom'); },
      apply: () => ({ patch: {}, message: 'never reached' }),
    });
    const result = applyAll([broken, alwaysRule('good', 1, { ok: true })], {}, {});
    expect(result.draft.ok).toBeTruthy();
    expect(result.applied).toEqual(['good']);
  });

  it('skips a rule that decides something without explaining it', () => {
    const silent = defineRule({
      id: 'silent', name: 'silent', scope: 'week', priority: 50,
      when: () => true,
      apply: () => ({ patch: { sneaky: true } }),      // no message
    });
    expect(applyAll([silent], {}, {}).draft.sneaky).toBeFalsy();
  });
});

describe('Rules — the shipped set', () => {
  it('gives every rule a unique id', () => {
    const ids = allRules().map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names the file each rule belongs to in its id', () => {
    for (const [stage, rules] of Object.entries(DEFAULT_RULE_SETS)) {
      const prefix = stage === 'nutrition' ? 'nutrition' : stage;
      expect(rules.every((rule) => rule.id.startsWith(`${prefix}.`))).toBeTruthy();
    }
  });

  it('always lands on a phase, even from a bare context', () => {
    // selectOne contains a rule that throws, so a context missing fields must
    // still produce a phase rather than nothing.
    const bare = { weekNumber: 3, goal: 'bulk', strain: { index: 0 }, layoff: { onBreak: false }, goalProgress: null };
    expect(selectOne(DEFAULT_RULE_SETS.phase, bare).rule).toBeTruthy();
    expect(selectOne(DEFAULT_RULE_SETS.phase, {}).rule).toBeTruthy();
  });
});
