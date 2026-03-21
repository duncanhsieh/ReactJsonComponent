/**
 * jsx-to-json.test.ts
 *
 * Tests for the JSX → JSON AST converter.
 * Focuses on acceptance criteria from PRD §7:
 * "jsxToJson must 100% losslessly convert <div {...props} data-test="1" />"
 */

import { describe, it, expect } from 'vitest';
import { jsxToJson } from '../converters/jsx-to-json';
import type { JsonASTNode } from '../types';

// ---------------------------------------------------------------------------
// Basic elements
// ---------------------------------------------------------------------------

describe('jsxToJson — basic elements', () => {
  it('converts a self-closing div', () => {
    const result = jsxToJson('<div />') as JsonASTNode;
    expect(result.type).toBe('div');
    expect(result.props).toBeUndefined();
    expect(result.children).toBeUndefined();
  });

  it('converts a div with string className', () => {
    const result = jsxToJson('<div className="container" />') as JsonASTNode;
    expect(result.props?.className).toBe('container');
  });

  it('converts a div with numeric prop', () => {
    const result = jsxToJson('<div tabIndex={0} />') as JsonASTNode;
    expect(result.props?.tabIndex).toBe(0);
  });

  it('converts boolean shorthand attribute', () => {
    const result = jsxToJson('<input disabled />') as JsonASTNode;
    expect(result.props?.disabled).toBe(true);
  });

  it('converts text children', () => {
    const result = jsxToJson('<p>Hello World</p>') as JsonASTNode;
    expect(result.children).toContain('Hello World');
  });

  it('converts nested elements', () => {
    const result = jsxToJson('<div><span>text</span></div>') as JsonASTNode;
    expect(result.type).toBe('div');
    const child = result.children?.[0] as JsonASTNode;
    expect(child.type).toBe('span');
    expect(child.children).toContain('text');
  });

  it('converts PascalCase component names', () => {
    const result = jsxToJson('<Button size="lg">Click</Button>') as JsonASTNode;
    expect(result.type).toBe('Button');
    expect(result.props?.size).toBe('lg');
  });
});

// ---------------------------------------------------------------------------
// Expression attributes
// ---------------------------------------------------------------------------

describe('jsxToJson — expression attributes', () => {
  it('converts expression attribute to {{ }} template', () => {
    const result = jsxToJson('<div className={state.theme} />') as JsonASTNode;
    expect(result.props?.className).toBe('{{ state.theme }}');
  });

  it('converts member expression to {{ }} template', () => {
    const result = jsxToJson('<p>{state.count}</p>') as JsonASTNode;
    expect(result.children).toContain('{{ state.count }}');
  });

  it('converts ternary expression in attribute', () => {
    const result = jsxToJson('<div disabled={state.loading ? true : false} />') as JsonASTNode;
    expect(result.props?.disabled).toBe('{{ state.loading ? true : false }}');
  });

  it('converts binary expression to {{ }} template', () => {
    const result = jsxToJson('<p>{state.count + 1}</p>') as JsonASTNode;
    expect(result.children).toContain('{{ state.count + 1 }}');
  });

  it('converts template literal to {{ }} string', () => {
    const result = jsxToJson('<p>{`Hello ${state.name}!`}</p>') as JsonASTNode;
    expect(result.children).toContain('Hello {{ state.name }}!');
  });
});

// ---------------------------------------------------------------------------
// Spread Attribute — PRD acceptance criteria
// ---------------------------------------------------------------------------

describe('jsxToJson — Spread Attributes (PRD §7)', () => {
  it('converts {...props} spread to spread notation', () => {
    const result = jsxToJson('<div {...props} data-test="1" />') as JsonASTNode;

    // The spread should be present
    const propsKeys = Object.keys(result.props ?? {});
    expect(propsKeys).toContain('...props');
    expect(result.props?.['...props']).toBe('{{ props }}');

    // Static prop alongside spread should be preserved
    expect(result.props?.['data-test']).toBe('1');
  });

  it('converts inline object spread {...{ a: 1 }} to individual props', () => {
    const result = jsxToJson('<div {...{ className: "foo", id: "bar" }} />') as JsonASTNode;
    expect(result.props?.className).toBe('foo');
    expect(result.props?.id).toBe('bar');
  });

  it('handles multiple spread attributes', () => {
    const result = jsxToJson('<div {...a} {...b} />') as JsonASTNode;
    expect(result.props?.['...a']).toBe('{{ a }}');
    expect(result.props?.['...b']).toBe('{{ b }}');
  });
});

// ---------------------------------------------------------------------------
// Event handlers / ActionBinding
// ---------------------------------------------------------------------------

describe('jsxToJson — event handlers', () => {
  it('converts () => actionName() to ActionBinding', () => {
    const result = jsxToJson('<button onClick={() => increment()}>+</button>') as JsonASTNode;
    const onClick = result.props?.onClick as { action: string };
    expect(onClick?.action).toBe('increment');
  });

  it('converts () => actionName(arg) with args', () => {
    const result = jsxToJson(
      '<button onClick={() => fetchUser(state.id)}>Load</button>',
    ) as JsonASTNode;
    const onClick = result.props?.onClick as { action: string; args: unknown[] };
    expect(onClick?.action).toBe('fetchUser');
    expect(onClick?.args).toContain('{{ state.id }}');
  });

  it('converts direct call expression onClick={submit(data)}', () => {
    const result = jsxToJson('<form onClick={submit(data)} />') as JsonASTNode;
    const onClick = result.props?.onClick as { action: string };
    expect(onClick?.action).toBe('submit');
  });
});

// ---------------------------------------------------------------------------
// Directives
// ---------------------------------------------------------------------------

describe('jsxToJson — directives', () => {
  it('converts $if attribute to $if directive', () => {
    const result = jsxToJson('<div $if="{{state.show}}">content</div>') as JsonASTNode;
    expect(result.$if).toBeDefined();
  });

  it('converts $each/$as/$key attributes to directives', () => {
    // Note: $each, $as, $key are custom directives passed as JSX string attributes.
    // The {{ }} syntax cannot be embedded directly in JSX string attributes (Babel parse error).
    // Instead, in real usage they're expression attributes or plain strings.
    const result = jsxToJson(
      '<li $each={state.items} $as="item" $key={item.id}>{item.name}</li>',
    ) as JsonASTNode;
    expect(result.$each).toBeDefined();
    expect(result.$as).toBe('item');
    expect(result.$key).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

describe('jsxToJson — fragments', () => {
  it('converts a fragment to an array of nodes', () => {
    const result = jsxToJson('<><div /><span /></>');
    expect(Array.isArray(result)).toBe(true);
    const nodes = result as JsonASTNode[];
    expect(nodes).toHaveLength(2);
    expect(nodes[0].type).toBe('div');
    expect(nodes[1].type).toBe('span');
  });
});

// ---------------------------------------------------------------------------
// Round-trip verification (PRD §7 acceptance criterion)
// ---------------------------------------------------------------------------

describe('jsxToJson — PRD acceptance criterion', () => {
  it('100% converts <div {...props} data-test="1" /> without loss', () => {
    const jsx = '<div {...props} data-test="1" />';
    const result = jsxToJson(jsx) as JsonASTNode;

    // Must retain type
    expect(result.type).toBe('div');

    // Must have spread props
    expect(result.props).toBeDefined();
    const keys = Object.keys(result.props!);
    expect(keys.some((k) => k.startsWith('...'))).toBe(true);

    // Must retain data-test
    expect(result.props?.['data-test']).toBe('1');
  });
});
