/**
 * json-to-jsx.test.ts
 *
 * Tests for the JSON AST → JSX reverse converter.
 * Also serves as round-trip tests with jsx-to-json.
 */

import { describe, it, expect } from 'vitest';
import { jsonToJsx } from '../converters/json-to-jsx';
import type { JsonASTNode } from '../types';

// ---------------------------------------------------------------------------
// Basic elements
// ---------------------------------------------------------------------------

describe('jsonToJsx — basic elements', () => {
  it('renders a self-closing element', () => {
    const node: JsonASTNode = { type: 'div' };
    expect(jsonToJsx(node)).toBe('<div />');
  });

  it('renders a string prop', () => {
    const node: JsonASTNode = { type: 'div', props: { className: 'container' } };
    expect(jsonToJsx(node)).toContain('className="container"');
  });

  it('renders a numeric prop', () => {
    const node: JsonASTNode = { type: 'div', props: { tabIndex: 0 } };
    expect(jsonToJsx(node)).toContain('tabIndex={0}');
  });

  it('renders boolean true as shorthand', () => {
    const node: JsonASTNode = { type: 'input', props: { disabled: true } };
    expect(jsonToJsx(node)).toContain('disabled');
    // Should NOT render disabled={true}
    expect(jsonToJsx(node)).not.toContain('disabled={true}');
  });

  it('renders text children inline', () => {
    const node: JsonASTNode = { type: 'p', children: ['Hello World'] };
    expect(jsonToJsx(node)).toBe('<p>Hello World</p>');
  });

  it('renders nested elements', () => {
    const node: JsonASTNode = {
      type: 'div',
      children: [{ type: 'span', children: ['text'] }],
    };
    const result = jsonToJsx(node);
    expect(result).toContain('<span>text</span>');
    expect(result).toContain('<div>');
    expect(result).toContain('</div>');
  });
});

// ---------------------------------------------------------------------------
// Expression props
// ---------------------------------------------------------------------------

describe('jsonToJsx — expression props', () => {
  it('converts {{ expr }} string prop to {expr}', () => {
    const node: JsonASTNode = {
      type: 'div',
      props: { className: '{{ state.theme }}' },
    };
    expect(jsonToJsx(node)).toContain('className={state.theme}');
  });

  it('converts {{ expr }} text child to {expr}', () => {
    const node: JsonASTNode = {
      type: 'p',
      children: ['{{ state.count }}'],
    };
    expect(jsonToJsx(node)).toContain('{state.count}');
  });

  it('converts mixed text with {{ }} to template literal', () => {
    const node: JsonASTNode = {
      type: 'p',
      children: ['Hello {{ state.name }}!'],
    };
    const result = jsonToJsx(node);
    expect(result).toContain('`Hello ${state.name}!`');
  });
});

// ---------------------------------------------------------------------------
// ActionBinding
// ---------------------------------------------------------------------------

describe('jsonToJsx — ActionBinding props', () => {
  it('converts ActionBinding to arrow function without args', () => {
    const node: JsonASTNode = {
      type: 'button',
      props: { onClick: { action: 'increment' } },
      children: ['+'],
    };
    expect(jsonToJsx(node)).toContain('onClick={() => increment()}');
  });

  it('converts ActionBinding with args', () => {
    const node: JsonASTNode = {
      type: 'button',
      props: {
        onClick: { action: 'fetchUser', args: ['{{ state.userId }}'] },
      },
      children: ['Load'],
    };
    const result = jsonToJsx(node);
    expect(result).toContain('onClick={() => fetchUser(state.userId)}');
  });
});

// ---------------------------------------------------------------------------
// Spread props
// ---------------------------------------------------------------------------

describe('jsonToJsx — spread props', () => {
  it('converts ...key spread to {...key}', () => {
    const node: JsonASTNode = {
      type: 'div',
      props: { '...props': '{{ props }}', 'data-test': '1' },
    };
    const result = jsonToJsx(node);
    expect(result).toContain('{...props}');
    expect(result).toContain('data-test="1"');
  });
});

// ---------------------------------------------------------------------------
// Directives
// ---------------------------------------------------------------------------

describe('jsonToJsx — directives', () => {
  it('converts $if to && conditional', () => {
    const node: JsonASTNode = {
      type: 'p',
      $if: '{{ state.show }}',
      children: ['Visible'],
    };
    const result = jsonToJsx(node);
    expect(result).toContain('state.show &&');
  });

  it('converts $each to .map()', () => {
    const node: JsonASTNode = {
      type: 'li',
      $each: '{{ state.items }}',
      $as: 'item',
      $key: '{{ item.id }}',
      children: ['{{ item.name }}'],
    };
    const result = jsonToJsx(node);
    expect(result).toContain('.map((item, index)');
    expect(result).toContain('item.id');
  });
});

// ---------------------------------------------------------------------------
// Array of nodes (fragment)
// ---------------------------------------------------------------------------

describe('jsonToJsx — arrays', () => {
  it('wraps multiple nodes in a Fragment', () => {
    const nodes: JsonASTNode[] = [{ type: 'div' }, { type: 'span' }];
    const result = jsonToJsx(nodes);
    expect(result).toContain('<>');
    expect(result).toContain('</>');
  });
});

// ---------------------------------------------------------------------------
// Round-trip: json → jsx → json
// ---------------------------------------------------------------------------

describe('Round-trip: jsonToJsx output is parseable by jsxToJson', () => {
  it('round-trips a simple node', async () => {
    const { jsxToJson } = await import('../converters/jsx-to-json');

    const original: JsonASTNode = {
      type: 'div',
      props: { className: 'wrapper' },
      children: ['Hello {{ state.name }}'],
    };

    const jsx = jsonToJsx(original);
    const recovered = jsxToJson(jsx) as JsonASTNode;

    expect(recovered.type).toBe('div');
    expect(recovered.props?.className).toBe('wrapper');
  });

  it('round-trips a node with spread and data attribute (PRD §7)', async () => {
    const { jsxToJson } = await import('../converters/jsx-to-json');

    // Start from JSX (PRD acceptance input)
    const originalJsx = '<div {...props} data-test="1" />';
    const jsonAst = jsxToJson(originalJsx) as JsonASTNode;

    // Convert back to JSX
    const recoveredJsx = jsonToJsx(jsonAst);

    // Parse recovered JSX again — must not throw
    expect(() => jsxToJson(recoveredJsx)).not.toThrow();

    const recoveredAst = jsxToJson(recoveredJsx) as JsonASTNode;
    expect(recoveredAst.type).toBe('div');
    // data-test must survive round-trip
    expect(recoveredAst.props?.['data-test']).toBe('1');
  });

  it('round-trips a node with contextName', async () => {
    const { jsxToJson } = await import('../converters/jsx-to-json');

    const original: JsonASTNode = {
      type: 'ThemeProvider',
      contextName: 'theme',
      props: { value: 'dark' },
    };

    const jsx = jsonToJsx(original);
    // Should emit <ThemeProvider contextName="theme" value="dark" />
    expect(jsx).toContain('contextName="theme"');

    const recovered = jsxToJson(jsx) as JsonASTNode;
    expect(recovered.type).toBe('ThemeProvider');
    expect(recovered.contextName).toBe('theme');
    expect(recovered.props?.value).toBe('dark');
  });
});
