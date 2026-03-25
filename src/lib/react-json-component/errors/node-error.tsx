'use client';

import React from 'react';
import type { JsonASTNode } from '../types';

declare const process: any;

/**
 * Fallback UI for a single node that failed to render.
 */
export const NodeErrorFallback: React.FC<{ node: JsonASTNode; error: Error }> = ({
  node,
  error,
}) => {
  // In production, we typically want to fail silently at the node level
  // to avoid showing "broken" red boxes to end users.
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div
      style={{
        border: '1px dashed #e74c3c',
        padding: '8px',
        margin: '4px 0',
        borderRadius: '4px',
        backgroundColor: '#fff5f5',
        color: '#c0392b',
        fontSize: '12px',
        fontFamily: 'monospace',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
        [ReactJsonComponent] Render Error
      </div>
      <div>
        <strong>Type:</strong> {node.type}
      </div>
      <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>
        <strong>Error:</strong> {error.message}
      </div>
    </div>
  );
};

/**
 * Creates a React element for the node's error state.
 */
export function createNodeErrorElement(
  node: JsonASTNode,
  error: Error,
  key?: string
): React.ReactElement {
  return React.createElement(NodeErrorFallback, {
    key: key ? `${key}_error` : undefined,
    node,
    error,
  });
}
