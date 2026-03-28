/**
 * ReactJsonRuntime.tsx
 *
 * A framework-agnostic React component for rendering JSON AST templates.
 * Designed for use in pure React environments (e.g. Vite + React, CRA)
 * without any Next.js dependency.
 *
 * This serves as the stateful "Runtime" or "Execution Environment" for the JSON AST.
 * It manages the internal Zustand store, action registry, and render context.
 *
 * Usage:
 *   import { ReactJsonRuntime } from 'react-json-component/react';
 *
 *   <ReactJsonRuntime
 *     template={myJsonAst}
 *     options={{
 *       actionRegistry: { increment: (s, set) => set({ count: s.count + 1 }) },
 *       initialState: { count: 0 },
 *     }}
 *   />
 */

import React, { useMemo } from 'react';
import type {
  JsonASTNode,
  AnalyzedNode,
  ReactJsonComponentOptions,
  RenderContext,
} from '../types';
import { createScopedStore } from '../store/store';
import { analyzeTree } from '../static-analyzer';
import { renderNode } from '../node-renderer';
import { ErrorBoundary } from '../errors/ErrorBoundary';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ReactJsonRuntimeProps {
  /** The JSON AST template to render. Accepts both raw and pre-analyzed nodes. */
  template: JsonASTNode | AnalyzedNode;
  /**
   * Component options.
   * Note: `serverActions` is not supported in React-only mode.
   * Use `actionRegistry` for all action handling.
   */
  options: Omit<ReactJsonComponentOptions, 'serverActions' | '_onStoreReady'>;
  /** Props passed from the consumer, accessible via `{{ props.xxx }}` in templates. */
  componentProps?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Static node cache — memoizes subtrees that are known to be static
// ---------------------------------------------------------------------------

function StaticSubtree({ content }: { content: React.ReactNode }) {
  return <>{content}</>;
}
const MemoizedStaticSubtree = React.memo(StaticSubtree);

// ---------------------------------------------------------------------------
// Runtime component
// ---------------------------------------------------------------------------

export const ReactJsonRuntime: React.FC<ReactJsonRuntimeProps> = React.memo(
  ({ template, options, componentProps = {} }) => {
    // Create a stable Zustand store once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const useStore = useMemo(
      () => createScopedStore(options.initialState ?? {}),
      [],
    );

    const state = useStore();

    // Analyze the template (memoized on template identity).
    // In pure React there's no Server Component to pre-analyze,
    // so we do it here.
    const analyzedTemplate = useMemo(
      () => analyzeTree(template as JsonASTNode),
      [template],
    );

    // Build render context
    const ctx: RenderContext = useMemo(
      () => ({
        state,
        setState: state.setState,
        props: componentProps,
        options: options as ReactJsonComponentOptions,
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [state, componentProps, options],
    );

    const rendered = renderNode(analyzedTemplate, ctx);

    return <ErrorBoundary>{rendered}</ErrorBoundary>;
  },
);

ReactJsonRuntime.displayName = 'ReactJsonRuntime';

/**
 * Render a static analyzed node and wrap it in React.memo.
 */
export function renderStaticNode(
  node: AnalyzedNode,
  ctx: RenderContext,
): React.ReactNode {
  const content = renderNode(node, ctx);
  return <MemoizedStaticSubtree key={node.type} content={content} />;
}
