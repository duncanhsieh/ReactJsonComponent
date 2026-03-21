/**
 * ErrorBoundary.test.tsx
 *
 * Unit tests for the React ErrorBoundary component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { render } from '@testing-library/react';
import { ErrorBoundary } from '../errors/ErrorBoundary';

// A mock component that throws an error when rendered
const ThrowingComponent = ({ message }: { message: string }) => {
  throw new Error(message);
};

// A mock component that renders normally
const SafeComponent = () => <div>Safe renders fine</div>;

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Silence React's native error logging in test output, but still track it
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when there are no errors', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <SafeComponent />
      </ErrorBoundary>
    );

    expect(getByText('Safe renders fine')).toBeDefined();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('catches render errors and renders the default FallbackUI', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingComponent message="Deliberate render crash" />
      </ErrorBoundary>
    );

    // Verify fallback UI is shown
    expect(getByText('ReactJsonComponent 渲染錯誤')).toBeDefined();
    expect(getByText('Deliberate render crash')).toBeDefined();

    // Verify it logged the error
    expect(consoleErrorSpy).toHaveBeenCalled();
    const allArgs = consoleErrorSpy.mock.calls.flat();
    expect(
      allArgs.some((arg) => typeof arg === 'string' && arg.includes('[ReactJsonComponent] Render error caught by ErrorBoundary'))
    ).toBe(true);
  });

  it('renders a custom fallback if provided via props', () => {
    const CustomFallback = <div data-testid="custom-fallback">My Custom Error Handler</div>;

    const { getByTestId, queryByText } = render(
      <ErrorBoundary fallback={CustomFallback}>
        <ThrowingComponent message="Custom fallback test" />
      </ErrorBoundary>
    );

    expect(getByTestId('custom-fallback')).toBeDefined();
    // Default fallback should NOT be there
    expect(queryByText('ReactJsonComponent 渲染錯誤')).toBeNull();
  });

  it('prevents a React tree crash by isolating the error', () => {
    const { getByText } = render(
      <div>
        <header>Header works</header>
        <ErrorBoundary>
          <ThrowingComponent message="Isolate me" />
        </ErrorBoundary>
        <footer>Footer works</footer>
      </div>
    );

    // Siblings should survive the crash
    expect(getByText('Header works')).toBeDefined();
    expect(getByText('Footer works')).toBeDefined();

    // Fallback should be visible
    expect(getByText('ReactJsonComponent 渲染錯誤')).toBeDefined();
  });
});
