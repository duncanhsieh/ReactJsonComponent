/**
 * ReactJsonRenderer.test.tsx
 *
 * Tests for the CMS-friendly high-level renderer with auto component resolution.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactJsonRenderer } from '../react/ReactJsonRenderer';
import type { JsonASTNode, ActionRegistry, JsonComponentDefinition } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTemplate(
  template: JsonASTNode,
  options: Parameters<typeof ReactJsonRenderer>[0]['options'] = {},
) {
  return render(<ReactJsonRenderer template={template} options={options} />);
}

// ---------------------------------------------------------------------------
// 1. Native React components pass-through
// ---------------------------------------------------------------------------

describe('ReactJsonRenderer — native React component pass-through', () => {
  it('renders a native React component from components map', () => {
    function Badge({ label }: Record<string, unknown>) {
      return <span data-testid="badge">{String(label)}</span>;
    }

    const template: JsonASTNode = {
      type: 'Badge',
      props: { label: 'CMS Badge' },
    };

    renderTemplate(template, { components: { Badge: Badge as any } });
    expect(screen.getByTestId('badge').textContent).toBe('CMS Badge');
  });

  it('mixes native components with state and actions', () => {
    function Icon({ name }: Record<string, unknown>) {
      return <i data-testid="icon">{String(name)}</i>;
    }

    const registry: ActionRegistry = {
      inc: (state, setState) => setState({ n: (state.n as number) + 1 }),
    };

    const template: JsonASTNode = {
      type: 'div',
      children: [
        { type: 'Icon', props: { name: '{{ state.n }}' } },
        { type: 'button', props: { 'data-testid': 'btn', onClick: { action: 'inc' } }, children: ['+'] },
      ],
    };

    renderTemplate(template, {
      components: { Icon: Icon as any },
      actionRegistry: registry,
      initialState: { n: 0 },
    });

    expect(screen.getByTestId('icon').textContent).toBe('0');
    fireEvent.click(screen.getByTestId('btn'));
    expect(screen.getByTestId('icon').textContent).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// 2. JSON stateless component (PureJsonComponent auto-factory)
// ---------------------------------------------------------------------------

describe('ReactJsonRenderer — JSON stateless component', () => {
  it('auto-creates a PureJsonComponent factory for stateless: false', () => {
    const components = {
      Title: {
        template: {
          type: 'h1',
          props: { 'data-testid': 'title' },
          children: ['{{ props.text }}'],
        },
      } satisfies JsonComponentDefinition,
    };

    const template: JsonASTNode = {
      type: 'Title',
      props: { text: 'Hello from JSON' },
    };

    renderTemplate(template, { components });
    expect(screen.getByTestId('title').textContent).toBe('Hello from JSON');
  });

  it('JSON stateless component renders $slot', () => {
    const components = {
      Card: {
        template: {
          type: 'div',
          props: { 'data-testid': 'card' },
          children: [{ type: '$slot' }],
        },
      } satisfies JsonComponentDefinition,
    };

    const template: JsonASTNode = {
      type: 'Card',
      children: [{ type: 'p', props: { 'data-testid': 'content' }, children: ['Inner text'] }],
    };

    renderTemplate(template, { components });
    expect(screen.getByTestId('card')).toBeDefined();
    expect(screen.getByTestId('content').textContent).toBe('Inner text');
  });
});

// ---------------------------------------------------------------------------
// 3. JSON stateful component (ReactJsonComponent auto-factory)
// ---------------------------------------------------------------------------

describe('ReactJsonRenderer — JSON stateful component', () => {
  it('auto-creates a ReactJsonComponent factory for stateful: true', () => {
    const components = {
      Counter: {
        stateful: true,
        options: {
          initialState: { count: 0 },
          actionRegistry: {
            inc: (state: any, setState: any) => setState({ count: state.count + 1 }),
          },
        },
        template: {
          type: 'div',
          children: [
            { type: 'span', props: { 'data-testid': 'count' }, children: ['{{ state.count }}'] },
            { type: 'button', props: { 'data-testid': 'btn', onClick: { action: 'inc' } }, children: ['+'] },
          ],
        },
      } satisfies JsonComponentDefinition,
    };

    const template: JsonASTNode = { type: 'Counter' };
    renderTemplate(template, { components });

    expect(screen.getByTestId('count').textContent).toBe('0');
    fireEvent.click(screen.getByTestId('btn'));
    expect(screen.getByTestId('count').textContent).toBe('1');
    fireEvent.click(screen.getByTestId('btn'));
    expect(screen.getByTestId('count').textContent).toBe('2');
  });
});

// ---------------------------------------------------------------------------
// 4. Inter-component dependency resolution
// ---------------------------------------------------------------------------

describe('ReactJsonRenderer — inter-component dependency resolution', () => {
  it('resolves A → B → C dependency chain automatically', () => {
    /**
     * MyPanel renders MyHeader (JSON) + $slot
     * MyHeader renders a native Icon + props.title
     */
    function Icon({ name }: Record<string, unknown>) {
      return <i data-testid={`icon-${name}`}>{String(name)}</i>;
    }

    const components = {
      Icon: Icon as any,
      MyHeader: {
        template: {
          type: 'div',
          props: { 'data-testid': 'header' },
          children: [
            { type: 'Icon', props: { name: 'star' } },
            { type: 'span', props: { 'data-testid': 'header-title' }, children: ['{{ props.title }}'] },
          ],
        },
      } satisfies JsonComponentDefinition,
      MyPanel: {
        template: {
          type: 'section',
          props: { 'data-testid': 'panel' },
          children: [
            { type: 'MyHeader', props: { title: 'Panel Title' } },
            { type: '$slot' },
          ],
        },
      } satisfies JsonComponentDefinition,
    };

    const template: JsonASTNode = {
      type: 'MyPanel',
      children: [{ type: 'p', props: { 'data-testid': 'body' }, children: ['Body content'] }],
    };

    renderTemplate(template, { components });

    expect(screen.getByTestId('panel')).toBeDefined();
    expect(screen.getByTestId('header')).toBeDefined();
    expect(screen.getByTestId('icon-star').textContent).toBe('star');
    expect(screen.getByTestId('header-title').textContent).toBe('Panel Title');
    expect(screen.getByTestId('body').textContent).toBe('Body content');
  });

  it('resolves stateful component that uses a stateless child', () => {
    const components = {
      Tag: {
        template: {
          type: 'span',
          props: { 'data-testid': 'tag', className: '{{ props.color }}' },
          children: ['{{ props.label }}'],
        },
      } satisfies JsonComponentDefinition,
      TagList: {
        stateful: true,
        options: { initialState: { active: 'red' } },
        template: {
          type: 'div',
          children: [
            { type: 'Tag', props: { label: '{{ state.active }}', color: '{{ state.active }}' } },
          ],
        },
      } satisfies JsonComponentDefinition,
    };

    const template: JsonASTNode = { type: 'TagList' };
    renderTemplate(template, { components });
    expect(screen.getByTestId('tag').textContent).toBe('red');
  });
});

