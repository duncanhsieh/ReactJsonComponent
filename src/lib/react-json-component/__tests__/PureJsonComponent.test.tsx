/**
 * PureJsonComponent.test.tsx
 *
 * Unit tests for the stateless CMS component factory.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PureJsonComponent } from '../react/PureJsonComponent';
import { ReactJsonRenderer } from '../react/ReactJsonRenderer';
import type { JsonASTNode } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mount(ui: React.ReactElement) {
  return render(ui);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PureJsonComponent — basic rendering', () => {
  it('renders a simple static template', () => {
    const Title = PureJsonComponent({
      type: 'h1',
      props: { 'data-testid': 'title', className: 'cms-title' },
      children: ['Static Heading'],
    });

    mount(<Title />);
    expect(screen.getByTestId('title').textContent).toBe('Static Heading');
  });

  it('exposes consumer props via {{ props.xxx }} expressions', () => {
    const Greeting = PureJsonComponent({
      type: 'p',
      props: { 'data-testid': 'greeting' },
      children: ['Hello, {{ props.name }}!'],
    });

    mount(<Greeting name="World" />);
    expect(screen.getByTestId('greeting').textContent).toBe('Hello, World!');
  });

  it('renders $slot with consumer children', () => {
    const Card = PureJsonComponent({
      type: 'div',
      props: { 'data-testid': 'card' },
      children: [{ type: '$slot' }],
    });

    mount(
      <Card>
        <span data-testid="inner">child content</span>
      </Card>,
    );

    expect(screen.getByTestId('card')).toBeDefined();
    expect(screen.getByTestId('inner').textContent).toBe('child content');
  });

  it('renders $slot as null when no children are provided', () => {
    const Wrapper = PureJsonComponent({
      type: 'div',
      props: { 'data-testid': 'wrapper' },
      children: [{ type: '$slot' }],
    });

    mount(<Wrapper />);
    expect(screen.getByTestId('wrapper').textContent).toBe('');
  });

  it('combines props and $slot in one template', () => {
    const Section = PureJsonComponent({
      type: 'section',
      props: { 'data-testid': 'section' },
      children: [
        { type: 'h2', props: { 'data-testid': 'heading' }, children: ['{{ props.title }}'] },
        { type: 'div', props: { 'data-testid': 'body' }, children: [{ type: '$slot' }] },
      ],
    });

    mount(
      <Section title="My Section">
        <p data-testid="para">paragraph</p>
      </Section>,
    );

    expect(screen.getByTestId('heading').textContent).toBe('My Section');
    expect(screen.getByTestId('para').textContent).toBe('paragraph');
  });
});

describe('PureJsonComponent — nested components option', () => {
  it('uses inner components registry from options', () => {
    function Bold({ children }: { children?: React.ReactNode }) {
      return <strong data-testid="bold">{children}</strong>;
    }

    const Template = PureJsonComponent(
      {
        type: 'div',
        children: [{ type: 'Bold', children: ['formatted'] }],
      },
      { components: { Bold: Bold as any } },
    );

    mount(<Template />);
    expect(screen.getByTestId('bold').textContent).toBe('formatted');
  });
});

describe('PureJsonComponent — usage in ReactJsonRenderer options.components', () => {
  it('can be used as a component inside a parent ReactJsonRenderer template', () => {
    const Title = PureJsonComponent({
      type: 'h1',
      props: { 'data-testid': 'cms-title' },
      children: ['{{ props.text }}'],
    });

    const pageTemplate: JsonASTNode = {
      type: 'div',
      children: [
        {
          type: 'Title',
          props: { text: 'CMS Heading' },
        },
      ],
    };

    mount(
      <ReactJsonRenderer
        template={pageTemplate}
        options={{ components: { Title: Title as any } }}
      />,
    );

    expect(screen.getByTestId('cms-title').textContent).toBe('CMS Heading');
  });

  it('passes children into $slot when used in ReactJsonRenderer', () => {
    const Card = PureJsonComponent({
      type: 'article',
      props: { 'data-testid': 'card' },
      children: [{ type: '$slot' }],
    });

    const pageTemplate: JsonASTNode = {
      type: 'div',
      children: [
        {
          type: 'Card',
          children: [{ type: 'span', props: { 'data-testid': 'slot-child' }, children: ['slot text'] }],
        },
      ],
    };

    mount(
      <ReactJsonRenderer
        template={pageTemplate}
        options={{ components: { Card: Card as any } }}
      />,
    );

    expect(screen.getByTestId('card')).toBeDefined();
    expect(screen.getByTestId('slot-child').textContent).toBe('slot text');
  });
});
