/**
 * ReactJsonRenderer.test.tsx
 *
 * Tests for the framework-agnostic React JSON renderer.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactJsonRenderer } from '../react/ReactJsonRenderer';
import type { JsonASTNode, ActionRegistry } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTemplate(
  template: JsonASTNode,
  options: Parameters<typeof ReactJsonRenderer>[0]['options'] = {},
) {
  return render(
    <ReactJsonRenderer template={template} options={options} />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReactJsonRenderer', () => {
  // ── Basic rendering ──────────────────────────────────────────────────────

  it('renders a simple static template', () => {
    const template: JsonASTNode = {
      type: 'div',
      props: { 'data-testid': 'root' },
      children: [
        { type: 'h1', children: ['Hello, Admin!'] },
        { type: 'p', children: ['This is a static page.'] },
      ],
    };

    renderTemplate(template);
    expect(screen.getByTestId('root')).toBeDefined();
    expect(screen.getByText('Hello, Admin!')).toBeDefined();
    expect(screen.getByText('This is a static page.')).toBeDefined();
  });

  it('renders nested nodes correctly', () => {
    const template: JsonASTNode = {
      type: 'div',
      children: [
        {
          type: 'section',
          props: { 'data-testid': 'section' },
          children: [
            {
              type: 'span',
              children: ['Nested content'],
            },
          ],
        },
      ],
    };

    renderTemplate(template);
    expect(screen.getByTestId('section')).toBeDefined();
    expect(screen.getByText('Nested content')).toBeDefined();
  });

  // ── Expression interpolation ─────────────────────────────────────────────

  it('resolves {{ state.x }} expressions', () => {
    const template: JsonASTNode = {
      type: 'span',
      props: { 'data-testid': 'greeting' },
      children: ['Hello, {{ state.name }}!'],
    };

    renderTemplate(template, { initialState: { name: 'Admin' } });
    expect(screen.getByTestId('greeting').textContent).toBe('Hello, Admin!');
  });

  // ── $if conditional rendering ────────────────────────────────────────────

  it('conditionally renders with $if (true)', () => {
    const template: JsonASTNode = {
      type: 'div',
      children: [
        {
          type: 'span',
          $if: '{{ state.show }}',
          children: ['Visible'],
        },
      ],
    };

    renderTemplate(template, { initialState: { show: true } });
    expect(screen.getByText('Visible')).toBeDefined();
  });

  it('conditionally hides with $if (false)', () => {
    const template: JsonASTNode = {
      type: 'div',
      props: { 'data-testid': 'container' },
      children: [
        {
          type: 'span',
          $if: '{{ state.show }}',
          children: ['Hidden'],
        },
      ],
    };

    renderTemplate(template, { initialState: { show: false } });
    const container = screen.getByTestId('container');
    expect(container.textContent).toBe('');
  });

  // ── $each list rendering ─────────────────────────────────────────────────

  it('renders lists with $each', () => {
    const template: JsonASTNode = {
      type: 'ul',
      props: { 'data-testid': 'list' },
      children: [
        {
          type: 'li',
          $each: '{{ state.items }}',
          $as: 'item',
          children: ['{{ item }}'],
        },
      ],
    };

    renderTemplate(template, {
      initialState: { items: ['Apple', 'Banana', 'Cherry'] },
    });

    expect(screen.getByText('Apple')).toBeDefined();
    expect(screen.getByText('Banana')).toBeDefined();
    expect(screen.getByText('Cherry')).toBeDefined();
  });

  // ── ActionRegistry + State Updates ───────────────────────────────────────

  it('handles action registry and updates state', () => {
    const registry: ActionRegistry = {
      increment: (state, setState) => {
        setState({ count: (state.count as number) + 1 });
      },
    };

    const template: JsonASTNode = {
      type: 'div',
      children: [
        {
          type: 'span',
          props: { 'data-testid': 'count' },
          children: ['Count: {{ state.count }}'],
        },
        {
          type: 'button',
          props: {
            'data-testid': 'btn',
            onClick: { action: 'increment' },
          },
          children: ['Click'],
        },
      ],
    };

    renderTemplate(template, {
      actionRegistry: registry,
      initialState: { count: 0 },
    });

    expect(screen.getByTestId('count').textContent).toBe('Count: 0');

    fireEvent.click(screen.getByTestId('btn'));
    expect(screen.getByTestId('count').textContent).toBe('Count: 1');

    fireEvent.click(screen.getByTestId('btn'));
    expect(screen.getByTestId('count').textContent).toBe('Count: 2');
  });

  // ── Custom components ────────────────────────────────────────────────────

  it('resolves custom components from options.components', () => {
    function Badge({ label }: { label?: unknown }) {
      return <span data-testid="badge">{String(label)}</span>;
    }

    const template: JsonASTNode = {
      type: 'Badge',
      props: { label: 'Admin' },
    };

    renderTemplate(template, {
      components: { Badge: Badge as any },
    });

    expect(screen.getByTestId('badge').textContent).toBe('Admin');
  });

  // ── ErrorBoundary ────────────────────────────────────────────────────────

  it('catches render errors via ErrorBoundary', () => {
    function Bomb() {
      throw new Error('Boom!');
      return null;
    }

    const template: JsonASTNode = {
      type: 'Bomb',
    };

    // Should not throw; ErrorBoundary catches it
    const { container } = renderTemplate(template, {
      components: { Bomb: Bomb as any },
    });

    // ErrorBoundary renders fallback or empty — should not crash
    expect(container).toBeDefined();
  });

  // ── displayName ──────────────────────────────────────────────────────────

  it('has the correct displayName', () => {
    expect(ReactJsonRenderer.displayName).toBe('ReactJsonRenderer');
  });
});