// ---------------------------------------------------------------------------
// 5. Mixed React + JSON components
// ---------------------------------------------------------------------------

describe('ReactJsonRenderer — mixed React + JSON components', () => {
  it('can compose native and JSON components together', () => {
    function Divider() {
      return <hr data-testid="divider" />;
    }

    const components = {
      Divider: Divider as any,
      Section: {
        template: {
          type: 'div',
          props: { 'data-testid': 'section' },
          children: [
            { type: 'Divider' },
            { type: '$slot' },
          ],
        },
      } satisfies JsonComponentDefinition,
    };

    const template: JsonASTNode = {
      type: 'Section',
      children: [{ type: 'p', props: { 'data-testid': 'text' }, children: ['Hello CMS'] }],
    };

    renderTemplate(template, { components });
    expect(screen.getByTestId('section')).toBeDefined();
    expect(screen.getByTestId('divider')).toBeDefined();
    expect(screen.getByTestId('text').textContent).toBe('Hello CMS');
  });
});

// ---------------------------------------------------------------------------
// 6. displayName
// ---------------------------------------------------------------------------

describe('ReactJsonRenderer — displayName', () => {
  it('has the correct displayName', () => {
    expect(ReactJsonRenderer.displayName).toBe('ReactJsonRenderer');
  });
});
