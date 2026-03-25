/**
 * safe-evaluator.test.ts
 *
 * Tests for the lightweight sandboxed expression evaluator.
 */

import { describe, it, expect } from 'vitest';
import { safeEval, SafeEvalError } from '../safe-evaluator';

// Base context for most tests
const ctx = {
  state: { count: 5, user: 'Alice', show: true, items: [1, 2, 3] },
  props: { id: 42, label: 'Submit' },
};

describe('safeEval — literals', () => {
  it('evaluates number literals', () => {
    expect(safeEval('42', {})).toBe(42);
    expect(safeEval('3.14', {})).toBe(3.14);
  });

  it('evaluates string literals (single quotes)', () => {
    expect(safeEval("'hello'", {})).toBe('hello');
  });

  it('evaluates string literals (double quotes)', () => {
    expect(safeEval('"world"', {})).toBe('world');
  });

  it('evaluates boolean literals', () => {
    expect(safeEval('true', {})).toBe(true);
    expect(safeEval('false', {})).toBe(false);
  });

  it('evaluates null and undefined', () => {
    expect(safeEval('null', {})).toBe(null);
    expect(safeEval('undefined', {})).toBe(undefined);
  });
});

describe('safeEval — identifiers & member access', () => {
  it('resolves top-level identifiers from context', () => {
    expect(safeEval('state', ctx)).toBe(ctx.state);
  });

  it('resolves nested member access', () => {
    expect(safeEval('state.count', ctx)).toBe(5);
    expect(safeEval('state.user', ctx)).toBe('Alice');
  });

  it('resolves dynamic bracket access', () => {
    expect(safeEval("state['count']", ctx)).toBe(5);
  });

  it('resolves props', () => {
    expect(safeEval('props.id', ctx)).toBe(42);
    expect(safeEval('props.label', ctx)).toBe('Submit');
  });
});

describe('safeEval — arithmetic & string concatenation', () => {
  it('adds numbers', () => {
    expect(safeEval('state.count + 1', ctx)).toBe(6);
  });

  it('subtracts numbers', () => {
    expect(safeEval('state.count - 2', ctx)).toBe(3);
  });

  it('multiplies numbers', () => {
    expect(safeEval('state.count * 3', ctx)).toBe(15);
  });

  it('concatenates strings', () => {
    // In our evaluator + with strings coerces via number addition
    // so we keep string concat as JS natural + behavior
    expect(safeEval("'Hello, ' + state.user", ctx)).toBe('Hello, Alice');
  });
});

describe('safeEval — comparisons', () => {
  it('evaluates strict equality', () => {
    expect(safeEval('state.count === 5', ctx)).toBe(true);
    expect(safeEval('state.count === 6', ctx)).toBe(false);
  });

  it('evaluates inequality', () => {
    expect(safeEval('state.count !== 5', ctx)).toBe(false);
    expect(safeEval('state.count !== 6', ctx)).toBe(true);
  });

  it('evaluates greater/less than', () => {
    expect(safeEval('state.count > 3', ctx)).toBe(true);
    expect(safeEval('state.count < 3', ctx)).toBe(false);
  });
});

describe('safeEval — logical operators', () => {
  it('evaluates &&', () => {
    expect(safeEval('state.show && state.count > 0', ctx)).toBeTruthy();
    expect(safeEval('false && state.count > 0', ctx)).toBeFalsy();
  });

  it('evaluates ||', () => {
    expect(safeEval('false || state.count > 0', ctx)).toBeTruthy();
  });

  it('evaluates !', () => {
    expect(safeEval('!state.show', ctx)).toBe(false);
    expect(safeEval('!false', ctx)).toBe(true);
  });
});

describe('safeEval — ternary operator', () => {
  it('returns consequent when condition is truthy', () => {
    expect(safeEval("state.show ? 'visible' : 'hidden'", ctx)).toBe('visible');
  });

  it('returns alternate when condition is falsy', () => {
    expect(safeEval("false ? 'yes' : 'no'", ctx)).toBe('no');
  });

  it('supports nested ternary', () => {
    expect(safeEval('state.count > 10 ? 1 : state.count > 3 ? 2 : 3', ctx)).toBe(2);
  });
});

describe('safeEval — security: blocked identifiers', () => {
  it('blocks window access', () => {
    expect(() => safeEval('window', {})).toThrow(SafeEvalError);
  });

  it('blocks document access', () => {
    expect(() => safeEval('document', {})).toThrow(SafeEvalError);
  });

  it('blocks globalThis access', () => {
    expect(() => safeEval('globalThis', {})).toThrow(SafeEvalError);
  });

  it('blocks eval access', () => {
    expect(() => safeEval('eval', {})).toThrow(SafeEvalError);
  });

  it('blocks Function access', () => {
    expect(() => safeEval('Function', {})).toThrow(SafeEvalError);
  });

  it('blocks constructor access', () => {
    expect(() => safeEval('state.constructor', ctx)).toThrow(SafeEvalError);
  });

  it('blocks __proto__ access', () => {
    expect(() => safeEval('state.__proto__', ctx)).toThrow(SafeEvalError);
  });

  it('blocks prototype access', () => {
    expect(() => safeEval('state.prototype', ctx)).toThrow(SafeEvalError);
  });

  it('blocks localStorage access', () => {
    expect(() => safeEval('localStorage', {})).toThrow(SafeEvalError);
  });

  it('blocks fetch access', () => {
    expect(() => safeEval('fetch', {})).toThrow(SafeEvalError);
  });
});

