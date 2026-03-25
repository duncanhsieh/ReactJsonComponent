/**
 * node-renderer.test.tsx
 *
 * Unit tests for the core AST rendering logic (renderNode, renderEach, renderSingleNode)
 * including all specified extreme edge cases.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { renderNode } from '../node-renderer';
import type { RenderContext, AnalyzedNode } from '../types';

declare const process: any;

const defaultCtx: RenderContext = {
  state: {},
  setState: vi.fn(),
  props: {},
  options: {},
};

describe('node-renderer — Basic functionality', () => {
  it('renders a simple HTML element', () => {
    const node: AnalyzedNode = { type: 'div', props: { className: 'test' }, children: ['Hello'] };
    const element = renderNode(node, defaultCtx) as React.ReactElement;
    expect(element.type).toBe('div');
    expect((element.props as any).className).toBe('test');
    expect((element.props as any).children).toBe('Hello'); // React optimizations sometimes flatten ['Hello'] into 'Hello' if there's only one child. Wait, actually my `renderChildren` returns an array always. Let's see - oh actually `Object.keys()` checking my `renderNode` return. Wait, renderChildren returns `React.ReactNode[]`. If array length is 1, maybe it doesn't get flattened in React.createElement? React.createElement(type, props, ...children). If 1 child, `props.children` is a single string! Let's check: string 'Hello'
  });

  it('renders a primitive child', () => {
     const node: AnalyzedNode = { type: 'span', children: ['42'] }; 
     const element = renderNode(node, defaultCtx) as React.ReactElement;
     expect((element.props as any).children).toBe('42');
  });
});

describe('node-renderer — Extreme Edge Cases: Node Structure', () => {
  it('handles empty AST node', () => {
    const node: AnalyzedNode = { type: 'div' };
    const element = renderNode(node, defaultCtx) as React.ReactElement;
    expect(element.type).toBe('div');
    expect(element.props).toEqual({}); // no children, no props
  });

  it('handles deeply nested nodes without stack overflow (15 levels)', () => {
    let current: AnalyzedNode = { type: 'span', children: ['Deep'] };
    for (let i = 0; i < 15; i++) {
        current = { type: 'div', children: [current] };
    }
    const element = renderNode(current, defaultCtx) as React.ReactElement;
    expect(element.type).toBe('div'); // no crash
  });

  it('handles unknown HTML tags', () => {
    // Should pass it through as a string to React
    const node: AnalyzedNode = { type: 'foo-bar', children: ['custom'] };
    const element = renderNode(node, defaultCtx) as React.ReactElement;
    expect(element.type).toBe('foo-bar');
  });

  it('handles mixed string and node children', () => {
    const node: AnalyzedNode = { type: 'p', children: ['Start ', { type: 'strong', children: ['Bold'] }, ' End'] };
    const element = renderNode(node, defaultCtx) as React.ReactElement;
    const props = element.props as any;
    
    // Check React elements
    expect(Array.isArray(props.children)).toBe(true);
    expect(props.children[0]).toBe('Start ');
    expect(props.children[1].type).toBe('strong');
    expect(props.children[2]).toBe(' End');
  });
});

describe('node-renderer — Extreme Edge Cases: $if', () => {
  it('hides node when $if is falsy (false, 0, "", null)', () => {
    const falsyValues = ['false', '0', "''", 'null', 'undefined'];
    falsyValues.forEach(val => {
       const node: AnalyzedNode = { type: 'div', $if: `{{ ${val} }}`, children: ['Hidden'] };
       expect(renderNode(node, defaultCtx)).toBeNull();
    });
  });

  it('renders node when $if is truthy (true, 1, "text", [], {})', () => {
    // We mock ctx state to hold objects resolving to truthy
    const ctx = { ...defaultCtx, state: { obj: {}, arr: [] } };
    const truthyValues = ['true', '1', "'text'", 'state.obj', 'state.arr'];
    truthyValues.forEach(val => {
       const node: AnalyzedNode = { type: 'div', $if: `{{ ${val} }}`, children: ['Visible'] };
       const element = renderNode(node, ctx) as React.ReactElement;
       expect(element).not.toBeNull();
       expect(element.type).toBe('div');
    });
  });
});

describe('node-renderer — Extreme Edge Cases: $each', () => {
  it('handles $each bound to non-array gracefully', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const node: AnalyzedNode = { type: 'li', $each: '{{ state.notArray }}' };
    const ctx = { ...defaultCtx, state: { notArray: 'string' } };
    
    expect(renderNode(node, ctx)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('handles $each bound to empty array', () => {
    // const node: AnalyzedNode = { type: 'li', $each: '[]' }; // empty array literal logic, though technically our evaluator doesn't do [] literal currently unless its in state. Let's put it in state.
    const ctx = { ...defaultCtx, state: { arr: [] } };
    const nodeEmpty = { type: 'li', $each: '{{ state.arr }}' };
    expect(renderNode(nodeEmpty, ctx)).toEqual([]);
  });

  it('handles massive arrays (1000 items)', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => i);
    const ctx = { ...defaultCtx, state: { arr } };
    const node: AnalyzedNode = { type: 'li', $each: '{{ state.arr }}', children: ['Item'] };
    
    const elements = renderNode(node, ctx) as React.ReactElement[];
    expect(elements).toHaveLength(1000);
    expect(elements[999].type).toBe('li');
  });

  it('handles nested $each (2D lists)', () => {
    const grid = [[1, 2], [3, 4]];
    const ctx = { ...defaultCtx, state: { grid } };
    const node: AnalyzedNode = { 
        type: 'div', 
        $each: '{{ state.grid }}',
        $as: 'row',
        children: [
            {
                type: 'span',
                $each: '{{ row }}',
                $as: 'cell',
                children: ['{{ cell }}']
            }
        ]
    };
    
    const rows = renderNode(node, ctx) as React.ReactElement[];
    expect(rows).toHaveLength(2);
    const firstRowChildren = (rows[0].props as any).children as React.ReactElement[];
    expect((firstRowChildren[0].props as any).children).toBe('1');
  });
});

describe('node-renderer — Props and Components', () => {
  it('handles custom components from options', () => {
    const CustomBtn = () => <button>Custom</button>;
    const ctx = { ...defaultCtx, options: { components: { CustomBtn } } };
    const node: AnalyzedNode = { type: 'CustomBtn' };
    
    const element = renderNode(node, ctx) as React.ReactElement;
    expect(element.type).toBe(CustomBtn);
  });

  it('handles nested style objects in props', () => {
    const node: AnalyzedNode = { type: 'div', props: { style: { color: 'red', margin: 10 } } };
    const element = renderNode(node, defaultCtx) as React.ReactElement;
    expect((element.props as any).style).toEqual({ color: 'red', margin: 10 });
  });

  it('handles unresolved action bindings gracefully without crashing render', () => {
    // resolveSingleProp will catch ActionBinding and try resolveHandler.
    // If missing, resolveHandler emits warn and returns undefined.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const node: AnalyzedNode = { type: 'button', props: { onClick: { action: 'missing' } } };
    
    const element = renderNode(node, defaultCtx) as React.ReactElement;
    expect((element.props as any).onClick).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('node-renderer — $slot special node', () => {
  it('returns ctx.props.children when present', () => {
    const childElement = React.createElement('span', { 'data-testid': 'child' }, 'hello');
    const ctx: RenderContext = {
      ...defaultCtx,
      props: { children: childElement },
    };
    const node: AnalyzedNode = { type: '$slot' };
    const result = renderNode(node, ctx);
    expect(result).toBe(childElement);
  });

  it('returns null when ctx.props.children is not provided', () => {
    const ctx: RenderContext = { ...defaultCtx, props: {} };
    const node: AnalyzedNode = { type: '$slot' };
    expect(renderNode(node, ctx)).toBeNull();
  });

  it('does NOT treat $slot as an HTML tag', () => {
    const node: AnalyzedNode = { type: '$slot' };
    const result = renderNode(node, defaultCtx);
    // Should be null (no children), NOT a React element with type '$slot'
    expect(result).toBeNull();
  });

  it('$slot nested inside another node outputs the children there', () => {
    const childElement = React.createElement('em', null, 'slotted');
    const ctx: RenderContext = {
      ...defaultCtx,
      props: { children: childElement },
    };
    // Wrap: div > $slot
    const wrapper: AnalyzedNode = {
      type: 'div',
      props: { 'data-testid': 'wrapper' },
      children: [{ type: '$slot' }],
    };
    const { container } = render(renderNode(wrapper, ctx) as React.ReactElement);
    expect(container.querySelector('em')?.textContent).toBe('slotted');
  });
});

describe('node-renderer — Dynamic type & dynamic prop key via {{ }}', () => {
  it('resolves {{ }} in node.type to a string HTML tag', () => {
    const ctx = { ...defaultCtx, state: { tag: 'section' } };
    const node: AnalyzedNode = { type: '{{ state.tag }}', children: ['hello'] };
    const element = renderNode(node, ctx) as React.ReactElement;
    expect(element.type).toBe('section');
  });

  it('resolves {{ }} in node.type to a registered custom component', () => {
    const NavLink = (props: any) => <a {...props} />;
    const ctx: RenderContext = {
      ...defaultCtx,
      state: { isInternal: true },
      options: { components: { NavLink } },
    };
    const node: AnalyzedNode = {
      type: "{{ state.isInternal ? 'NavLink' : 'a' }}",
      props: { href: '/home' },
      children: ['Home'],
    };
    const element = renderNode(node, ctx) as React.ReactElement;
    expect(element.type).toBe(NavLink);
  });

  it('switches to <a> when isInternal is false', () => {
    const NavLink = (props: any) => <a {...props} />;
    const ctx: RenderContext = {
      ...defaultCtx,
      state: { isInternal: false },
      options: { components: { NavLink } },
    };
    const node: AnalyzedNode = {
      type: "{{ state.isInternal ? 'NavLink' : 'a' }}",
      props: { href: 'https://example.com' },
      children: ['External'],
    };
    const element = renderNode(node, ctx) as React.ReactElement;
    expect(element.type).toBe('a');
  });

  it('resolves {{ }} in a prop key name', () => {
    const ctx = { ...defaultCtx, state: { attrName: 'data-testid' } };
    const node: AnalyzedNode = {
      type: 'div',
      props: { '{{ state.attrName }}': 'my-div' },
    };
    const element = renderNode(node, ctx) as React.ReactElement;
    expect((element.props as any)['data-testid']).toBe('my-div');
  });

  it('resolves dynamic className via {{ }} expression in prop value', () => {
    const ctx = { ...defaultCtx, state: { theme: 'dark' } };
    const node: AnalyzedNode = {
      type: 'div',
      props: { className: "{{ state.theme === 'dark' ? 'bg-black text-white' : 'bg-white text-black' }}" },
    };
    const element = renderNode(node, ctx) as React.ReactElement;
    expect((element.props as any).className).toBe('bg-black text-white');
  });
});

describe('node-renderer — Non-blocking Error Handling', () => {
  it('isolates a node failure when its type resolution fails', () => {
    // Mocking an erroring expression for the type
    const ctx = { ...defaultCtx, state: { bad: undefined } };
    // Accessing property of undefined throws in our evaluator
    const node: AnalyzedNode = { 
      type: 'div',
      children: [
        { type: "{{ state.bad.property }}", children: ['bad node'] },
        { type: 'span', children: ['good node'] }
      ]
    };

    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const element = renderNode(node, ctx) as React.ReactElement;
    const children = (element.props as any).children as React.ReactNode[];

    // First child should be the Error Fallback (since we are in test/dev mode)
    expect(children[0]).not.toBeNull();
    // Second child should render normally
    expect((children[1] as any).type).toBe('span');
    expect((children[1] as any).props.children).toBe('good node');
    
    warnSpy.mockRestore();
  });

  it('isolates failure when a text child expression fails', () => {
    const ctx = { ...defaultCtx, state: { bad: undefined } };
    const node: AnalyzedNode = { 
      type: 'div',
      children: [
        // Using an actual syntax error to ensure it throws a SafeEvalError
        "Status: {{ a + }}",
        " - All systems go"
      ]
    };

    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const element = renderNode(node, ctx) as React.ReactElement;
    const children = (element.props as any).children as string[];

    // First text node should contain the empty string (silent/caught failure)
    // because expression-resolver is lenient with safe-evaluator errors.
    expect(children[0]).toBe('Status: ');
    // Second text node should be intact
    expect(children[1]).toBe(' - All systems go');
    
    warnSpy.mockRestore();
  });

  it('silences errors in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    const ctx = { ...defaultCtx, state: { bad: undefined } };
    const node: AnalyzedNode = { 
      // This will fail my regex check and throw a controlled error
      type: "1-invalid-tag",
      children: ["{{ state.bad.text }}"]
    };

    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = renderNode(node, ctx) as React.ReactElement;

    const { container } = render(result);
    // In production, NodeErrorFallback returns null, so container should be empty.
    expect(container.innerHTML).toBe('');

    warnSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it('catches invalid component types (non-string, non-function)', () => {
    const ctx = { ...defaultCtx, state: { myType: 123 } };
    // result of expression will be 123 (number), which fails strict check
    const node: AnalyzedNode = { type: '{{ state.myType }}' };

    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = renderNode(node, ctx) as React.ReactElement;
    
    // Should render Error Fallback instead of crashing React
    const { getByText } = render(result);
    expect(getByText(/Invalid/)).toBeTruthy();

    warnSpy.mockRestore();
  });
});
