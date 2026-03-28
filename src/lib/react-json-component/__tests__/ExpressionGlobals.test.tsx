/**
 * ExpressionGlobals.test.tsx
 *
 * Tests for global library/utility injection into the expression evaluation scope.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactJsonRenderer } from '../react/ReactJsonRenderer';
import { createComponentRegistry } from '../component-registry';
import type { JsonASTNode, JsonComponentDefinition } from '../types';

// Mock libraries
const mockLodash = {
  upperCase: (str: string) => str.toUpperCase(),
  add: (a: number, b: number) => a + b,
};

const mockCalendar = {
  toRocYear: (year: number) => year - 1911,
};

describe('Expression Globals Injection', () => {
  it('allows access to global libraries in expressions at the top level', () => {
    const template: JsonASTNode = {
      type: 'div',
      children: [
        { type: 'span', props: { 'data-testid': 'calc' }, children: ['{{ _.add(5, 10) }}'] },
        { type: 'span', props: { 'data-testid': 'case' }, children: ["{{ _.upperCase('hello') }}"] },
      ],
    };

    render(
      <ReactJsonRenderer
        template={template}
        options={{
          globals: { _: mockLodash }
        }}
      />
    );

    expect(screen.getByTestId('calc').textContent).toBe('15');
    expect(screen.getByTestId('case').textContent).toBe('HELLO');
  });

  it('allows access to globals inside JSON-defined components (automatic resolution)', () => {
    const components = {
      YearBadge: {
        template: {
          type: 'span',
          props: { 'data-testid': 'roc-year' },
          children: ['{{ cal.toRocYear(props.year) }}'],
        },
      } satisfies JsonComponentDefinition,
    };

    const template: JsonASTNode = {
      type: 'YearBadge',
      props: { year: 2024 },
    };

    render(
      <ReactJsonRenderer
        template={template}
        options={{
          globals: { cal: mockCalendar },
          components
        }}
      />
    );

    // 2024 - 1911 = 113
    expect(screen.getByTestId('roc-year').textContent).toBe('113');
  });

  it('works with createComponentRegistry', () => {
    const registry = createComponentRegistry(
      {
        Greet: {
          template: {
            type: 'p',
            props: { 'data-testid': 'greet' },
            children: ["{{ _.upperCase('welcome') }} {{ props.name }}!"],
          },
        },
      },
      { _: mockLodash }
    );

    const template: JsonASTNode = {
      type: 'Greet',
      props: { name: 'Dan' },
    };

    render(<ReactJsonRenderer template={template} registry={registry} />);

    expect(screen.getByTestId('greet').textContent).toBe('WELCOME Dan!');
  });

  it('updates evaluation when globals reference changes (WeakMap cache invalidation)', () => {
    const components = {
      Display: {
        template: {
          type: 'div',
          props: { 'data-testid': 'val' },
          children: ['{{ utils.val }}'],
        },
      },
    };

    const template: JsonASTNode = { type: 'Display' };

    const { rerender } = render(
      <ReactJsonRenderer
        template={template}
        options={{
          components,
          globals: { utils: { val: 'first' } }
        }}
      />
    );
    expect(screen.getByTestId('val').textContent).toBe('first');

    // Rerender with NEW globals reference
    rerender(
      <ReactJsonRenderer
        template={template}
        options={{
          components,
          globals: { utils: { val: 'second' } }
        }}
      />
    );
    expect(screen.getByTestId('val').textContent).toBe('second');
  });
});