describe('safeEval — grouping', () => {
  it('respects parentheses for grouping', () => {
    expect(safeEval('(state.count + 2) * 3', ctx)).toBe(21);
  });
});

describe('safeEval — Extreme Edge Cases', () => {
  it('handles deep nested accesses without crashing', () => {
    const deepCtx = { state: { a: { b: { c: { d: { e: { f: { g: 100 } } } } } } } };
    expect(safeEval('state.a.b.c.d.e.f.g', deepCtx)).toBe(100);
  });

  it('safely evaluates non-existent access yielding undefined', () => {
    expect(safeEval('state.nonExistent.deep.property', ctx)).toBeUndefined();
  });

  it('handles very long expressions correctly', () => {
    // const longString = '1 '.repeat(1000) + '+ 1';
    // '1 1 1 ... + 1' -> basically evaluator trims and handles tokens.
    // Actually our simple evaluator might complain about multiple literals '1 1 1' without operators.
    // Let's do '1 + 1 + 1'
    const longAddition = Array(1000).fill('1').join(' + ');
    expect(safeEval(longAddition, ctx)).toBe(1000);
  });

  it('handles empty string expression yielding undefined', () => {
    expect(safeEval('', ctx)).toBeUndefined();
  });

  it('prevents prototype pollution access explicitly', () => {
    expect(() => safeEval("({}).constructor.constructor('return process')()", ctx)).toThrow(SafeEvalError);
    expect(() => safeEval("state['__proto__']['polluted']", ctx)).toThrow(SafeEvalError);
  });

  it('blocks dangerous injection keywords inside strings but allows string evaluation', () => {
    // Strings should just be evaluated as strings, not executed!
    expect(safeEval("\"'; process.exit(); //\"", ctx)).toBe("'; process.exit(); //");
  });

  it('evaluates unicode identifiers gracefully', () => {
    const localeCtx = { state: { 名前: 'Duncan', 'テスト': 42 } };
    expect(safeEval('state.名前', localeCtx)).toBe('Duncan');
    expect(safeEval("state['テスト']", localeCtx)).toBe(42);
  });

  it('handles javascript number extremes', () => {
    // Our evaluator doesn't have Infinity keyword directly built-in as a literal in tokenizer,
    // but we can pass it via context.
    const numCtx = { state: { inf: Infinity, negInf: -Infinity, max: Number.MAX_SAFE_INTEGER, n: NaN } };
    expect(safeEval('state.inf > state.max', numCtx)).toBe(true);
    expect(safeEval('state.negInf < 0', numCtx)).toBe(true);
    // Note: NaN === NaN in JS is false
    expect(safeEval('state.n === state.n', numCtx)).toBe(false);
  });

  it('evaluates template literals with extremes', () => {
    expect(safeEval('``', ctx)).toBe(''); // empty
    expect(safeEval('`Hello ${state.user}`', ctx)).toBe('Hello Alice');
    // Nested `${}` not supported well by simple regex, but simple cases should work.
    expect(safeEval('`Count: ${state.count + 5}`', ctx)).toBe('Count: 10');
  });
});

describe('safeEval — Nullish Coalescing ??', () => {
  it('returns right side when left side is null', () => {
    expect(safeEval('null ?? "default"', {})).toBe('default');
  });

  it('returns right side when left side is undefined', () => {
    expect(safeEval('undefined ?? "default"', {})).toBe('default');
  });

  it('returns left side when it is 0 (truthy in nullish check)', () => {
    expect(safeEval('0 ?? 100', {})).toBe(0);
  });

  it('returns left side when it is empty string', () => {
    expect(safeEval('"" ?? "fallback"', {})).toBe('');
  });

  it('returns left side when it is false', () => {
    expect(safeEval('false ?? true', {})).toBe(false);
  });
});

describe('safeEval — Array Literals [ ]', () => {
  it('evaluates empty array', () => {
    expect(safeEval('[]', {})).toEqual([]);
  });

  it('evaluates array with expressions', () => {
    expect(safeEval('[1, 2 + 1, state.user]', ctx)).toEqual([1, 3, 'Alice']);
  });

  it('handles trailing commas', () => {
    expect(safeEval('[1, 2, ]', {})).toEqual([1, 2]);
  });
});

describe('safeEval — Object Literals { }', () => {
  it('evaluates empty object', () => {
    expect(safeEval('{}', {})).toEqual({});
  });

  it('evaluates object with static and dynamic keys', () => {
    const objCtx = { state: { k: 'dynamicKey', v: 100 } };
    expect(safeEval("{ a: 1, 'b': 2, [state.k]: state.v }", objCtx)).toEqual({
      a: 1,
      b: 2,
      dynamicKey: 100,
    });
  });

  it('handles nested objects', () => {
    expect(safeEval('{ a: { b: 1 } }', {})).toEqual({ a: { b: 1 } });
  });
});

describe('safeEval — Optional Dynamic Indexing ?.[ ]', () => {
  it('resolves when object exists', () => {
    expect(safeEval("state?.[ 'count' ]", ctx)).toBe(5);
  });

  it('short-circuits to undefined when object is null/undefined', () => {
    expect(safeEval("state.notExists?.[ 'p' ]", ctx)).toBeUndefined();
    expect(safeEval("null?.[ 'p' ]", {})).toBeUndefined();
  });
});

describe('safeEval — Comments //', () => {
  it('skips comments', () => {
    const expr = `
      // This is a comment
      state.count + // add one
      1
    `;
    expect(safeEval(expr, ctx)).toBe(6);
  });
});

