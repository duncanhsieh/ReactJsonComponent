/**
 * react/index.ts — Public API for pure React (non-Next.js) usage.
 *
 * Use this entry point in admin dashboards, Vite apps, CRA apps, etc.
 * Does NOT require Next.js as a dependency.
 *
 * Usage:
 *   import { ReactJsonRenderer } from 'next-json-component/react';
 *   // or for local development:
 *   import { ReactJsonRenderer } from '@/lib/next-json-component/react';
 */

// Main component
export { ReactJsonRenderer } from './ReactJsonRenderer';
export type { ReactJsonRendererProps } from './ReactJsonRenderer';

// Component factories
export { PureJsonComponent } from './PureJsonComponent';
export type { PureJsonComponentOptions } from './PureJsonComponent';
export { createJsonComponent } from './createJsonComponent';
export type { CreateJsonComponentOptions } from './createJsonComponent';

// Types
export type {
  JsonASTNode,
  AnalyzedNode,
  ActionBinding,
  JsonPropValue,
  ActionRegistry,
  RegistryAction,
  SetStateFn,
  ScopedStoreState,
  NextJsonComponentOptions,
  RenderContext,
} from '../types';

// Core utilities (for advanced usage)
export { analyzeTree, analyzeNode, isStaticNode } from '../static-analyzer';
export {
  createBoundHandler,
  validateRegistry,
  UnregisteredActionError,
} from '../action-registry';
export { safeEval, SafeEvalError } from '../safe-evaluator';
export { resolveExpression, isExpression } from '../expression-resolver';
