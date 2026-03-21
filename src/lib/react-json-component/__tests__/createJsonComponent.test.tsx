/**
 * createJsonComponent.test.tsx
 *
 * Unit tests for the stateful CMS component factory (with Zustand).
 */


import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createJsonComponent } from '../react/createJsonComponent';
import { ReactJsonRenderer } from '../react/ReactJsonRenderer';
import type { JsonASTNode, ActionRegistry } from '../types';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createJsonComponent — basic rendering', () => {
  it('renders a static template', () => {
    const Badge = createJsonComponent({
      type: 'span',
      props: { 'data-testid': 'badge' },
      children: ['Badge'],
    });

    render(<Badge />);
    expect(screen.getByTestId('badge').textContent).toBe('Badge');
  });

  it('resolves {{ props.xxx }} from consumer props', () => {
    const Label = createJsonComponent({
      type: 'p',
      props: { 'data-testid': 'label' },
      children: ['{{ props.text }}'],
    });

    render(<Label text="Hello CMS" />);
    expect(screen.getByTestId('label').textContent).toBe('Hello CMS');
  });

  it('renders $slot with consumer children', () => {
    const Panel = createJsonComponent({
      type: 'div',
      props: { 'data-testid': 'panel' },
      children: [{ type: '$slot' }],
    });

    render(
      <Panel>
        <span data-testid="slot-child">inner</span>
      </Panel>,
    );

    expect(screen.getByTestId('panel')).toBeDefined();
    expect(screen.getByTestId('slot-child').textContent).toBe('inner');
  });
});

describe('createJsonComponent — internal state & actions', () => {
  it('manages internal Zustand state', () => {
    const registry: ActionRegistry = {
      increment: (state, setState) =>
        setState({ count: (state.count as number) + 1 }),
    };

    const Counter = createJsonComponent(
      {
        type: 'div',
        children: [
          { type: 'span', props: { 'data-testid': 'count' }, children: ['{{ state.count }}'] },
          {
            type: 'button',
            props: { 'data-testid': 'btn', onClick: { action: 'increment' } },
            children: ['+'],
          },
        ],
      },
      { initialState: { count: 0 }, actionRegistry: registry },
    );

    render(<Counter />);
    expect(screen.getByTestId('count').textContent).toBe('0');
    fireEvent.click(screen.getByTestId('btn'));
    expect(screen.getByTestId('count').textContent).toBe('1');
    fireEvent.click(screen.getByTestId('btn'));
    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('mixes internal state, consumer props, and $slot', () => {
    const registry: ActionRegistry = {
      toggle: (state, setState) => setState({ open: !state.open }),
    };

    const Collapsible = createJsonComponent(
      {
        type: 'div',
        children: [
          {
            type: 'button',
            props: { 'data-testid': 'toggle', onClick: { action: 'toggle' } },
            children: ['{{ props.label }}'],
          },
          {
            type: 'div',
            props: { 'data-testid': 'content' },
            $if: '{{ state.open }}',
            children: [{ type: '$slot' }],
          },
        ],
      },
      { initialState: { open: false }, actionRegistry: registry },
    );

    render(
      <Collapsible label="Toggle">
        <span data-testid="hidden-content">Secret</span>
      </Collapsible>,
    );

    // Initially hidden
    expect(screen.queryByTestId('content')).toBeNull();
    expect(screen.getByTestId('toggle').textContent).toBe('Toggle');

    // After clicking, content appears
    fireEvent.click(screen.getByTestId('toggle'));
    expect(screen.getByTestId('content')).toBeDefined();
    expect(screen.getByTestId('hidden-content').textContent).toBe('Secret');
  });
});

describe('createJsonComponent — usage in ReactJsonRenderer options.components', () => {
  it('can be composed inside a parent ReactJsonRenderer', () => {
    const registry: ActionRegistry = {
      inc: (state, setState) => setState({ n: (state.n as number) + 1 }),
    };

    const Counter = createJsonComponent(
      {
        type: 'div',
        children: [
          { type: 'span', props: { 'data-testid': 'n' }, children: ['{{ state.n }}'] },
          { type: 'button', props: { 'data-testid': 'inc', onClick: { action: 'inc' } }, children: ['+'] },
        ],
      },
      { initialState: { n: 5 }, actionRegistry: registry },
    );

    const pageTemplate: JsonASTNode = {
      type: 'main',
      children: [
        { type: 'h1', props: { 'data-testid': 'heading' }, children: ['Page Title'] },
        { type: 'Counter' },
      ],
    };

    render(
      <ReactJsonRenderer
        template={pageTemplate}
        options={{ components: { Counter: Counter as any } }}
      />,
    );

    expect(screen.getByTestId('heading').textContent).toBe('Page Title');
    expect(screen.getByTestId('n').textContent).toBe('5');
    fireEvent.click(screen.getByTestId('inc'));
    expect(screen.getByTestId('n').textContent).toBe('6');
  });
});
