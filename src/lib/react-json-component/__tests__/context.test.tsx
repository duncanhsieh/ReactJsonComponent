/**
 * context.test.tsx
 *
 * Unit tests for the context bidirectional support implementation.
 */

import React, { createContext } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactJsonRenderer } from '../react/ReactJsonRenderer';
import type { JsonASTNode } from '../types';

export const ThemeContext = createContext('light');

const ThemeProvider: React.FC<any> = ({ value, children }) => (
  <ThemeContext.Provider value={value}>
    {children}
  </ThemeContext.Provider>
);

describe('Context Support', () => {
  it('supplies context values to child json expressions', () => {
    const template: JsonASTNode = {
      type: 'ThemeProvider',
      contextName: 'theme',
      props: {
        value: 'dark',
      },
      children: [
        {
          type: 'div',
          props: { 'data-testid': 'inner' },
          children: ['Current Theme: {{ context.theme }}'],
        },
      ],
    };

    render(
      <ReactJsonRenderer
        template={template}
        options={{ components: { ThemeProvider } }}
      />
    );

    const inner = screen.getByTestId('inner');
    expect(inner.textContent).toBe('Current Theme: dark');
  });

  it('correctly branches context overrides (scoping)', () => {
    const template: JsonASTNode = {
      type: 'div',
      children: [
        {
          type: 'ThemeProvider',
          contextName: 'theme',
          props: { value: 'dark' },
          children: [
            {
              type: 'div',
              props: { 'data-testid': 'dark-block' },
              children: ['{{ context.theme }}'], // 'dark'
            },
            {
              // Nested override
              type: 'ThemeProvider',
              contextName: 'theme',
              props: { value: 'light' },
              children: [
                {
                  type: 'div',
                  props: { 'data-testid': 'light-block' },
                  children: ['{{ context.theme }}'], // 'light'
                },
              ],
            },
            {
              type: 'div', // Parent's remaining children shouldn't be affected by nested override
              props: { 'data-testid': 'dark-block-2' },
              children: ['{{ context.theme }}'], // 'dark'
            },
          ]
        },
        {
          // Sibling element - shouldn't see context
          type: 'div',
          props: { 'data-testid': 'sibling-block' },
          children: ['{{ context.theme || "undefined" }}'],
        }
      ]
    };

    render(
      <ReactJsonRenderer
        template={template}
        options={{ components: { ThemeProvider } }}
      />
    );

    expect(screen.getByTestId('dark-block').textContent).toBe('dark');
    expect(screen.getByTestId('light-block').textContent).toBe('light');
    expect(screen.getByTestId('dark-block-2').textContent).toBe('dark');
    expect(screen.getByTestId('sibling-block').textContent).toBe('undefined');
  });
});
