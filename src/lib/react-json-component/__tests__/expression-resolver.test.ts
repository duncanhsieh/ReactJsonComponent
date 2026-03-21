/**
 * expression-resolver.test.ts
 *
 * Tests for the {{ }} template expression resolver.
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveExpression, resolveProps, isExpression, isActionBinding, isFnExpression } from '../expression-resolver';
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

// ---------------------------------------------------------------------------
// isFnExpression
// ---------------------------------------------------------------------------

describe('isFnExpression', () => {
  it('detects no-arg arrow function', () => {
    expect(isFnExpression('() => {}')).toBe(true);
  });

  it('detects arrow function with params', () => {
    expect(isFnExpression('(x, y) => x + y')).toBe(true);
  });

  it('detects single-param arrow without parens', () => {
    expect(isFnExpression('x => x * 2')).toBe(true);
  });

  it('detects async arrow function', () => {
    expect(isFnExpression('async () => {}')).toBe(true);
  });

  it('detects function keyword', () => {
    expect(isFnExpression('function(e) { e.preventDefault(); }')).toBe(true);
  });

  it('returns false for plain value expressions', () => {
    expect(isFnExpression('state.count + 1')).toBe(false);
    expect(isFnExpression('props.label')).toBe(false);
    expect(isFnExpression('true')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Function-expression evaluation via resolveExpression
// ---------------------------------------------------------------------------

describe('resolveExpression — function-definition expressions', () => {
  it('returns a callable arrow function that calls a props-injected function', () => {
    const setTab = vi.fn();
    const ctx = makeCtx({ props: { setTab } });

    const result = resolveExpression('{{ () => { props.setTab(3); } }}', ctx);
    expect(typeof result).toBe('function');

    (result as () => void)();
    expect(setTab).toHaveBeenCalledWith(3);
  });

  it('arrow function with Math.abs usage', () => {
    const ctx = makeCtx({ state: { value: -7 } });
    const fn = resolveExpression('{{ (x) => Math.abs(x) }}', ctx) as (x: number) => number;
    expect(fn(-5)).toBe(5);
  });

  it('arrow function using parseInt', () => {
    const fn = resolveExpression('{{ (s) => parseInt(s, 10) }}', makeCtx()) as (s: string) => number;
    expect(fn('42px')).toBe(42);
  });

  it('arrow function with try/catch', () => {
    const ctx = makeCtx();
    const fn = resolveExpression(
      '{{ () => { try { return JSON.parse("bad"); } catch(e) { return -1; } } }}',
      ctx,
    ) as () => number;
    expect(fn()).toBe(-1);
  });

  it('arrow function can read state via closure', () => {
    const ctx = makeCtx({ state: { multiplier: 4 } });
    const fn = resolveExpression(
      '{{ (x) => x * state.multiplier }}',
      ctx,
    ) as (x: number) => number;
    expect(fn(3)).toBe(12);
  });

  it('returns the function with setState accessible', () => {
    const mockSetState = vi.fn();
    const ctx = makeCtx({ setState: mockSetState, state: { count: 0 } });
    const fn = resolveExpression(
      '{{ () => setState({ count: state.count + 1 }) }}',
      ctx,
    ) as () => void;

    fn();
    expect(mockSetState).toHaveBeenCalledWith({ count: 1 });
  });

  it('returns undefined and warns when expression fails to compile', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx();
    // Use a syntax error that doesn't include '}}' inside the template, which would
    // confuse EXPR_PATTERN into treating it as a non-fn-expression string.
    const result = resolveExpression('{{ () => { return @@bad_syntax; } }}', ctx);
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });


  it('security: window is not accessible inside fn expression', () => {
    const ctx = makeCtx();
    // window should be shadowed to undefined
    const fn = resolveExpression('{{ () => typeof window }}', ctx) as () => string;
    // Our shadowing sets window to undefined, so typeof returns 'undefined'.
    expect(fn()).toBe('undefined');
  });

  it('security: fetch is not accessible inside fn expression', () => {
    const ctx = makeCtx();
    const fn = resolveExpression('{{ () => typeof fetch }}', ctx) as () => string;
    expect(fn()).toBe('undefined');
  });
});
