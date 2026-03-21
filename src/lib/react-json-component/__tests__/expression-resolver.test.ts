/**
 * expression-resolver.test.ts
 *
 * Tests for the {{ }} template expression resolver.
 */

import { describe, it, expect } from 'vitest';
import { resolveExpression, resolveProps, isExpression, isActionBinding } from '../expression-resolver';
import type { RenderContext } from '../types';

const makeCtx = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  state: { count: 3, name: 'Bob', flag: true },
  setState: () => {},
  props: { id: 7 },
  options: {},
  ...overrides,
});

describe('isExpression', () => {
  it('returns true for strings containing {{ }}', () => {
    expect(isExpression('{{ state.count }}')).toBe(true);
    expect(isExpression('Hello {{ state.name }}')).toBe(true);
  });

  it('returns false for plain strings', () => {
    expect(isExpression('hello world')).toBe(false);
    expect(isExpression('')).toBe(false);
  });
});

describe('resolveExpression — single expression (preserves type)', () => {
  it('returns the raw number value', () => {
    expect(resolveExpression('{{ state.count }}', makeCtx())).toBe(3);
  });

  it('returns the raw boolean value', () => {
    expect(resolveExpression('{{ state.flag }}', makeCtx())).toBe(true);
  });

  it('returns the raw string value', () => {
    expect(resolveExpression('{{ state.name }}', makeCtx())).toBe('Bob');
  });

  it('returns a computed number', () => {
    expect(resolveExpression('{{ state.count + 2 }}', makeCtx())).toBe(5);
  });
});

describe('resolveExpression — mixed strings (coerces to string)', () => {
  it('interpolates expression into surrounding text', () => {
    expect(resolveExpression('Hello {{ state.name }}!', makeCtx())).toBe('Hello Bob!');
  });

  it('interpolates multiple expressions', () => {
    expect(
      resolveExpression('{{ state.name }} has {{ state.count }} items', makeCtx()),
    ).toBe('Bob has 3 items');
  });

  it('returns plain strings as-is (no expressions)', () => {
    expect(resolveExpression('static text', makeCtx())).toBe('static text');
  });
});

describe('resolveExpression — loop vars', () => {
  it('resolves item from loopVars', () => {
    const ctx = makeCtx({ loopVars: { item: { id: 99, title: 'Test' }, index: 0 } });
    expect(resolveExpression('{{ item.title }}', ctx)).toBe('Test');
    expect(resolveExpression('{{ item.id }}', ctx)).toBe(99);
    expect(resolveExpression('{{ index }}', ctx)).toBe(0);
  });
});

describe('resolveProps', () => {
  it('resolves all props containing expressions', () => {
    const ctx = makeCtx();
    const result = resolveProps(
      {
        className: 'btn',
        label: '{{ state.name }}',
        disabled: '{{ state.flag }}',
        count: '{{ state.count }}',
      },
      ctx,
    );

    // className is a plain string — returned as-is
    expect(result.className).toBe('btn');
    // label is a single {{ }} → string
    expect(result.label).toBe('Bob');
    // disabled single {{ }} → boolean
    expect(result.disabled).toBe(true);
    // count single {{ }} → number
    expect(result.count).toBe(3);
  });

  it('passes through ActionBindings unchanged', () => {
    const ctx = makeCtx();
    const binding = { action: 'submit', args: [] };
    const result = resolveProps({ onClick: binding }, ctx);
    expect(result.onClick).toEqual(binding);
  });
});

describe('isActionBinding', () => {
  it('returns true for valid ActionBinding', () => {
    expect(isActionBinding({ action: 'doSomething' })).toBe(true);
  });

  it('returns false for plain objects without action key', () => {
    expect(isActionBinding({ foo: 'bar' })).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isActionBinding('click')).toBe(false);
    expect(isActionBinding(null)).toBe(false);
    expect(isActionBinding(42)).toBe(false);
  });
});

describe('resolveExpression — Extreme Edge Cases', () => {
  it('handles multiple adjacent expressions', () => {
    const ctx = makeCtx({ state: { a: '1', b: '2', c: '3' } });
    expect(resolveExpression('{{ state.a }}{{ state.b }}{{ state.c }}', ctx)).toBe('123');
  });

  it('handles expressions containing newlines', () => {
    expect(resolveExpression('{{\n  state.name\n}}', makeCtx())).toBe('Bob');
  });

  it('handles empty expressions safely', () => {
    expect(resolveExpression('{{ }}', makeCtx())).toBeUndefined();
    expect(resolveExpression('{{}}', makeCtx())).toBeUndefined();
  });

  it('handles massive state objects', () => {
    const hugeState: Record<string, string> = {};
    for (let i = 0; i < 1000; i++) {
        hugeState[`prop${i}`] = `value${i}`;
    }
    const ctx = makeCtx({ state: hugeState });
    expect(resolveExpression('{{ state.prop999 }}', ctx)).toBe('value999');
  });
});

