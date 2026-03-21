'use client';

import React from 'react';
import type { ErrorBoundaryProps, ErrorBoundaryState } from '../types';

/**
 * FallbackUI shown when a dynamic component fails to render.
 */
const FallbackUI: React.FC<{ error?: Error | null }> = ({ error }) => (
  <div
    style={{
      padding: '16px',
      border: '1px solid #e74c3c',
      borderRadius: '4px',
      backgroundColor: '#fdf0ef',
      color: '#c0392b',
      fontFamily: 'monospace',
      fontSize: '14px',
    }}
  >
    <strong>ReactJsonComponent 渲染錯誤</strong>
    {error && (
      <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap', fontSize: '12px' }}>
        {error.message}
      </pre>
    )}
  </div>
);

/**
 * React Error Boundary that catches rendering errors in dynamic components
 * and displays a fallback UI instead of crashing the entire React tree.
 *
 * Must be a class component — hooks cannot be used in error boundaries.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ReactJsonComponent] Render error caught by ErrorBoundary:', error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }
      return <FallbackUI error={this.state.error} />;
    }
    return this.props.children;
  }
}
