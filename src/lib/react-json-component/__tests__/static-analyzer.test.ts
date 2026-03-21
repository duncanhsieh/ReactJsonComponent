/**
 * static-analyzer.test.ts
 *
 * Tests for the static node hoisting pre-pass analyzer.
 */

import { describe, it, expect } from 'vitest';
import { analyzeNode, isStaticNode } from '../static-analyzer';
import type { JsonASTNode } from '../types';

describe('analyzeNode — static nodes', () => {
  it('marks a plain node with no expressions as static', () => {
    const node: JsonASTNode = {
      type: 'div',
      props: { className: 'container' },
      children: ['Hello World'],
    };
    const result = analyzeNode(node);
    expect(result.isStatic).toBe(true);
    expect(isStaticNode(result)).toBe(true);
  });

  it('marks a nested fully-static tree as static', () => {
    const node: JsonASTNode = {
      type: 'section',
      children: [
        {
          type: 'h1',
          children: ['Title'],
        },
        {
          type: 'p',
          props: { className: 'body' },
          children: ['Paragraph text.'],
        },
      ],
    };
    const result = analyzeNode(node);
    expect(result.isStatic).toBe(true);
  });
});

describe('analyzeNode — dynamic nodes', () => {
  it('marks a node with {{ }} in props as NOT static', () => {
    const node: JsonASTNode = {
      type: 'div',
      props: { className: '{{ state.theme }}' },
    };
    const result = analyzeNode(node);
    expect(result.isStatic).toBe(false);
  });

  it('marks a node with {{ }} in text children as NOT static', () => {
    const node: JsonASTNode = {
      type: 'p',
      children: ['Count: {{ state.count }}'],
    };
    const result = analyzeNode(node);
    expect(result.isStatic).toBe(false);
  });

  it('marks a node with ActionBinding as NOT static', () => {
    const node: JsonASTNode = {
      type: 'button',
      props: { onClick: { action: 'increment' } },
      children: ['Click me'],
    };
    const result = analyzeNode(node);
    expect(result.isStatic).toBe(false);
  });

  it('marks a node with $if directive as NOT static', () => {
    const node: JsonASTNode = {
      type: 'div',
      $if: '{{ state.show }}',
      children: ['Visible'],
    };
    const result = analyzeNode(node);
    expect(result.isStatic).toBe(false);
  });

  it('marks a node with $each directive as NOT static', () => {
    const node: JsonASTNode = {
      type: 'li',
      $each: '{{ state.items }}',
      children: ['{{ item }}'],
    };
    const result = analyzeNode(node);
    expect(result.isStatic).toBe(false);
  });

  it('marks a parent as NOT static when a child is dynamic', () => {
    const node: JsonASTNode = {
      type: 'div',
      props: { className: 'wrapper' },
      children: [
        {
          type: 'span',
          children: ['Dynamic: {{ state.count }}'],
        },
      ],
    };
    const result = analyzeNode(node);
    expect(result.isStatic).toBe(false);
  });
});

describe('analyzeNode — preserves children analysis', () => {
  it('correctly marks mixed children', () => {
    const node: JsonASTNode = {
      type: 'div',
      children: [
        {
          type: 'h1',
          children: ['Static Title'],
        },
        {
          type: 'p',
          children: ['Dynamic: {{ state.count }}'],
        },
      ],
    };
    const result = analyzeNode(node);

    // Parent is dynamic (due to dynamic child)
    expect(result.isStatic).toBe(false);

    // First child should be static
    const firstChild = result.children?.[0];
    if (typeof firstChild !== 'string') {
      expect(firstChild?.isStatic).toBe(true);
    }
  });
});
